package com.personalplatform.homepulse.manual;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Owner-authenticated, like the other appliance endpoints: someone else's appliance is a 404. */
@RestController
public class ManualReadingsController {

    /**
     * @param kwh the meter's running total in kWh
     * @param at  when it was read; omitted means now
     */
    public record MeterReadingRequest(@NotNull @PositiveOrZero @DecimalMax("1000000000") Double kwh, Instant at) {}

    /** @param csv {@code timestamp,watts} rows, one per line, optional header line */
    public record CsvImportRequest(@NotBlank @Size(max = 1_000_000) String csv) {}

    private final ManualReadingsService service;

    public ManualReadingsController(ManualReadingsService service) {
        this.service = service;
    }

    @PostMapping("/v1/appliances/{applianceId}/meter-readings")
    ManualReadingsService.MeterResult meterReading(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applianceId,
                                                   @Valid @RequestBody MeterReadingRequest body) {
        return service.recordMeterTotal(jwt.getSubject(), applianceId, body.kwh(), body.at());
    }

    @PostMapping("/v1/appliances/{applianceId}/readings/import")
    ManualReadingsService.ImportResult importCsv(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applianceId,
                                                 @Valid @RequestBody CsvImportRequest body) {
        return service.importCsv(jwt.getSubject(), applianceId, body.csv());
    }
}
