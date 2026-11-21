package com.personalplatform.consent.flow;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.consent.support.IntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class VaultAndIsolationTest extends IntegrationTest {

    @Test
    void attributeCrud() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "{'eu':43,'width':'wide'}", "PERSONAL");

        ownerGet(owner, "/v1/owner/vault/attributes/profile.sizes.shoe").andExpect(status().isOk())
                .andExpect(jsonPath("$.keyPath").value("profile.sizes.shoe"))
                .andExpect(jsonPath("$.value.eu").value(43))
                .andExpect(jsonPath("$.sensitivity").value("PERSONAL"));

        ownerPut(owner, "/v1/owner/vault/attributes/profile.sizes.shoe", "{'value':{'eu':44},'sensitivity':'SENSITIVE'}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value.eu").value(44))
                .andExpect(jsonPath("$.sensitivity").value("SENSITIVE"));

        putAttribute(owner, "profile.sizes.shirt", "'L'", "PUBLIC");
        putAttribute(owner, "profile.sizes_secret", "'x'", "PUBLIC");
        // prefix listing is by whole segment: profile.sizes_secret is not "under" profile.sizes
        ownerGet(owner, "/v1/owner/vault/attributes?prefix=profile.sizes").andExpect(jsonPath("$[*].keyPath",
                contains("profile.sizes.shirt", "profile.sizes.shoe")));
        ownerGet(owner, "/v1/owner/vault/attributes").andExpect(jsonPath("$", hasSize(3)));

        ownerDelete(owner, "/v1/owner/vault/attributes/profile.sizes.shoe").andExpect(status().isNoContent());
        ownerGet(owner, "/v1/owner/vault/attributes/profile.sizes.shoe").andExpect(status().isNotFound());
        ownerDelete(owner, "/v1/owner/vault/attributes/profile.sizes.shoe").andExpect(status().isNotFound());
        ownerPut(owner, "/v1/owner/vault/attributes/profile.sizes.shoe", "{'value':1,'sensitivity':'PUBLIC'}").andExpect(status().isNotFound());
    }

    @Test
    void validationAndConflicts() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "a.b", "1", "PUBLIC");
        ownerPost(owner, "/v1/owner/vault/attributes", "{'keyPath':'a.b','value':2,'sensitivity':'PUBLIC'}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ATTRIBUTE_EXISTS"));
        for (String bad : new String[] {
            "{'keyPath':'A.B','value':1,'sensitivity':'PUBLIC'}",
            "{'keyPath':'a..b','value':1,'sensitivity':'PUBLIC'}",
            "{'keyPath':'a.b:read','value':1,'sensitivity':'PUBLIC'}",
            "{'keyPath':'','value':1,'sensitivity':'PUBLIC'}",
            "{'keyPath':'c.d','sensitivity':'PUBLIC'}",
            "{'keyPath':'c.d','value':null,'sensitivity':'PUBLIC'}",
            "{'keyPath':'c.d','value':1}",
            "{'keyPath':'c.d','value':1,'sensitivity':'TOP_SECRET'}",
            "{'keyPath':'c.d','value':'" + "x".repeat(70_000) + "','sensitivity':'PUBLIC'}"
        }) {
            ownerPost(owner, "/v1/owner/vault/attributes", bad).andExpect(status().isBadRequest());
        }
        ownerGet(owner, "/v1/owner/vault/attributes/Not.Valid").andExpect(status().isBadRequest());
    }

    @Test
    void userBCannotSeeOrChangeUserAData() throws Exception {
        String alice = newOwner();
        String bob = newOwner();
        putAttribute(alice, "profile.sizes.shoe", "43", "PERSONAL");
        putAttribute(bob, "profile.sizes.shoe", "37", "PERSONAL");

        // vault: same key path, different values, no cross-visibility
        ownerGet(bob, "/v1/owner/vault/attributes/profile.sizes.shoe").andExpect(jsonPath("$.value").value(37));
        ownerGet(alice, "/v1/owner/vault/attributes/profile.sizes.shoe").andExpect(jsonPath("$.value").value(43));
        ownerPut(bob, "/v1/owner/vault/attributes/profile.sizes.shoe", "{'value':1,'sensitivity':'PUBLIC'}").andExpect(status().isOk());
        ownerGet(alice, "/v1/owner/vault/attributes/profile.sizes.shoe").andExpect(jsonPath("$.value").value(43));
        String carol = newOwner();
        ownerGet(carol, "/v1/owner/vault/attributes").andExpect(jsonPath("$", empty()));
        ownerGet(carol, "/v1/owner/vault/attributes/profile.sizes.shoe").andExpect(status().isNotFound());
        ownerDelete(carol, "/v1/owner/vault/attributes/profile.sizes.shoe").andExpect(status().isNotFound());

        // consent objects: alice's client, request and grant are invisible and untouchable for bob
        Registered aliceClient = registerClient(alice, "profile.sizes:read");
        String act = clientToken(aliceClient);
        String requestId = createRequest(act, "{'scopes':['profile.sizes:read'],'purpose':'x','durationSeconds':600}");
        ownerGet(bob, "/v1/owner/clients").andExpect(jsonPath("$", empty()));
        ownerGet(bob, "/v1/owner/clients/" + aliceClient.clientId()).andExpect(status().isNotFound());
        ownerDelete(bob, "/v1/owner/clients/" + aliceClient.clientId()).andExpect(status().isNotFound());
        ownerPost(bob, "/v1/owner/clients/" + aliceClient.clientId() + "/rotate-secret", null).andExpect(status().isNotFound());
        ownerGet(bob, "/v1/owner/requests").andExpect(jsonPath("$", empty()));
        ownerGet(bob, "/v1/owner/requests/" + requestId).andExpect(status().isNotFound());
        ownerPost(bob, "/v1/owner/requests/" + requestId + "/approve", "{}").andExpect(status().isNotFound());
        ownerPost(bob, "/v1/owner/requests/" + requestId + "/deny", null).andExpect(status().isNotFound());

        String grantId = approve(alice, requestId, "{}");
        ownerGet(bob, "/v1/owner/grants?includeInactive=true").andExpect(jsonPath("$", empty()));
        ownerPost(bob, "/v1/owner/grants/" + grantId + "/revoke", null).andExpect(status().isNotFound());
        ownerGet(alice, "/v1/owner/grants").andExpect(jsonPath("$[0].status").value("ACTIVE"));

        // audit: bob's log and chain contain nothing of alice's activity
        ownerGet(bob, "/v1/owner/access-log").andExpect(jsonPath("$[*].eventType", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("REQUEST_APPROVED"))));
        ownerGet(bob, "/v1/owner/dashboard").andExpect(jsonPath("$.activeGrants", empty())).andExpect(jsonPath("$.pendingRequests").value(0));
    }

    @Test
    void aClientOfBobCanNeverReadAlicesData_evenWithTheSameScopeAndKey() throws Exception {
        String alice = newOwner();
        String bob = newOwner();
        putAttribute(alice, "profile.sizes.shoe", "'alice-43'", "PERSONAL");
        putAttribute(bob, "profile.sizes.shoe", "'bob-37'", "PERSONAL");
        Access forAlice = grantAccess(alice, "profile.sizes:read");
        Access forBob = grantAccess(bob, "profile.sizes:read");

        readData(forBob.accessToken(), null).andExpect(jsonPath("$.attributes[0].value").value("bob-37"))
                .andExpect(jsonPath("$.attributes", hasSize(1)));
        readData(forAlice.accessToken(), null).andExpect(jsonPath("$.attributes[0].value").value("alice-43"));

        // bob's client cannot use alice's grant: not for token exchange and not by pairing tokens
        String bobClientToken = clientToken(forBob.client());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/v1/gateway/grants/" + forAlice.grantId() + "/token").header("Authorization", bearer(bobClientToken)))
                .andExpect(status().isNotFound());
        mvc.perform(get("/v1/gateway/requests/" + forAlice.requestId()).header("Authorization", bearer(bobClientToken)))
                .andExpect(status().isNotFound());
        mvc.perform(get("/v1/gateway/requests/" + UUID.randomUUID()).header("Authorization", bearer(bobClientToken)))
                .andExpect(status().isNotFound());
    }
}
