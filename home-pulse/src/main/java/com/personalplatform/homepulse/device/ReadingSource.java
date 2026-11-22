package com.personalplatform.homepulse.device;

/**
 * Where an appliance's energy numbers come from. Shown to the owner so no chart is ever mistaken for measurements
 * it did not come from.
 */
public enum ReadingSource {
    /** A smart plug or meter reports watts with its device token. */
    DEVICE,
    /** The owner entered meter totals or imported rows. Each point is the average over the interval entered. */
    MANUAL,
    /** The built-in simulator generated the numbers. They are not the appliance's. */
    SIMULATED
}
