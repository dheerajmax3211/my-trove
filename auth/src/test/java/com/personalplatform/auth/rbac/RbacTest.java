package com.personalplatform.auth.rbac;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.auth.AuthIntegrationTest;
import com.personalplatform.auth.TestUsers;
import java.util.Set;
import org.jooq.DSLContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

@AuthIntegrationTest
class RbacTest {

    private static final Set<String> MEMBER = Set.of("products:use", "usage:read:self", "connections:manage");
    private static final Set<String> DEVELOPER = Set.of(
            "products:use", "usage:read:self", "connections:manage",
            "apps:manage", "keys:manage", "webhooks:manage", "sandbox:use", "logs:read:own", "workspaces:manage");
    private static final Set<String> AUDITOR = Set.of("usage:read:all", "users:read", "audit:read", "apps:read:all");
    private static final Set<String> ADMIN = Set.of(
            "products:use", "usage:read:self", "connections:manage",
            "users:read", "users:write", "roles:assign", "usage:read:all", "flags:manage", "audit:read",
            "apps:read:all", "support:impersonate");
    private static final Set<String> EVERY_PERMISSION = Set.of(
            "products:use", "usage:read:self", "usage:read:all", "connections:manage",
            "apps:manage", "apps:read:all", "keys:manage", "webhooks:manage", "sandbox:use", "logs:read:own",
            "workspaces:manage", "users:read", "users:write", "roles:assign", "roles:assign:privileged",
            "plans:manage", "flags:manage", "audit:read", "support:impersonate");

    @Autowired RbacService rbac;
    @Autowired MockMvc mvc;
    @Autowired DSLContext dsl;

    @Test
    void roleMatrixMatchesDesign() {
        assertThat(rbac.permissionsFor(Set.of("MEMBER"))).containsExactlyInAnyOrderElementsOf(MEMBER);
        assertThat(rbac.permissionsFor(Set.of("DEVELOPER"))).containsExactlyInAnyOrderElementsOf(DEVELOPER);
        assertThat(rbac.permissionsFor(Set.of("AUDITOR"))).containsExactlyInAnyOrderElementsOf(AUDITOR);
        assertThat(rbac.permissionsFor(Set.of("ADMIN"))).containsExactlyInAnyOrderElementsOf(ADMIN);
        assertThat(rbac.permissionsFor(Set.of("OWNER"))).containsExactlyInAnyOrderElementsOf(EVERY_PERMISSION);
    }

    @Test
    void permissionEnumAndDatabaseCatalogueAgree() {
        assertThat(java.util.Arrays.stream(Permission.values()).map(Permission::value))
                .containsExactlyInAnyOrderElementsOf(EVERY_PERMISSION);
        assertThat(rbac.allPermissions()).containsExactlyInAnyOrderElementsOf(EVERY_PERMISSION);
        assertThat(java.util.Arrays.stream(Persona.values()).map(Enum::name))
                .containsExactlyInAnyOrder("OWNER", "ADMIN", "DEVELOPER", "MEMBER", "AUDITOR");
    }

    @Test
    void unionOfRolesAndUnknownRolesGrantNothingExtra() {
        assertThat(rbac.permissionsFor(Set.of("MEMBER", "AUDITOR")))
                .containsExactlyInAnyOrderElementsOf(
                        java.util.stream.Stream.concat(MEMBER.stream(), AUDITOR.stream()).collect(java.util.stream.Collectors.toSet()));
        assertThat(rbac.permissionsFor(Set.of("USER", "NOPE"))).isEmpty();
        assertThat(rbac.permissionsFor(Set.of())).isEmpty();
    }

    @Test
    void newUserIsMemberWithExactlyTheMemberPermissions() throws Exception {
        var alice = TestUsers.newUser(mvc, "alice");
        mvc.perform(get("/v1/me").header("Authorization", alice.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles", containsInAnyOrder("MEMBER")))
                .andExpect(jsonPath("$.permissions", containsInAnyOrder(MEMBER.toArray())))
                .andExpect(jsonPath("$.plan").value("FREE"));
    }

    @Test
    void bootstrapEmailBecomesOwnerOnlyWhenVerified() throws Exception {
        mvc.perform(get("/v1/me").header("Authorization", TestUsers.bearer("uid-fake-boss", "boss@example.com", false)))
                .andExpect(jsonPath("$.roles", containsInAnyOrder("MEMBER")));
        mvc.perform(get("/v1/me").header("Authorization", TestUsers.bearer("uid-boss", "boss@example.com", true)))
                .andExpect(jsonPath("$.roles", containsInAnyOrder("MEMBER", "OWNER")))
                .andExpect(jsonPath("$.permissions", containsInAnyOrder(EVERY_PERMISSION.toArray())));
    }

    @Test
    void permissionsComeFromTheDatabaseNotTheToken() throws Exception {
        var dev = TestUsers.newUser(mvc, "dev");
        TestUsers.giveRole(dsl, dev, "DEVELOPER");
        mvc.perform(get("/v1/me").header("Authorization", dev.bearer()))
                .andExpect(jsonPath("$.permissions", containsInAnyOrder(DEVELOPER.toArray())));
    }
}
