package com.personalplatform.homepulse.alert;

public enum AlertStatus {
    OPEN,
    ACKNOWLEDGED,
    RESOLVED;

    public boolean live() {
        return this != RESOLVED;
    }
}
