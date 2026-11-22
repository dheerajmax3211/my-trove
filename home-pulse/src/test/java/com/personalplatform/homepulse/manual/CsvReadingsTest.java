package com.personalplatform.homepulse.manual;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class CsvReadingsTest {

    @Test
    void parsesRowsWithHeaderOffsetsAndBlankLines() {
        List<CsvReadings.Row> rows = CsvReadings.parse("""
                timestamp,watts

                2031-01-15T10:00:00Z,100.5
                2031-01-15T10:01:00+01:00,101
                2031-01-15T10:02:00.500Z, 99.5 \r
                """);
        assertThat(rows).containsExactly(
                new CsvReadings.Row(Instant.parse("2031-01-15T10:00:00Z"), 100.5),
                new CsvReadings.Row(Instant.parse("2031-01-15T09:01:00Z"), 101.0),
                new CsvReadings.Row(Instant.parse("2031-01-15T10:02:00.5Z"), 99.5));
    }

    @Test
    void acceptsRowsWithoutAHeader() {
        assertThat(CsvReadings.parse("2031-01-15T10:00:00Z,0")).hasSize(1);
    }

    @Test
    void refusesTheWholeFileAndListsEveryProblemLineByLine() {
        assertThatThrownBy(() -> CsvReadings.parse("""
                2031-01-15T10:00:00,100
                2031-01-15T10:01:00Z,abc
                2031-01-15T10:02:00Z
                2031-01-15T10:03:00Z,-4
                2031-01-15T10:04:00Z,NaN
                """))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Nothing was imported")
                .hasMessageContaining("line 1: the timestamp must be ISO 8601 with a zone")
                .hasMessageContaining("line 2: watts must be a number")
                .hasMessageContaining("line 3: expected two columns")
                .hasMessageContaining("line 4: watts must be between 0 and")
                .hasMessageContaining("line 5: watts must be between 0 and");
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
    void averageWattsIsTheEnergyOverTheTime() {
        // 0.5 kWh over 30 minutes is an average of 1 kW
        assertThat(ManualReadingsService.averageWatts(0.5, 30)).isEqualTo(1000.0);
        assertThat(ManualReadingsService.averageWatts(0.0, 15)).isZero();
    }
}
