package com.personalplatform.waitingon.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PluralsTest {

    @Test
    void singularOnlyForExactlyOne() {
        assertThat(Plurals.days(1)).isEqualTo("1 day");
        assertThat(Plurals.days(0)).isEqualTo("0 days");
        assertThat(Plurals.days(2)).isEqualTo("2 days");
        assertThat(Plurals.days(21)).isEqualTo("21 days");
        assertThat(Plurals.days(-1)).isEqualTo("-1 days");
    }
}
