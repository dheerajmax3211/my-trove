package com.personalplatform.gateway.metering;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class RouteTemplateTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "/api/waiting-on/v1/items|waiting-on|/v1/items",
            "/api/waiting-on/v1/items/0190c3f0-aaaa-7bbb-8ccc-0123456789ab|waiting-on|/v1/items",
            "/api/waiting-on/v1/items/0190c3f0-aaaa-7bbb-8ccc-0123456789ab/comments/9|waiting-on|/v1/items",
            "/api/shared/v1/files/download|shared|/v1/files",
            "/api/consent/v1/owner/grants/55|consent|/v1/owner",
            "/api/consent/v1/12345/x|consent|/v1/{id}",
            "/api/consent/0190c3f0-aaaa-7bbb-8ccc-0123456789ab/x|consent|/{id}/x",
            "/api/auth/.well-known/jwks.json|auth|/.well-known/jwks.json",
            "/api/home-pulse/v1/devices/9f8e7d6c5b4a39281706aa|home-pulse|/v1/devices",
            "/api/platform/v1/usage/summary|platform|/v1/usage",
            "/api/platform|platform|/",
            "/api/platform/|platform|/",
            "/api/platform/v1|platform|/v1",
            "/api/shared/v1/files/%E2%82%AC|shared|/v1/files",
            "/api/shared/%E2%82%AC/files|shared|/{id}/files"})
    void firstTwoSegmentsAfterTheServicePrefixWithIdLikeSegmentsMasked(String path, String service, String expected) {
        assertThat(RouteTemplate.of(path, service)).isEqualTo(expected);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "/api/shared/v1/files/0190c3f0-aaaa-7bbb-8ccc-0123456789ab/download-link|shared",
            "/api/waiting-on/v1/9f8e7d6c5b4a39281706/x|waiting-on",
            "/api/waiting-on/v1/user@example.com/x|waiting-on",
            "/api/waiting-on/v1/abcdefghijklmnopqrstuvwxyz0123456789/x|waiting-on"})
    void idsAndOtherHighCardinalityValuesNeverSurvive(String path, String service) {
        String template = RouteTemplate.of(path, service);
        assertThat(template).doesNotContain("0190c3f0").doesNotContain("9f8e7d6c").doesNotContain("@")
                .doesNotContain("abcdefgh");
    }
}
