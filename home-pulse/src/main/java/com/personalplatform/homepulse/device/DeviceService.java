package com.personalplatform.homepulse.device;

import com.personalplatform.homepulse.appliance.ApplianceRepository;
import com.personalplatform.homepulse.web.ConflictException;
import com.personalplatform.homepulse.web.NotFoundException;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class DeviceService {

    /** The plaintext token exists only in this object, returned once at registration. */
    public record Registered(Device device, String ingestionToken) {}

    private final DeviceRepository devices;
    private final ApplianceRepository appliances;
    private final Clock clock;

    public DeviceService(DeviceRepository devices, ApplianceRepository appliances, Clock clock) {
        this.devices = devices;
        this.appliances = appliances;
        this.clock = clock;
    }

    public Registered register(String ownerUid, UUID applianceId, String label) {
        appliances.find(ownerUid, applianceId).orElseThrow(() -> new NotFoundException("Appliance"));
        if (devices.hasActive(applianceId)) {
            throw new ConflictException("Appliance already has an active device; revoke it first to rotate the token");
        }
        String token = DeviceTokens.generate();
        try {
            Device d = devices.insert(ownerUid, applianceId, label, DeviceTokens.hash(token),
                    DeviceTokens.displayPrefix(token), clock.instant());
            return new Registered(d, token);
        } catch (DuplicateKeyException e) {   // lost a registration race
            throw new ConflictException("Appliance already has an active device; revoke it first to rotate the token");
        }
    }

    /**
     * The built-in simulator's device: the appliance's live device when it is already a simulated one, a new one
     * (random token, only the hash stored, the plaintext is dropped right here) when there is none, 409 when the
     * appliance already has a real device.
     */
    public Device ensureSimulated(String ownerUid, UUID applianceId) {
        appliances.find(ownerUid, applianceId).orElseThrow(() -> new NotFoundException("Appliance"));
        var active = devices.findActiveForAppliance(applianceId);
        if (active.isPresent()) {
            if (active.get().simulated()) {
                return active.get();
            }
            throw new ConflictException("Appliance already has a real device; the simulator only runs on appliances without one");
        }
        String token = DeviceTokens.generate();
        try {
            return devices.insert(ownerUid, applianceId, "Built-in simulator", DeviceTokens.hash(token),
                    DeviceTokens.displayPrefix(token), clock.instant(), true);
        } catch (DuplicateKeyException e) {
            throw new ConflictException("Appliance already has an active device");
        }
    }

    /**
     * The source for readings the owner enters by hand: the appliance's live manual device when it has one, a new one
     * when it has none, 409 when a real plug or the simulator already feeds the appliance. The token generated here is
     * dropped at once, so a manual device can never authenticate an ingest request.
     */
    public Device ensureManual(String ownerUid, UUID applianceId) {
        appliances.find(ownerUid, applianceId).orElseThrow(() -> new NotFoundException("Appliance"));
        var active = devices.findActiveForAppliance(applianceId);
        if (active.isPresent()) {
            if (active.get().manual()) {
                return active.get();
            }
            if (active.get().simulated()) {
                throw new ConflictException("This appliance runs on the simulator. Remove the simulation before entering readings by hand");
            }
            throw new ConflictException("This appliance has a live smart plug. Revoke the plug before entering readings by hand");
        }
        String token = DeviceTokens.generate();
        try {
            return devices.insert(ownerUid, applianceId, "Entered by you", DeviceTokens.hash(token),
                    "manual", clock.instant(), false, true);
        } catch (DuplicateKeyException e) {
            throw new ConflictException("Appliance already has an active device");
        }
    }

    @Transactional(readOnly = true)
    public List<Device> list(String ownerUid, UUID applianceId) {
        appliances.find(ownerUid, applianceId).orElseThrow(() -> new NotFoundException("Appliance"));
        return devices.listForAppliance(ownerUid, applianceId);
    }

    public void revoke(String ownerUid, UUID deviceId) {
        if (!devices.revoke(ownerUid, deviceId, clock.instant())) {
            throw new NotFoundException("Device");
        }
    }

    /** Empty for anything that is not a live device's token. Never throws on garbage input. */
    @Transactional(readOnly = true)
    public Optional<DevicePrincipal> authenticate(String token) {
        if (!DeviceTokens.looksLikeToken(token)) {
            return Optional.empty();
        }
        return devices.findActiveByTokenHash(DeviceTokens.hash(token))
                .map(d -> new DevicePrincipal(d.id(), d.ownerUid(), d.applianceId()));
    }

    /** MQTT: a live device that reports by itself. Manual devices never report, so they are never accepted here. */
    @Transactional(readOnly = true)
    public Optional<DevicePrincipal> activeDevice(UUID deviceId) {
        return devices.findActiveById(deviceId).filter(d -> !d.manual())
                .map(d -> new DevicePrincipal(d.id(), d.ownerUid(), d.applianceId()));
    }
}
