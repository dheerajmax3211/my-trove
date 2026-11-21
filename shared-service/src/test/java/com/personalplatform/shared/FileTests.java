package com.personalplatform.shared;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.shared.file.BlobStore;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;

class FileTests extends AbstractIntegrationTest {

    @Autowired BlobStore blobs;

    private static final byte[] BYTES = "hello shared files".getBytes(StandardCharsets.UTF_8);

    private String upload(String uid, UUID household) throws Exception {
        var req = multipart("/v1/files").file(new MockMultipartFile("file", "../../etc/pass wd.txt", "text/plain", BYTES));
        if (household != null) {
            req.param("householdId", household.toString());
        }
        return read(send(uid, req).andExpect(status().isCreated()), "$.id");
    }

    private String link(String uid, String fileId, int ttlSeconds) throws Exception {
        return read(postAs(uid, "/v1/files/" + fileId + "/download-link", "{\"ttlSeconds\":" + ttlSeconds + "}")
                .andExpect(status().isOk()), "$.token");
    }

    @Test
    void uploadRegistersMetadataAndStoresBytes() throws Exception {
        String alice = uid("alice");
        var res = send(alice, multipart("/v1/files").file(new MockMultipartFile("file", "dir/notes.txt", "text/plain", BYTES)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("notes.txt")) // client path stripped
                .andExpect(jsonPath("$.contentType").value("text/plain"))
                .andExpect(jsonPath("$.sizeBytes").value(BYTES.length))
                .andExpect(jsonPath("$.ownerUid").value(alice));
        String expectedSha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(BYTES));
        res.andExpect(jsonPath("$.sha256").value(expectedSha));

        String id = read(res, "$.id");
        String key = (String) dsl.fetchValue("select object_key from shared.files where id = ?::uuid", id);
        assertThat(blobs.exists(key)).isTrue();
        try (var in = blobs.open(key)) {
            assertThat(in.readAllBytes()).isEqualTo(BYTES);
        }
    }

    @Test
    void signedLinkDownloadsWithoutBearerToken() throws Exception {
        String alice = uid("alice");
        String id = upload(alice, null);
        String token = link(alice, id, 60);

        mvc.perform(get("/v1/files/download").param("token", token))
                .andExpect(status().isOk())
                .andExpect(content().bytes(BYTES))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("attachment")));
    }

    @Test
    void tamperedTokenIsRejected() throws Exception {
        String alice = uid("alice");
        String token = link(alice, upload(alice, null), 60);
        String other = link(alice, upload(alice, null), 60);

        int dot = token.indexOf('.');
        String flippedSig = token.substring(0, dot + 1) + flip(token.substring(dot + 1));
        String flippedPayload = flip(token.substring(0, dot)) + token.substring(dot);
        String payloadOfOtherFile = other.substring(0, other.indexOf('.')) + token.substring(dot); // splice

        for (String bad : new String[] {flippedSig, flippedPayload, payloadOfOtherFile, "garbage", "a.b", token + "x", "."}) {
            mvc.perform(get("/v1/files/download").param("token", bad)).andExpect(status().isForbidden());
        }
        mvc.perform(get("/v1/files/download")).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/files/download").param("token", token)).andExpect(status().isOk()); // the real one still works
    }

    @Test
    void expiredTokenIsRejected() throws Exception {
        String alice = uid("alice");
        String token = link(alice, upload(alice, null), 60);

        clock.advance(Duration.ofSeconds(59));
        mvc.perform(get("/v1/files/download").param("token", token)).andExpect(status().isOk());
        clock.advance(Duration.ofSeconds(1));
        mvc.perform(get("/v1/files/download").param("token", token)).andExpect(status().isForbidden());
    }

    @Test
    void tokenForDeletedFileStopsWorking() throws Exception {
        String alice = uid("alice");
        String id = upload(alice, null);
        String token = link(alice, id, 600);
        deleteAs(alice, "/v1/files/" + id).andExpect(status().isNoContent());
        mvc.perform(get("/v1/files/download").param("token", token)).andExpect(status().isForbidden());
    }

    @Test
    void ttlAboveTheMaximumIsRejected() throws Exception {
        String alice = uid("alice");
        String id = upload(alice, null);
        postAs(alice, "/v1/files/" + id + "/download-link", "{\"ttlSeconds\":999999}").andExpect(status().isBadRequest());
    }

    @Test
    void householdFilesAreSharedWithMembersAndOnlyOwnersOrUploadersMayDelete() throws Exception {
        String alice = uid("alice"), bob = uid("bob"), carol = uid("carol");
        UUID h = createHousehold(alice, "Home");
        join(bob, h, alice);
        join(carol, h, alice);
        String id = upload(bob, h);

        getAs(carol, "/v1/files?householdId=" + h).andExpect(jsonPath("$", hasSize(1)));
        getAs(carol, "/v1/files/" + id).andExpect(status().isOk());
        link(carol, id, 60); // any member can get a link
        deleteAs(carol, "/v1/files/" + id).andExpect(status().isForbidden());
        deleteAs(alice, "/v1/files/" + id).andExpect(status().isNoContent()); // household OWNER may
        getAs(bob, "/v1/files/" + id).andExpect(status().isNotFound());
    }

    private static String flip(String s) {
        char c = s.charAt(0);
        return (c == 'A' ? 'B' : 'A') + s.substring(1);
    }
}
