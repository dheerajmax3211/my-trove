package com.personalplatform.consent.contract;

import static com.personalplatform.consent.contract.ContractSchemas.assertMatches;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.consent.support.IntegrationTest;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

/**
 * The real owner API's responses match {@code contracts/consent/*.schema.json}, the same files the workspace's
 * demo-mode mock gateway is checked against.
 */
class ConsentContractTest extends IntegrationTest {

    private static String ok(ResultActions r) throws Exception {
        return r.andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void ownerApiResponsesMatchTheirContracts() throws Exception {
        String owner = newOwner();
        String attribute = ok(ownerPost(owner, "/v1/owner/vault/attributes",
                "{'keyPath':'profile.sizes.shoe','value':{'eu':42},'sensitivity':'PERSONAL'}"));
        assertMatches("consent/attribute.schema.json", attribute);
        putAttribute(owner, "profile.name", "'Sam'", "PUBLIC");
        assertMatches("consent/attribute-list.schema.json", ok(ownerGet(owner, "/v1/owner/vault/attributes")));
        assertMatches("consent/attribute.schema.json", ok(ownerGet(owner, "/v1/owner/vault/attributes/"
                + URLEncoder.encode("profile.sizes.shoe", StandardCharsets.UTF_8))));

        String registered = ok(ownerPost(owner, "/v1/owner/clients",
                "{'name':'Shoe Shop','contactEmail':'dev@shoes.example','allowedScopes':['profile.sizes:read']}"));
        assertMatches("consent/client-with-secret.schema.json", registered);
        Registered client = new Registered(
                JsonPath.read(registered, "$.client.clientId"),
                JsonPath.read(registered, "$.clientSecret"));
        assertMatches("consent/client-list.schema.json", ok(ownerGet(owner, "/v1/owner/clients")));
        assertMatches("consent/client.schema.json", ok(ownerGet(owner, "/v1/owner/clients/" + client.clientId())));
        assertMatches("consent/client-with-secret.schema.json",
                ok(ownerPost(owner, "/v1/owner/clients/" + client.clientId() + "/rotate-secret", null)));

        // The rotation invalidated the first secret; re-register for the request flow.
        Registered app = registerClient(owner, "profile.sizes:read");
        String ct = clientToken(app);
        String toApprove = createRequest(ct, "{'scopes':['profile.sizes:read'],'purpose':'sizing','durationSeconds':3600,"
                + "'maxReads':5}");
        String toDeny = createRequest(ct, "{'scopes':['profile.sizes:read'],'purpose':'other','durationSeconds':600}");
        createRequest(ct, "{'scopes':['profile.sizes:read'],'purpose':'still pending','durationSeconds':600}");

        assertMatches("consent/request-list.schema.json", ok(ownerGet(owner, "/v1/owner/requests?status=PENDING")));
        assertMatches("consent/request.schema.json", ok(ownerGet(owner, "/v1/owner/requests/" + toApprove)));

        String grant = ok(ownerPost(owner, "/v1/owner/requests/" + toApprove + "/approve",
                "{'allowedHours':{'startHour':0,'endHour':24,'zone':'UTC'}}"));
        assertMatches("consent/grant.schema.json", grant);
        String grantId = JsonPath.read(grant, "$.id");
        readData(exchange(ct, grantId), null); // fills lastReadAt and readsUsed
        assertMatches("consent/request.schema.json",
                ok(ownerPost(owner, "/v1/owner/requests/" + toDeny + "/deny", "{'note':'no thanks'}")));
        assertMatches("consent/request-list.schema.json", ok(ownerGet(owner, "/v1/owner/requests")));
        assertMatches("consent/grant-list.schema.json", ok(ownerGet(owner, "/v1/owner/grants")));
        assertMatches("consent/dashboard.schema.json", ok(ownerGet(owner, "/v1/owner/dashboard")));

        assertMatches("consent/grant.schema.json", ok(ownerPost(owner, "/v1/owner/grants/" + grantId + "/revoke", null)));
        assertMatches("consent/grant-list.schema.json", ok(ownerGet(owner, "/v1/owner/grants?includeInactive=true")));
        assertMatches("consent/access-log.schema.json", ok(ownerGet(owner, "/v1/owner/access-log")));
        assertMatches("consent/chain-report.schema.json", ok(ownerGet(owner, "/v1/owner/audit/verify")));
    }
}
