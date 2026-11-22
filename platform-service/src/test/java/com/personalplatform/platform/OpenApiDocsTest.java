package com.personalplatform.platform;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;

/** W4 item 6: the service publishes its OpenAPI document without credentials, and it describes the developer API. */
class OpenApiDocsTest extends AbstractPlatformTest {

    @Test
    void theOpenApiDocumentExistsAndDescribesTheDeveloperApi() throws Exception {
        mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openapi").value(Matchers.startsWith("3.")))
                .andExpect(jsonPath("$.paths['/v1/developer/apps']").exists())
                .andExpect(jsonPath("$.paths['/v1/developer/apps/{id}/client-secret/rotate']").exists())
                .andExpect(jsonPath("$.paths['/v1/developer/apps/{appId}/keys']").exists())
                .andExpect(jsonPath("$.paths['/v1/developer/apps/{appId}/webhooks']").exists())
                .andExpect(jsonPath("$.paths['/internal/v1/api-keys/verify']").doesNotExist());
    }
}
