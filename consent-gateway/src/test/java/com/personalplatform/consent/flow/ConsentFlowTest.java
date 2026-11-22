package com.personalplatform.consent.flow;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.consent.support.IntegrationTest;
import java.time.Duration;
import org.junit.jupiter.api.Test;

class ConsentFlowTest extends IntegrationTest {

    @Test
    void requestApproveExchangeRead_endToEnd() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "{'eu':43}", "PERSONAL");
        putAttribute(owner, "profile.sizes.shirt", "'L'", "PERSONAL");
        putAttribute(owner, "health.allergies", "['nuts']", "SENSITIVE");

        Registered client = registerClient(owner, "profile.sizes:read");
        String ct = clientToken(client);
        String requestId = createRequest(ct, "{'scopes':['profile.sizes:read'],'purpose':'shoe sizing','durationSeconds':3600}");

        // the owner sees one pending request with the client's name, scopes and purpose
        ownerGet(owner, "/v1/owner/requests?status=PENDING")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(requestId))
                .andExpect(jsonPath("$[0].clientName").value("Shoe Shop"))
                .andExpect(jsonPath("$[0].scopes[0]").value("profile.sizes:read"))
                .andExpect(jsonPath("$[0].purpose").value("shoe sizing"));

        // nothing can be read before approval: the client has no grant to exchange
        mvc.perform(get("/v1/gateway/requests/" + requestId).header("Authorization", bearer(ct)))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.grantId").value(nullValue()));

        String grantId = approve(owner, requestId, "{}");
        mvc.perform(get("/v1/gateway/requests/" + requestId).header("Authorization", bearer(ct)))
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.grantId").value(grantId));

        String at = exchange(ct, grantId);
        readData(at, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[*].key", containsInAnyOrder("profile.sizes.shirt", "profile.sizes.shoe")))
                .andExpect(jsonPath("$.attributes[?(@.key=='profile.sizes.shoe')].value.eu").value(43))
                .andExpect(jsonPath("$.attributes[?(@.key=='health.allergies')]").isEmpty());
    }

    @Test
    void deniedRequestCannotBeExchangedAndCannotBeDecidedTwice() throws Exception {
        String owner = newOwner();
        Registered client = registerClient(owner, "profile.sizes:read");
        String ct = clientToken(client);
        String requestId = createRequest(ct, "{'scopes':['profile.sizes:read'],'purpose':'x','durationSeconds':600}");

        ownerPost(owner, "/v1/owner/requests/" + requestId + "/deny", "{'note':'no thanks'}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DENIED"))
                .andExpect(jsonPath("$.decisionNote").value("no thanks"));
        ownerPost(owner, "/v1/owner/requests/" + requestId + "/approve", "{}").andExpect(status().isConflict());
        ownerPost(owner, "/v1/owner/requests/" + requestId + "/deny", null).andExpect(status().isConflict());
        mvc.perform(get("/v1/gateway/requests/" + requestId).header("Authorization", bearer(ct)))
                .andExpect(jsonPath("$.status").value("DENIED"))
                .andExpect(jsonPath("$.grantId").value(nullValue()));
    }

    @Test
    void approvalCanOnlyNarrow() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        putAttribute(owner, "profile.sizes.shirt", "'L'", "PERSONAL");
        putAttribute(owner, "profile.address.city", "'Berlin'", "PERSONAL");
        Registered client = registerClient(owner, "profile:read");
        String ct = clientToken(client);
        String requestId = createRequest(ct,
                "{'scopes':['profile.sizes:read','profile.address:read'],'purpose':'delivery','durationSeconds':7200,'maxReads':10}");

        // broader scope, longer duration, more reads: all rejected
        ownerPost(owner, "/v1/owner/requests/" + requestId + "/approve", "{'scopes':['profile:read']}").andExpect(status().isBadRequest());
        ownerPost(owner, "/v1/owner/requests/" + requestId + "/approve", "{'scopes':['health.allergies:read']}").andExpect(status().isBadRequest());
        ownerPost(owner, "/v1/owner/requests/" + requestId + "/approve", "{'durationSeconds':7201}").andExpect(status().isBadRequest());
        ownerPost(owner, "/v1/owner/requests/" + requestId + "/approve", "{'maxReads':11}").andExpect(status().isBadRequest());

        // narrower: only shoe sizes, 10 minutes, 2 reads
        ownerPost(owner, "/v1/owner/requests/" + requestId + "/approve",
                "{'scopes':['profile.sizes.shoe:read'],'durationSeconds':600,'maxReads':2}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopes[0]").value("profile.sizes.shoe:read"))
                .andExpect(jsonPath("$.maxReads").value(2));
        String grantId = read(ownerGet(owner, "/v1/owner/grants"), "$[0].id");
        String at = exchange(ct, grantId);

        readData(at, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes", hasSize(1)))
                .andExpect(jsonPath("$.attributes[0].key").value("profile.sizes.shoe"))
                .andExpect(jsonPath("$.readsRemaining").value(1));
        readData(at, "path=profile.address.city").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.reason").value("SCOPE_NOT_GRANTED"));
    }

    @Test
    void clientCannotRequestScopesItWasNotRegisteredFor() throws Exception {
        String owner = newOwner();
        Registered client = registerClient(owner, "profile.sizes:read");
        String ct = clientToken(client);
        mvc.perform(post("/v1/gateway/requests").header("Authorization", bearer(ct)).contentType("application/json")
                        .content(json("{'scopes':['health.allergies:read'],'purpose':'x','durationSeconds':600}")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("SCOPE_NOT_ALLOWED_FOR_CLIENT"));
        // a look-alike sibling of an allowed scope is not allowed either
        mvc.perform(post("/v1/gateway/requests").header("Authorization", bearer(ct)).contentType("application/json")
                        .content(json("{'scopes':['profile.sizes_secret:read'],'purpose':'x','durationSeconds':600}")))
                .andExpect(status().isForbidden());
        // sub-scopes of an allowed scope are fine
        mvc.perform(post("/v1/gateway/requests").header("Authorization", bearer(ct)).contentType("application/json")
                        .content(json("{'scopes':['profile.sizes.shoe:read'],'purpose':'x','durationSeconds':600}")))
                .andExpect(status().isCreated());
    }

    @Test
    void requestValidation() throws Exception {
        String owner = newOwner();
        String ct = clientToken(registerClient(owner, "profile:read"));
        for (String bad : new String[] {
            "{'scopes':[],'purpose':'x','durationSeconds':600}",
            "{'scopes':['profile:read'],'purpose':' ','durationSeconds':600}",
            "{'scopes':['profile:read'],'purpose':'x','durationSeconds':5}",
            "{'scopes':['profile:write'],'purpose':'x','durationSeconds':600}",
            "{'scopes':['profile:read'],'purpose':'x','durationSeconds':600,'maxReads':0}",
            "{'scopes':['profile:read'],'purpose':'x','durationSeconds':600,'allowedHours':{'startHour':5,'endHour':5}}",
            "{'scopes':['profile:read'],'purpose':'x','durationSeconds':600,'allowedHours':{'startHour':1,'endHour':5,'zone':'Mars/Base'}}",
            "not json"
        }) {
            mvc.perform(post("/v1/gateway/requests").header("Authorization", bearer(ct)).contentType("application/json")
                            .content(json(bad)))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void scopePrefixEdgeCases_profileSizesVsProfileSizesSecret() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes", "'root'", "PERSONAL");
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        putAttribute(owner, "profile.sizes_secret", "'hidden-1'", "PERSONAL");
        putAttribute(owner, "profile.sizes_secret.code", "'hidden-2'", "PERSONAL");
        putAttribute(owner, "profile.sizesx", "'hidden-3'", "PERSONAL");
        putAttribute(owner, "profile.size", "'hidden-4'", "PERSONAL");
        putAttribute(owner, "profile", "'hidden-5'", "PERSONAL");
        Access a = grantAccess(owner, "profile.sizes:read");

        // everything the grant covers, and nothing else
        String body = readData(a.accessToken(), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[*].key", containsInAnyOrder("profile.sizes", "profile.sizes.shoe")))
                .andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("hidden");

        // a prefix query over the parent still only returns covered attributes
        String parent = readData(a.accessToken(), "path=profile").andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[*].key", containsInAnyOrder("profile.sizes", "profile.sizes.shoe")))
                .andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(parent).doesNotContain("hidden");

        // asking for the look-alike siblings directly is refused
        for (String path : new String[] {"profile.sizes_secret", "profile.sizes_secret.code", "profile.sizesx", "profile.size"}) {
            readData(a.accessToken(), "path=" + path).andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.decision").value("DENY"))
                    .andExpect(jsonPath("$.reason").value("SCOPE_NOT_GRANTED"));
        }
        // malformed path
        readData(a.accessToken(), "path=Profile..Sizes").andExpect(status().isBadRequest());
        readData(a.accessToken(), "path=profile.sizes.shoe").andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes", hasSize(1)));
    }

    @Test
    void narrowedGrantNeverLeaksTheWiderArea() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        putAttribute(owner, "profile.sizes.shirt", "'L'", "PERSONAL");
        Access a = grantAccess(owner, 3600, null, "{'scopes':['profile.sizes.shoe:read']}", "profile.sizes:read");
        readData(a.accessToken(), "path=profile.sizes").andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes", hasSize(1)))
                .andExpect(jsonPath("$.attributes[0].key").value("profile.sizes.shoe"));
        readData(a.accessToken(), "path=profile.sizes.shirt").andExpect(status().isForbidden());
    }

    @Test
    void revocationTakesEffectImmediatelyWhileTheTokenIsStillValid() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        Access a = grantAccess(owner, "profile.sizes:read");
        readData(a.accessToken(), null).andExpect(status().isOk());

        ownerPost(owner, "/v1/owner/grants/" + a.grantId() + "/revoke", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVOKED"));

        // same token, same instant, no clock movement: denied on the very next read
        readData(a.accessToken(), null).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.reason").value("GRANT_REVOKED"));
        readData(a.accessToken(), "path=profile.sizes.shoe").andExpect(status().isForbidden());
        // and a fresh token cannot be minted for it
        mvc.perform(post("/v1/gateway/grants/" + a.grantId() + "/token").header("Authorization", bearer(clientToken(a.client()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("GRANT_REVOKED"));
        // revoking again is harmless
        ownerPost(owner, "/v1/owner/grants/" + a.grantId() + "/revoke", null).andExpect(status().isOk());
        // it no longer appears among active grants, but shows as revoked when asked for
        ownerGet(owner, "/v1/owner/grants").andExpect(jsonPath("$", empty()));
        ownerGet(owner, "/v1/owner/grants?includeInactive=true").andExpect(jsonPath("$[0].status").value("REVOKED"));
    }

    @Test
    void maxReadsIsEnforcedAndCounted() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        Access a = grantAccess(owner, 3600, 2, null, "profile.sizes:read");
        readData(a.accessToken(), null).andExpect(status().isOk()).andExpect(jsonPath("$.readsRemaining").value(1));
        readData(a.accessToken(), null).andExpect(status().isOk()).andExpect(jsonPath("$.readsRemaining").value(0));
        readData(a.accessToken(), null).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.reason").value("MAX_READS_EXHAUSTED"));
        // denied attempts do not consume budget and are visible to the owner
        ownerGet(owner, "/v1/owner/grants").andExpect(jsonPath("$[0].readsUsed").value(2));
    }

    @Test
    void grantExpiryIsEnforcedEvenIfTheTokenIsStillWithinSkew() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        Access a = grantAccess(owner, 120, null, null, "profile.sizes:read");
        readData(a.accessToken(), null).andExpect(status().isOk());
        clock.advance(Duration.ofSeconds(125)); // grant over; token (capped at grant end) still inside the 30s skew
        readData(a.accessToken(), null).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.reason").value("GRANT_EXPIRED"));
        clock.advance(Duration.ofMinutes(10));
        readData(a.accessToken(), null).andExpect(status().isUnauthorized());
    }

    @Test
    void allowedHoursWindowIsEnforced() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        int hour = clock.instant().atZone(java.time.ZoneOffset.UTC).getHour();
        int start = (hour + 1) % 24;
        int end = (hour + 3) % 24;
        Registered client = registerClient(owner, "profile.sizes:read");
        String ct = clientToken(client);
        String requestId = createRequest(ct, "{'scopes':['profile.sizes:read'],'purpose':'sizing','durationSeconds':86400,"
                + "'allowedHours':{'startHour':" + start + ",'endHour':" + end + ",'zone':'UTC'}}");
        String grantId = approve(owner, requestId, "{}");
        ownerGet(owner, "/v1/owner/grants").andExpect(jsonPath("$[0].allowedHours.startHour").value(start));

        String at = exchange(ct, grantId);
        readData(at, null).andExpect(status().isForbidden()).andExpect(jsonPath("$.reason").value("OUTSIDE_ALLOWED_HOURS"));

        // move to one minute into the allowed window
        long secondsIntoHour = clock.instant().getEpochSecond() % 3600;
        clock.advance(Duration.ofSeconds(3600 - secondsIntoHour + 60));
        String ct2 = clientToken(client);
        String at2 = exchange(ct2, grantId);
        readData(at2, null).andExpect(status().isOk()).andExpect(jsonPath("$.attributes", hasSize(1)));
    }

    @Test
    void approvalCannotWidenTheRequestedHours() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        Registered client = registerClient(owner, "profile.sizes:read");
        String ct = clientToken(client);
        String requestId = createRequest(ct, "{'scopes':['profile.sizes:read'],'purpose':'sizing','durationSeconds':86400,"
                + "'allowedHours':{'startHour':9,'endHour':17,'zone':'UTC'}}");
        String path = "/v1/owner/requests/" + requestId + "/approve";

        // every hour the owner approves must have been requested: all of these widen the window
        ownerPost(owner, path, "{'allowedHours':{'startHour':0,'endHour':24,'zone':'UTC'}}").andExpect(status().isBadRequest());
        ownerPost(owner, path, "{'allowedHours':{'startHour':8,'endHour':12,'zone':'UTC'}}").andExpect(status().isBadRequest());
        ownerPost(owner, path, "{'allowedHours':{'startHour':16,'endHour':18,'zone':'UTC'}}").andExpect(status().isBadRequest());
        // the same hours in another zone are not the same hours
        ownerPost(owner, path, "{'allowedHours':{'startHour':9,'endHour':17,'zone':'Europe/Berlin'}}").andExpect(status().isBadRequest());
        // wrapping past midnight is a different set of hours too
        ownerPost(owner, path, "{'allowedHours':{'startHour':17,'endHour':9,'zone':'UTC'}}").andExpect(status().isBadRequest());

        // narrower is fine, and is what the grant then enforces
        ownerPost(owner, path, "{'allowedHours':{'startHour':10,'endHour':12,'zone':'UTC'}}")
                .andExpect(status().isOk());
        ownerGet(owner, "/v1/owner/grants").andExpect(jsonPath("$[0].allowedHours.startHour").value(10))
                .andExpect(jsonPath("$[0].allowedHours.endHour").value(12));
    }

    @Test
    void purposeMustMatchWhenStated() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        Access a = grantAccess(owner, "profile.sizes:read");
        readData(a.accessToken(), "purpose=sizing").andExpect(status().isOk());
        readData(a.accessToken(), "purpose=advertising").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.reason").value("PURPOSE_MISMATCH"));
    }

    @Test
    void sensitivityCeilingWithholdsMoreSensitiveAttributes() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.a", "'public'", "PUBLIC");
        putAttribute(owner, "profile.b", "'personal'", "PERSONAL");
        putAttribute(owner, "profile.c", "'sensitive'", "SENSITIVE");
        putAttribute(owner, "profile.d", "'restricted'", "RESTRICTED");

        // default ceiling is SENSITIVE: RESTRICTED never leaves the vault
        Access byDefault = grantAccess(owner, "profile:read");
        readData(byDefault.accessToken(), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[*].key", containsInAnyOrder("profile.a", "profile.b", "profile.c")));

        Access publicOnly = grantAccess(owner, 3600, null, "{'maxSensitivity':'PUBLIC'}", "profile:read");
        readData(publicOnly.accessToken(), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[*].key", containsInAnyOrder("profile.a")));
        // direct request for a withheld attribute: allowed call, empty result, nothing leaked
        readData(publicOnly.accessToken(), "path=profile.d").andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes", is(empty())));
    }

    @Test
    void disablingAClientRevokesEverythingAtOnce() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        Access a = grantAccess(owner, "profile.sizes:read");
        readData(a.accessToken(), null).andExpect(status().isOk());

        ownerDelete(owner, "/v1/owner/clients/" + a.client().clientId()).andExpect(status().isNoContent());

        readData(a.accessToken(), null).andExpect(status().isUnauthorized());
        tokenRequest(a.client().clientId(), a.client().clientSecret()).andExpect(status().isUnauthorized());
        ownerGet(owner, "/v1/owner/grants?includeInactive=true").andExpect(jsonPath("$[0].status").value("REVOKED"));
    }

    @Test
    void rotatedSecretInvalidatesTheOldOne() throws Exception {
        String owner = newOwner();
        Registered c = registerClient(owner, "profile:read");
        String newSecret = read(ownerPost(owner, "/v1/owner/clients/" + c.clientId() + "/rotate-secret", null)
                .andExpect(status().isOk()), "$.clientSecret");
        tokenRequest(c.clientId(), c.clientSecret()).andExpect(status().isUnauthorized());
        tokenRequest(c.clientId(), newSecret).andExpect(status().isOk());
    }

    @Test
    void clientAuthenticationFailures() throws Exception {
        String owner = newOwner();
        Registered c = registerClient(owner, "profile:read");
        tokenRequest(c.clientId(), "wrong").andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("invalid_client"));
        tokenRequest("cl_does_not_exist", "whatever").andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/oauth/token").contentType("application/x-www-form-urlencoded").content("grant_type=client_credentials"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/oauth/token").contentType("application/x-www-form-urlencoded")
                        .content("grant_type=password&client_id=" + c.clientId() + "&client_secret=" + c.clientSecret()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("unsupported_grant_type"));
        // form-post credentials work too
        mvc.perform(post("/v1/oauth/token").contentType("application/x-www-form-urlencoded")
                        .content("grant_type=client_credentials&client_id=" + c.clientId() + "&client_secret=" + c.clientSecret()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token_type").value("Bearer"));
    }

    @Test
    void dashboardShowsWhoHasAccessToWhatAndTheHistory() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        Access a = grantAccess(owner, "profile.sizes:read");
        readData(a.accessToken(), null).andExpect(status().isOk());
        readData(a.accessToken(), "path=health").andExpect(status().isForbidden());

        ownerGet(owner, "/v1/owner/dashboard").andExpect(status().isOk())
                .andExpect(jsonPath("$.pendingRequests").value(0))
                .andExpect(jsonPath("$.activeGrants", hasSize(1)))
                .andExpect(jsonPath("$.activeGrants[0].clientName").value("Shoe Shop"))
                .andExpect(jsonPath("$.activeGrants[0].scopes[0]").value("profile.sizes:read"))
                .andExpect(jsonPath("$.activeGrants[0].readsUsed").value(1))
                .andExpect(jsonPath("$.recentAccess", hasSize(7)));

        ownerGet(owner, "/v1/owner/access-log?limit=2").andExpect(status().isOk())
                .andExpect(jsonPath("$[0].eventType").value("DATA_DENIED"))
                .andExpect(jsonPath("$[0].detail").value(org.hamcrest.Matchers.containsString("SCOPE_NOT_GRANTED")))
                .andExpect(jsonPath("$[1].eventType").value("DATA_READ"))
                .andExpect(jsonPath("$[1].clientId").value(a.client().clientId()));
        ownerGet(owner, "/v1/owner/access-log?clientId=" + a.client().clientId() + "&limit=500")
                .andExpect(jsonPath("$[*].clientId", org.hamcrest.Matchers.everyItem(is(a.client().clientId()))));
    }
}
