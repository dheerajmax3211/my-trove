package com.personalplatform.legacy.audit;

/** Who caused an audited event. */
public record Actor(String kind, String id) {

    public static Actor owner(String uid) {
        return new Actor("OWNER", uid);
    }

    public static Actor trustee(java.util.UUID trusteeId) {
        return new Actor("TRUSTEE", trusteeId.toString());
    }

    public static Actor system() {
        return new Actor("SYSTEM", "scheduler");
    }
}
