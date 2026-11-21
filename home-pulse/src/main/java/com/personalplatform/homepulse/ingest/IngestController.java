package com.personalplatform.homepulse.ingest;

import com.personalplatform.homepulse.device.DevicePrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Device-facing endpoint. Authenticated by the per-device ingestion token, not by Firebase (see SecurityConfig). */
@RestController
public class IngestController {

    public record ReadingItem(
            @NotNull Instant ts,
            @NotNull @PositiveOrZero @DecimalMax("1000000") Double watts,
            @PositiveOrZero @DecimalMax("1000") Double volts,
            @PositiveOrZero @DecimalMax("1000") Double amps) {}

    public record IngestRequest(@NotEmpty @Size(max = 5000) List<@Valid @NotNull ReadingItem> readings) {}

    private final IngestService service;

    public IngestController(IngestService service) {
        this.service = service;
    }

    @PostMapping("/v1/ingest/readings")
    IngestResult ingest(@AuthenticationPrincipal DevicePrincipal device, @Valid @RequestBody IngestRequest body) {
        List<ReadingInput> batch = body.readings().stream()
                .map(r -> new ReadingInput(r.ts(), r.watts(), r.volts(), r.amps()))
                .toList();
        return service.ingest(device.deviceId(), batch);
    }
}
