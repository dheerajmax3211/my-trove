package com.personalplatform.homepulse.alert;

import com.personalplatform.homepulse.web.ConflictException;
import com.personalplatform.homepulse.web.NotFoundException;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class AlertService {

    private final AlertRepository repo;
    private final Clock clock;

    public AlertService(AlertRepository repo, Clock clock) {
        this.repo = repo;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Alert> list(String ownerUid, AlertStatus status, UUID applianceId, boolean includeResolved, int limit) {
        return repo.list(ownerUid, status, applianceId, !includeResolved, Math.min(Math.max(limit, 1), 500));
    }

    @Transactional(readOnly = true)
    public Alert get(String ownerUid, UUID id) {
        return repo.find(ownerUid, id).orElseThrow(() -> new NotFoundException("Alert"));
    }

    /** Idempotent for an already acknowledged alert; a resolved alert cannot be acknowledged. */
    public Alert acknowledge(String ownerUid, UUID id) {
        Alert current = get(ownerUid, id);
        if (current.status() == AlertStatus.RESOLVED) {
            throw new ConflictException("Alert is already resolved");
        }
        if (current.status() == AlertStatus.OPEN) {
            repo.acknowledge(ownerUid, id, clock.instant());
        }
        return get(ownerUid, id);
    }
}
