package com.personalplatform.homepulse.contract;

import static com.personalplatform.homepulse.contract.ContractSchemas.assertMatches;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.homepulse.AbstractIntegrationTest;
import com.personalplatform.homepulse.TestSupportConfig;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * The real service's responses match {@code contracts/home-pulse/*.schema.json}, the same files the workspace's
 * demo-mode mock API is checked against. A simulated anomaly fills the baseline, last-24h stats and a live alert.
 */
class HomePulseContractTest extends AbstractIntegrationTest {

    private String ok(String path) throws Exception {
        return getAs(ALICE, path).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void ownerApiResponsesMatchTheirContracts() throws Exception {
        String created = mvc.perform(post("/v1/appliances").header("Authorization", bearer(ALICE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Kitchen fridge","type":"FRIDGE","location":"Kitchen","purchaseDate":"2029-01-01",
                                 "warrantyEndDate":"2032-01-01","lastServiceDate":"2030-06-01","nextServiceDate":"2031-01-10",
                                 "notes":"Bought online"}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertMatches("home-pulse/appliance.schema.json", created);
        UUID fridge = UUID.fromString(JsonPath.read(created, "$.id"));
        UUID bare = createAppliance(ALICE, "WATER_PUMP", ""); // every optional date null, no device
        mvc.perform(post("/v1/appliances/" + fridge + "/simulation").header("Authorization", bearer(ALICE))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"days\":7,\"scenario\":\"ANOMALY\"}"))
                .andExpect(status().isOk());

        assertMatches("home-pulse/appliance-list.schema.json", ok("/v1/appliances"));
        assertMatches("home-pulse/appliance.schema.json", ok("/v1/appliances/" + bare));
        String alerts = ok("/v1/alerts");
        assertMatches("home-pulse/alert-list.schema.json", alerts);
        assertMatches("home-pulse/reminder-list.schema.json", ok("/v1/reminders"));
        assertMatches("home-pulse/health.schema.json", ok("/v1/appliances/" + fridge + "/health"));
        assertMatches("home-pulse/health.schema.json", ok("/v1/appliances/" + bare + "/health"));
        var to = TestSupportConfig.T0;
        var from = to.minus(1, ChronoUnit.DAYS);
        assertMatches("home-pulse/readings.schema.json",
                ok("/v1/appliances/" + fridge + "/readings?from=" + from + "&to=" + to + "&resolution=ONE_HOUR"));

        String alertId = JsonPath.read(alerts, "$[0].id");
        assertMatches("home-pulse/alert.schema.json", ok("/v1/alerts/" + alertId));
        assertMatches("home-pulse/alert.schema.json", mvc.perform(post("/v1/alerts/" + alertId + "/ack")
                        .header("Authorization", bearer(ALICE)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
}
