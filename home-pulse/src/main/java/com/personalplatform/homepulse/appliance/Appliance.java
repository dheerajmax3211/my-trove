package com.personalplatform.homepulse.appliance;

import com.personalplatform.homepulse.detect.ApplianceType;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record Appliance(
        UUID id,
        String ownerUid,
        String name,
        ApplianceType type,
        String location,
        LocalDate purchaseDate,
        LocalDate warrantyEndDate,
        LocalDate lastServiceDate,
        LocalDate nextServiceDate,
        String notes,
        Instant createdAt,
        Instant updatedAt) {}
