package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

class OwnerNameTest extends AbstractIntegrationTest {

    @Test
    void ownerAndPotAreLabelledWithTheTokenNameClaim() throws Exception {
        String uid = uid("owner");
        MvcResult created = post("/v1/households", uid + "|Ana Rao", key(), Map.of("name", "Home", "currency", "USD"))
                .andExpect(status().isCreated()).andReturn();
        assertThat(read(created, "$.members[0].displayName")).isEqualTo("Ana Rao");
        assertThat(read(created, "$.accounts[?(@.code=='POT:" + uid + "')].name")).contains("Ana Rao pot");
    }

    @Test
    void withoutANameClaimTheOwnerStaysUnlabelled() throws Exception {
        String uid = uid("owner");
        MvcResult created = post("/v1/households", uid, key(), Map.of("name", "Home", "currency", "USD"))
                .andExpect(status().isCreated()).andReturn();
        assertThat(read(created, "$.members[0].displayName")).isEqualTo("null");
    }
}
