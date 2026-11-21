package com.personalplatform.legacy.trustee;

public enum TrusteeStatus {
    /** Invite issued, not yet accepted. */
    INVITED,
    /** Accepted: public key and contacts registered, no share yet. */
    ACCEPTED,
    /** The owner's client uploaded a sealed share. */
    SHARE_UPLOADED,
    /** The trustee acknowledged the share. */
    CONFIRMED,
    REVOKED
}
