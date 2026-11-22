package com.personalplatform.homepulse.simulation;

public enum SimulationScenario {
    /** A healthy appliance. */
    NORMAL,
    /** A healthy history followed by a deviation in the last hours (the appliance type decides which). */
    ANOMALY
}
