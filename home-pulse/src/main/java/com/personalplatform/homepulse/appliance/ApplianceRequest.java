package com.personalplatform.homepulse.appliance;

import com.personalplatform.homepulse.detect.ApplianceType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record ApplianceRequest(
        @NotBlank @Size(max = 120) String name,
        @NotNull ApplianceType type,
        @Size(max = 120) String location,
        LocalDate purchaseDate,
        LocalDate warrantyEndDate,
        LocalDate lastServiceDate,
        LocalDate nextServiceDate,
        @Size(max = 2000) String notes) {}
