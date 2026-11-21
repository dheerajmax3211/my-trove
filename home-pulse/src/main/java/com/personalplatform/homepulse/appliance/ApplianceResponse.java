package com.personalplatform.homepulse.appliance;

import com.personalplatform.homepulse.detect.ApplianceType;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

public record ApplianceResponse(
        UUID id,
        String name,
        ApplianceType type,
        String location,
        LocalDate purchaseDate,
        LocalDate warrantyEndDate,
        LocalDate lastServiceDate,
        LocalDate nextServiceDate,
        String notes,
        boolean underWarranty,
        Long daysToWarrantyEnd,
        boolean serviceOverdue,
        Instant createdAt,
        Instant updatedAt) {

    public static ApplianceResponse from(Appliance a, LocalDate today) {
        boolean warranty = a.warrantyEndDate() != null && !a.warrantyEndDate().isBefore(today);
        Long daysToWarranty = a.warrantyEndDate() == null ? null : ChronoUnit.DAYS.between(today, a.warrantyEndDate());
        boolean overdue = a.nextServiceDate() != null && a.nextServiceDate().isBefore(today);
        return new ApplianceResponse(a.id(), a.name(), a.type(), a.location(), a.purchaseDate(), a.warrantyEndDate(),
                a.lastServiceDate(), a.nextServiceDate(), a.notes(), warranty, daysToWarranty, overdue,
                a.createdAt(), a.updatedAt());
    }
}
