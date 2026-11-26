package com.personalplatform.shared;

import static com.personalplatform.shared.contract.ContractSchemas.assertMatches;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;

/**
 * The real service's responses match {@code contracts/shared/*.schema.json}, the same files the workspace's
 * demo-mode Household mock is checked against.
 */
class SharedContractTest extends AbstractIntegrationTest {

    private static String ok(ResultActions r) throws Exception {
        return r.andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void householdRemindersFilesAndActivityMatchTheirContracts() throws Exception {
        String alice = uid("contract-alice");
        String household = ok(postAs(alice, "/v1/households", "{\"name\":\"Home\"}"));
        String hid = JsonPath.read(household, "$.id");
        String invite = ok(postAs(alice, "/v1/households/" + hid + "/invites", "{\"role\":\"MEMBER\"}"));
        assertMatches("shared/invite-created.schema.json", invite);
        String bob = uid("contract-bob");
        ok(postAs(bob, "/v1/invites/accept", "{\"code\":\"" + JsonPath.read(invite, "$.code") + "\"}"));
        ok(postAs(alice, "/v1/households/" + hid + "/invites", "{\"role\":\"MEMBER\"}")); // one still open

        assertMatches("shared/household-list.schema.json", ok(getAs(alice, "/v1/households")));
        assertMatches("shared/household.schema.json", ok(getAs(alice, "/v1/households/" + hid)));
        assertMatches("shared/invite-list.schema.json", ok(getAs(alice, "/v1/households/" + hid + "/invites")));

        String repeating = ok(postAs(alice, "/v1/reminders", """
                {"title":"Bins","dueAt":"2031-01-01T09:00:00Z","recurrence":{"unit":"WEEKLY","interval":1},
                 "householdId":"%s"}""".formatted(hid)));
        assertMatches("shared/reminder.schema.json", repeating);
        String once = ok(postAs(alice, "/v1/reminders", "{\"title\":\"Dentist\",\"dueAt\":\"2031-02-01T09:00:00Z\"}"));
        String onceId = JsonPath.read(once, "$.id");
        assertMatches("shared/reminder.schema.json", ok(send(alice, put("/v1/reminders/" + onceId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Dentist, moved\",\"dueAt\":\"2031-02-02T09:00:00Z\"}"))));
        assertMatches("shared/reminder.schema.json", ok(postAs(alice, "/v1/reminders/" + onceId + "/cancel", "")));
        assertMatches("shared/reminder-list.schema.json", ok(getAs(alice, "/v1/reminders")));

        String file = ok(send(alice, multipart("/v1/files").file(new MockMultipartFile("file", "notes.txt", "text/plain",
                "hello".getBytes(StandardCharsets.UTF_8)))));
        assertMatches("shared/file.schema.json", file);
        String fileId = JsonPath.read(file, "$.id");
        assertMatches("shared/file-list.schema.json", ok(getAs(alice, "/v1/files")));
        assertMatches("shared/download-link.schema.json",
                ok(postAs(alice, "/v1/files/" + fileId + "/download-link", "{}")));
        assertMatches("shared/audit-page.schema.json", ok(getAs(alice, "/v1/audit?page=0&size=20")));
    }
}
