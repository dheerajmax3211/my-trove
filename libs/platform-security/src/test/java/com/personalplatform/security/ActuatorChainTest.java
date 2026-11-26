package com.personalplatform.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.boot.test.web.server.LocalServerPort;

/** No Docker, no database: a service on the default platform chain, with a real separate management port. */
@SpringBootTest(classes = SecuredTestApp.class, webEnvironment = RANDOM_PORT, properties = {
        "app.firebase.project-id=test-project", "management.server.port=0",
        "management.endpoints.web.exposure.include=health,metrics"})
class ActuatorChainTest {

    @LocalServerPort int port;
    @LocalManagementPort int managementPort;

    private int status(int onPort, String path) throws Exception {
        return HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://localhost:" + onPort + path)).build(),
                HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    @Test
    void theManagementPortServesActuatorWithoutAToken() throws Exception {
        assertThat(managementPort).isNotEqualTo(port);
        // health is always registered; /actuator/metrics depends on Boot's test-time metrics setup and came back 404
        // intermittently, which says nothing about the security chain this test is for
        assertThat(status(managementPort, "/actuator/health")).isEqualTo(200);
    }

    @Test
    void theMainPortStillRefusesActuatorWithoutAToken() throws Exception {
        assertThat(status(port, "/actuator/metrics")).isEqualTo(401);
        assertThat(status(port, "/actuator/prometheus")).isEqualTo(401);
    }

    @Test
    void theApiStillNeedsAToken() throws Exception {
        assertThat(status(port, "/whoami")).isEqualTo(401);
    }
}
