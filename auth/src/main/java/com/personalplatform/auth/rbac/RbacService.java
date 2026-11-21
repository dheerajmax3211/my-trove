package com.personalplatform.auth.rbac;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.stereotype.Service;

/**
 * Resolves roles to permissions. The matrix changes only through migrations, so it is cached in memory and
 * {@link #reload()} exists for the (future) code path that edits it at runtime.
 */
@Service
public class RbacService {

    /** A role with its description and permissions, for the admin API. */
    public record RoleView(String name, String description, Set<String> permissions) {}

    private record Snapshot(Map<String, Set<String>> rolePermissions, Map<String, String> descriptions) {}

    private final RbacRepository repository;
    private volatile Snapshot snapshot;

    public RbacService(RbacRepository repository) {
        this.repository = repository;
    }

    /** Union of the permissions of every given role. Unknown roles grant nothing (deny by default). */
    public Set<String> permissionsFor(Set<String> roles) {
        Map<String, Set<String>> matrix = current().rolePermissions();
        Set<String> result = new HashSet<>();
        for (String role : roles) {
            result.addAll(matrix.getOrDefault(role, Set.of()));
        }
        return Set.copyOf(result);
    }

    public Set<String> allPermissions() {
        return repository.allPermissions();
    }

    public List<RoleView> roles() {
        Snapshot s = current();
        return s.rolePermissions().entrySet().stream()
                .map(e -> new RoleView(e.getKey(), s.descriptions().getOrDefault(e.getKey(), ""), new TreeSet<>(e.getValue())))
                .sorted(Comparator.comparing(RoleView::name))
                .toList();
    }

    public void reload() {
        snapshot = new Snapshot(repository.rolePermissions(), repository.roleDescriptions());
    }

    private Snapshot current() {
        Snapshot s = snapshot;
        if (s == null) {
            reload();
            s = snapshot;
        }
        return s;
    }
}
