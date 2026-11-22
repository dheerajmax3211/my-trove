package com.personalplatform.homepulse.manual;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class CsvReadingsTest {

    private static CsvReadings.Row watts(String ts, double watts) {
        return new CsvReadings.Row(Instant.parse(ts), watts, null, null, 0);
    }

    @Test
    void parsesRowsWithHeaderOffsetsAndBlankLines() {
        List<CsvReadings.Row> rows = CsvReadings.parse("""
                timestamp,watts

                2031-01-15T10:00:00Z,100.5
                2031-01-15T10:01:00+01:00,101
                2031-01-15T10:02:00.500Z, 99.5 \r
                """);
        assertThat(rows).containsExactly(
                watts("2031-01-15T10:00:00Z", 100.5),
                watts("2031-01-15T09:01:00Z", 101.0),
                watts("2031-01-15T10:02:00.5Z", 99.5));
    }

    @Test
    void acceptsRowsWithoutAHeader() {
        assertThat(CsvReadings.parse("2031-01-15T10:00:00Z,0")).hasSize(1);
    }

    @Test
    void refusesTheWholeFileAndListsEveryProblemLineByLine() {
        assertThatThrownBy(() -> CsvReadings.parse("""
                2031-01-15T10:00:00Z,100
                2031-01-15T10:01:00Z,abc
                2031-01-15T10:02:00Z
                2031-01-15T10:03:00Z,-4
                2031-01-15T10:04:00Z,NaN
                """))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Nothing was imported")
                .hasMessageContaining("line 2: watts must be a number")
                .hasMessageContaining("line 3: expected 2 columns")
                .hasMessageContaining("line 4: watts must be between 0 and")
                .hasMessageContaining("line 5: watts must be between 0 and");
    }

    @Test
    void aMissingTimeZoneIsNamedAsSuchNotGuessed() {
        assertThatThrownBy(() -> CsvReadings.parse("2031-01-15T10:00:00,100\n"))
                .hasMessageContaining("line 1: the timestamp has no time zone")
                .hasMessageContaining("2031-01-15T10:00:00Z");
        assertThatThrownBy(() -> CsvReadings.parse("2031-01-15 10:00,100\n"))
                .hasMessageContaining("line 1: the timestamp is not ISO 8601");
    }

    @Test
    void summarisesProblemsBeyondFive() {
        String bad = "2031-01-15T10:00:00,1\n".repeat(7);
        assertThatThrownBy(() -> CsvReadings.parse(bad))
                .hasMessageContaining("and 2 more");
    }

    @Test
    void refusesAnEmptyFileAndAFileOverTheRowLimit() {
        assertThatThrownBy(() -> CsvReadings.parse("timestamp,watts\n\n"))
                .hasMessageContaining("no readings");
        String tooMany = "2031-01-15T10:00:00Z,1\n".repeat(CsvReadings.MAX_ROWS + 1);
        assertThatThrownBy(() -> CsvReadings.parse(tooMany))
                .hasMessageContaining("at most " + CsvReadings.MAX_ROWS);
    }

    @Test
    void headerNamesDecideTheColumnsInAnyOrderAndCase() {
        List<CsvReadings.Row> rows = CsvReadings.parse("""
                Voltage, Current ,Time,Watts
                229.5,0.52,2031-01-15T10:00:00Z,119
                """);
        assertThat(rows).containsExactly(new CsvReadings.Row(Instant.parse("2031-01-15T10:00:00Z"), 119.0, 229.5, 0.52, 0));
    }

    @Test
    void voltsAndAmpsAreOptionalAndKeptWhenPresent() {
        List<CsvReadings.Row> rows = CsvReadings.parse("timestamp,watts,volts\n2031-01-15T10:00:00Z,50,230\n");
        assertThat(rows).containsExactly(new CsvReadings.Row(Instant.parse("2031-01-15T10:00:00Z"), 50.0, 230.0, null, 0));
    }

    @Test
    void kWhRowsAreTheEnergyUsedSinceThePreviousRowAndBecomeAverageWatts() {
        // 0.5 kWh used in the 30 minutes up to 10:30 is an average of 1000 W at 10:30; 0.25 kWh in the next 15 minutes is 1000 W too
        List<CsvReadings.Row> rows = CsvReadings.parse("""
                timestamp,kwh
                2031-01-15T10:00:00Z,0.0
                2031-01-15T10:30:00Z,0.5
                2031-01-15T10:45:00Z,0.25
                """);
        assertThat(rows).containsExactly(
                new CsvReadings.Row(Instant.parse("2031-01-15T10:30:00Z"), 1000.0, null, null, 30),
                new CsvReadings.Row(Instant.parse("2031-01-15T10:45:00Z"), 1000.0, null, null, 15));
    }

    @Test
    void theFirstKWhRowOnlySetsTheStartingPoint() {
        // its energy covers a period before the file, so it is not used
        assertThatThrownBy(() -> CsvReadings.parse("timestamp,kwh\n2031-01-15T10:00:00Z,0.4\n"))
                .hasMessageContaining("no readings");
    }

    @Test
    void kWhRowsMustMoveForwardAndStayWithinTwoHours() {
        assertThatThrownBy(() -> CsvReadings.parse("""
                timestamp,kwh
                2031-01-15T10:00:00Z,0.1
                2031-01-15T10:00:00Z,0.1
                """))
                .hasMessageContaining("line 3: kWh rows must be later than the row before");
        assertThatThrownBy(() -> CsvReadings.parse("""
                timestamp,kwh
                2031-01-15T10:00:00Z,0.1
                2031-01-15T13:00:00Z,0.3
                """))
                .hasMessageContaining("line 3: the interval since the previous row is 3 hours")
                .hasMessageContaining("at most 2 hours");
    }

    @Test
    void aFileMixingWattsAndKWhIsRefusedWithAClearMessage() {
        assertThatThrownBy(() -> CsvReadings.parse("timestamp,watts,kwh\n2031-01-15T10:00:00Z,1,1\n"))
                .hasMessageContaining("use either watts or kwh, not both");
        assertThatThrownBy(() -> CsvReadings.parse("timestamp,volts\n2031-01-15T10:00:00Z,230\n"))
                .hasMessageContaining("The header needs watts or kwh");
    }

    @Test
    void anUnknownHeaderColumnRefusesTheFileAndNamesTheColumnsItKnows() {
        assertThatThrownBy(() -> CsvReadings.parse("timestamp,watts,phase\n2031-01-15T10:00:00Z,1,L1\n"))
                .hasMessageContaining("unknown column 'phase'")
                .hasMessageContaining("timestamp, watts or kwh, volts, amps");
    }

    @Test
    void theWholeFileIsRefusedWhenAHeaderHasNoTimestamp() {
        assertThatThrownBy(() -> CsvReadings.parse("watts\n5\n"))
                .hasMessageContaining("The header needs a timestamp column");
    }

    @Test
    void averageWattsIsTheEnergyOverTheTime() {
        // 0.5 kWh over 30 minutes is an average of 1 kW
        assertThat(ManualReadingsService.averageWatts(0.5, 30)).isEqualTo(1000.0);
        assertThat(ManualReadingsService.averageWatts(0.0, 15)).isZero();
    }
}
