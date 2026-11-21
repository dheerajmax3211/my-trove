package com.personalplatform.homepulse.reading;

import java.time.Instant;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReadingsController {

    private final ReadingsService service;

    public ReadingsController(ReadingsService service) {
        this.service = service;
    }

    /** Downsampled readings; the bucket is chosen from the range unless {@code resolution} is given. */
    @GetMapping("/v1/appliances/{applianceId}/readings")
    ReadingsService.Series readings(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID applianceId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) Resolution resolution) {
        return service.query(jwt.getSubject(), applianceId, from, to, resolution);
    }
}
