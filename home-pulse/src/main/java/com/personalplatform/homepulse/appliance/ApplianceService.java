package com.personalplatform.homepulse.appliance;

import com.personalplatform.homepulse.web.NotFoundException;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ApplianceService {

    private final ApplianceRepository repo;
    private final Clock clock;

    public ApplianceService(ApplianceRepository repo, Clock clock) {
        this.repo = repo;
        this.clock = clock;
    }

    public Appliance create(String ownerUid, ApplianceRequest r) {
        validate(r);
        return repo.insert(ownerUid, r, clock.instant());
    }

    @Transactional(readOnly = true)
    public List<Appliance> list(String ownerUid) {
        return repo.list(ownerUid);
    }

    /** 404 for both "does not exist" and "belongs to someone else". */
    @Transactional(readOnly = true)
    public Appliance get(String ownerUid, UUID id) {
        return repo.find(ownerUid, id).orElseThrow(() -> new NotFoundException("Appliance"));
    }

    public Appliance update(String ownerUid, UUID id, ApplianceRequest r) {
        validate(r);
        if (!repo.update(ownerUid, id, r, clock.instant())) {
            throw new NotFoundException("Appliance");
        }
        return get(ownerUid, id);
    }

    public void delete(String ownerUid, UUID id) {
        if (!repo.delete(ownerUid, id)) {
            throw new NotFoundException("Appliance");
        }
    }

    private static void validate(ApplianceRequest r) {
        if (r.purchaseDate() != null && r.warrantyEndDate() != null && r.warrantyEndDate().isBefore(r.purchaseDate())) {
            throw new IllegalArgumentException("warrantyEndDate must not be before purchaseDate");
        }
        if (r.lastServiceDate() != null && r.nextServiceDate() != null && r.nextServiceDate().isBefore(r.lastServiceDate())) {
            throw new IllegalArgumentException("nextServiceDate must not be before lastServiceDate");
        }
    }
}
