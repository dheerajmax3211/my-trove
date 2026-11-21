package com.personalplatform.platform.flags;

import com.personalplatform.platform.flags.Dtos.Flag;
import com.personalplatform.platform.flags.Dtos.FlagRequest;
import com.personalplatform.platform.flags.FlagEvaluator.Caller;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Flag administration (every change is audited in the same transaction) and per-caller evaluation. */
@Service
class FlagService {

    private final FlagRepository repository;
    private final JsonMapper json;

    FlagService(FlagRepository repository, JsonMapper json) {
        this.repository = repository;
        this.json = json;
    }

    List<Flag> list() {
        return repository.findAll();
    }

    @Transactional
    Flag create(FlagRequest request, String actor) {
        Flag stored = repository.insert(toFlag(request.key(), request), actor)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "A flag with key '" + request.key() + "' already exists"));
        repository.audit(stored.key(), "CREATE", actor, detail(stored));
        return stored;
    }

    @Transactional
    Flag update(String key, FlagRequest request, String actor) {
        Flag stored = repository.update(toFlag(key, request), actor).orElseThrow(() -> notFound(key));
        repository.audit(key, "UPDATE", actor, detail(stored));
        return stored;
    }

    @Transactional
    void delete(String key, String actor) {
        Flag removed = repository.delete(key).orElseThrow(() -> notFound(key));
        repository.audit(key, "DELETE", actor, detail(removed));
    }

    /** Every flag's answer for this caller, ordered by key. */
    Map<String, Boolean> evaluate(Caller caller) {
        Map<String, Boolean> result = new TreeMap<>();
        for (Flag flag : repository.findAll()) {
            result.put(flag.key(), FlagEvaluator.isOn(flag, caller));
        }
        return result;
    }

    private static Flag toFlag(String key, FlagRequest r) {
        return new Flag(key, r.description() == null ? "" : r.description(), r.enabled() != null && r.enabled(),
                r.rolloutPercent() == null ? 100 : r.rolloutPercent(), clean(r.allowedPlans()), clean(r.allowedRoles()), null, null, null);
    }

    /** Distinct, in the order given. */
    private static List<String> clean(List<String> names) {
        return names == null ? List.of() : names.stream().distinct().toList();
    }

    private static ResponseStatusException notFound(String key) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "No flag with key '" + key + "'");
    }

    private String detail(Flag f) {
        return json.writeValueAsString(Map.of("description", f.description(), "enabled", f.enabled(), "rolloutPercent", f.rolloutPercent(),
                "allowedPlans", f.allowedPlans(), "allowedRoles", f.allowedRoles()));
    }
}
