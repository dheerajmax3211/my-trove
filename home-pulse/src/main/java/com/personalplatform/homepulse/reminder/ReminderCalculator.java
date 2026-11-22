package com.personalplatform.homepulse.reminder;

import com.personalplatform.homepulse.appliance.Appliance;
import com.personalplatform.homepulse.reminder.Reminder.Source;
import com.personalplatform.homepulse.reminder.Reminder.Type;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Pure: turns appliances' service and warranty dates (plus "which appliances have live anomaly alerts") into
 * reminders. This is where the sensor data meets the paperwork: an alert on an appliance still under warranty is
 * the most valuable moment to act.
 */
public final class ReminderCalculator {

    private ReminderCalculator() {}

    public static List<Reminder> compute(List<Appliance> appliances, Set<UUID> appliancesWithLiveAlerts,
                                         LocalDate today, int horizonDays) {
        List<Reminder> out = new ArrayList<>();
        for (Appliance a : appliances) {
            boolean alerting = appliancesWithLiveAlerts.contains(a.id());
            LocalDate service = a.nextServiceDate();
            if (service != null) {
                long days = ChronoUnit.DAYS.between(today, service);
                if (days < 0) {
                    out.add(new Reminder(a.id(), a.name(), Type.SERVICE_OVERDUE, Source.SERVICE_DATE, service, days,
                            alerting, "Service was due " + (-days) + " day(s) ago" + (alerting ? " and the appliance is showing an anomaly." : ".")));
                } else if (days <= horizonDays) {
                    out.add(new Reminder(a.id(), a.name(), Type.SERVICE_DUE, Source.SERVICE_DATE, service, days,
                            alerting, "Service due in " + days + " day(s)" + (alerting ? " and the appliance is showing an anomaly." : ".")));
                }
            }
            LocalDate warranty = a.warrantyEndDate();
            if (warranty != null) {
                long days = ChronoUnit.DAYS.between(today, warranty);
                if (days >= 0 && alerting) {
                    out.add(new Reminder(a.id(), a.name(), Type.WARRANTY_CLAIM_WINDOW, Source.ALERT, warranty, days, true,
                            "An anomaly was detected while the warranty is still valid (ends in " + days
                                    + " day(s)): get it checked before it expires."));
                } else if (days >= 0 && days <= horizonDays) {
                    out.add(new Reminder(a.id(), a.name(), Type.WARRANTY_ENDING, Source.WARRANTY_DATE, warranty, days, false,
                            "Warranty ends in " + days + " day(s)."));
                }
            }
        }
        out.sort(Comparator.comparing(Reminder::highPriority).reversed()
                .thenComparingLong(Reminder::daysUntil)
                .thenComparing(Reminder::applianceName)
                .thenComparing(Reminder::type));
        return out;
    }
}
