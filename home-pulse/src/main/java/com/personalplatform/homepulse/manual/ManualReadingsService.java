package com.personalplatform.homepulse.manual;

import com.personalplatform.homepulse.appliance.ApplianceRepository;
import com.personalplatform.homepulse.config.HomePulseProperties;
import com.personalplatform.homepulse.device.Device;
import com.personalplatform.homepulse.device.DeviceService;
import com.personalplatform.homepulse.eval.EvaluationService;
import com.personalplatform.homepulse.ingest.IngestResult;
import com.personalplatform.homepulse.ingest.IngestService;
import com.personalplatform.homepulse.ingest.ReadingInput;
import com.personalplatform.homepulse.web.ConflictException;
import com.personalplatform.homepulse.web.NotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Readings without hardware, from the owner's own meter reading or a CSV export.
 *
 * <p>A meter total (kWh, as shown on a plug's display or a meter) becomes average power: the energy since the previous
 * total, spread evenly over the minutes in between. The first total only sets the starting point. Nothing here is
 * estimated beyond that: the stored numbers are exactly the average the owner's own readings imply.
 */
@Service
public class ManualReadingsService {

    public enum Outcome { BASELINE, RECORDED }

    /**
     * @param energyKwh       energy since the previous total (0 for a baseline)
     * @param intervalMinutes minutes since the previous total (0 for a baseline)
     * @param averageWatts    average power over the interval (null for a baseline)
     * @param minutesStored   minute readings stored
     * @param minutesRejected minutes not stored: older than the service accepts, or refused by the ingest window
     * @param spread          false when the gap since the previous total is longer than
     *                        {@link CsvReadings#MAX_INTERVAL_MINUTES}: the total is kept, but no minute readings are invented
     */
    public record MeterResult(Outcome outcome, Instant at, Instant previousAt, double energyKwh, long intervalMinutes,
                              Double averageWatts, long minutesStored, long minutesRejected, boolean spread) {}

    /** @param rejected rows outside the accepted window (too old, or too far in the future) */
    public record ImportResult(int rows, int accepted, int duplicates, int rejected) {}

    private final ApplianceRepository appliances;
    private final DeviceService devices;
    private final MeterTotalRepository totals;
    private final IngestService ingest;
    private final EvaluationService evaluation;
    private final HomePulseProperties props;
    private final Clock clock;

    public ManualReadingsService(ApplianceRepository appliances, DeviceService devices, MeterTotalRepository totals,
                                 IngestService ingest, EvaluationService evaluation, HomePulseProperties props, Clock clock) {
        this.appliances = appliances;
        this.devices = devices;
        this.totals = totals;
        this.ingest = ingest;
        this.evaluation = evaluation;
        this.props = props;
        this.clock = clock;
    }

    /** Average power in watts for {@code deltaKwh} consumed over {@code minutes} minutes. */
    static double averageWatts(double deltaKwh, long minutes) {
        return deltaKwh * 60_000.0 / minutes;
    }

    /**
     * @param kwh   the meter's running total now (not the energy since the last reading)
     * @param atUtc when the total was read; null means now. Truncated to the minute.
     * @throws ConflictException when the total goes down, or is not after the previous total
     */
    @Transactional
    public MeterResult recordMeterTotal(String ownerUid, UUID applianceId, double kwh, Instant atUtc) {
        requireOwned(ownerUid, applianceId);
        Instant now = clock.instant();
        Instant at = (atUtc == null ? now : atUtc).truncatedTo(ChronoUnit.MINUTES);
        if (at.isAfter(now.plus(props.ingest().maxFutureSkew()))) {
            throw new IllegalArgumentException("at must not be in the future");
        }
        Device device = devices.ensureManual(ownerUid, applianceId);
        Optional<MeterTotalRepository.Total> previous = totals.latest(device.id());
        if (previous.isEmpty()) {
            totals.insert(device.id(), at, kwh);
            evaluation.evaluate(applianceId);
            return new MeterResult(Outcome.BASELINE, at, null, 0, 0, null, 0, 0, false);
        }
        MeterTotalRepository.Total prev = previous.get();
        if (!at.isAfter(prev.ts())) {
            throw new ConflictException("Enter readings in time order. The last total is from " + prev.ts()
                    + ", so a total at or before that time cannot be placed");
        }
        if (kwh < prev.kwh()) {
            throw new ConflictException("The total is lower than the last one (" + prev.kwh() + " kWh at " + prev.ts()
                    + "). A meter's total only goes up. If the meter was reset or replaced, stop entering readings by hand and start again");
        }

        long minutes = Duration.between(prev.ts(), at).toMinutes();
        double delta = kwh - prev.kwh();
        double watts = averageWatts(delta, minutes);
        totals.insert(device.id(), at, kwh);
        if (minutes > CsvReadings.MAX_INTERVAL_MINUTES) {
            // A long gap: the energy is real, but spreading it over every minute would invent readings nobody measured.
            evaluation.evaluate(applianceId);
            return new MeterResult(Outcome.RECORDED, at, prev.ts(), delta, minutes, watts, 0, 0, false);
        }
        // Minutes older than the service accepts are never generated: they would be rejected anyway.
        long tooOld = Math.min(minutes, Math.max(0, Duration.between(prev.ts(), now.minus(props.ingest().maxAge())).toMinutes()));

        Tally tally = new Tally();
        tally.rejected += tooOld;
        List<ReadingInput> batch = new ArrayList<>();
        for (long k = tooOld + 1; k <= minutes; k++) {
            batch.add(new ReadingInput(prev.ts().plusSeconds(60 * k), watts, null, null));
            if (batch.size() == props.ingest().maxBatchSize()) {
                tally.add(ingest.ingest(device.id(), batch));
                batch = new ArrayList<>();
            }
        }
        if (!batch.isEmpty()) {
            tally.add(ingest.ingest(device.id(), batch));
        }
        evaluation.evaluate(applianceId);
        return new MeterResult(Outcome.RECORDED, at, prev.ts(), delta, minutes, watts, tally.accepted, tally.rejected, true);
    }

    /**
     * Imports a smart-meter or plug export (see {@link CsvReadings} for the format). The whole file is validated first:
     * a bad row stores nothing. A row of watts is one reading; a row of kWh is one reading per minute of its interval,
     * each at that interval's average power.
     *
     * @throws IllegalArgumentException for a file that does not parse (listed line by line)
     */
    @Transactional
    public ImportResult importCsv(String ownerUid, UUID applianceId, String csv) {
        requireOwned(ownerUid, applianceId);
        List<CsvReadings.Row> rows = CsvReadings.parse(csv);
        Device device = devices.ensureManual(ownerUid, applianceId);
        Tally tally = new Tally();
        List<ReadingInput> batch = new ArrayList<>();
        for (CsvReadings.Row row : rows) {
            // a watts row is one reading at its time; a kWh row covers the minutes (ts - n, ts], ending at its time
            int minutes = Math.max(1, row.intervalMinutes());
            for (int back = minutes - 1; back >= 0; back--) {
                batch.add(new ReadingInput(row.ts().minusSeconds(60L * back), row.watts(), row.volts(), row.amps()));
                if (batch.size() == props.ingest().maxBatchSize()) {
                    tally.add(ingest.ingest(device.id(), batch));
                    batch = new ArrayList<>();
                }
            }
        }
        if (!batch.isEmpty()) {
            tally.add(ingest.ingest(device.id(), batch));
        }
        evaluation.evaluate(applianceId);
        return new ImportResult(rows.size(), (int) tally.accepted, (int) tally.duplicates, (int) tally.rejected);
    }

    private void requireOwned(String ownerUid, UUID applianceId) {
        appliances.find(ownerUid, applianceId).orElseThrow(() -> new NotFoundException("Appliance"));
    }

    private static final class Tally {
        long accepted;
        long duplicates;
        long rejected;

        void add(IngestResult r) {
            accepted += r.accepted();
            duplicates += r.duplicates();
            rejected += r.rejected();
        }
    }
}
