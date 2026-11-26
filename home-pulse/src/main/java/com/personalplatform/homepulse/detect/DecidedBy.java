package com.personalplatform.homepulse.detect;

/** Which model produced a finding. Stored with the alert and shown in the API. */
public enum DecidedBy {
    /** The built-in detector: robust statistics (median / MAD) and the run-length and silence rules. */
    MAD,
    /** The trained seasonal model of ml-service (power shift and duty-cycle drift only). */
    ML
}
