package com.personalplatform.auth.admin;

import static com.personalplatform.sql.jooq.auth.auth.Tables.AUDIT_LOG;
import static com.personalplatform.sql.jooq.auth.auth.Tables.USERS;
import static com.personalplatform.sql.jooq.auth.auth.Tables.USER_ROLES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.auth.AuthIntegrationTest;
import com.personalplatform.auth.TestUsers;
import com.personalplatform.auth.TestUsers.TestUser;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.jooq.DSLContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpMethod;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@AuthIntegrationTest
class AdminApiTest {

    @Autowired MockMvc mvc;
    @Autowired DSLContext dsl;

    TestUser boss;

    /** The suite shares one database: make sure the bootstrap owner is the only OWNER and is not suspended. */
    @BeforeEach
    void soleOwner() throws Exception {
        boss = TestUsers.boss(mvc);
        dsl.deleteFrom(USER_ROLES)
                .where(USER_ROLES.ROLE_NAME.eq("OWNER"))
                .and(USER_ROLES.USER_ID.ne(boss.id()))
                .execute();
        dsl.update(USERS).set(USERS.SUSPENDED_AT, (java.time.OffsetDateTime) null).where(USERS.ID.eq(boss.id())).execute();
    }

    // ---- helpers ----

    private ResultActions call(HttpMethod method, String path, String bearer) throws Exception {
        var req = MockMvcRequestBuilders.request(method, path);
        if (bearer != null) {
            req.header("Authorization", bearer);
        }
        return mvc.perform(req);
    }

    private TestUser withRole(String label, String role) throws Exception {
        TestUser u = TestUsers.newUser(mvc, label);
        if (role != null) {
            TestUsers.giveRole(dsl, u, role);
        }
        return u;
    }

    private long auditRowsFor(UUID target) {
        return dsl.fetchCount(AUDIT_LOG, AUDIT_LOG.TARGET_ID.eq(target));
    }

    private int permissionsVersion(UUID id) {
        return dsl.select(USERS.PERMISSIONS_VERSION).from(USERS).where(USERS.ID.eq(id)).fetchOne(USERS.PERMISSIONS_VERSION);
    }

    // ---- persona x endpoint matrix ----

    private record Endpoint(String name, HttpMethod method, String path) {
        String resolve(UUID target) {
            return path.replace("{id}", target.toString());
        }
    }

    private static final List<Endpoint> ENDPOINTS = List.of(
            new Endpoint("list users", HttpMethod.GET, "/v1/admin/users"),
            new Endpoint("get user", HttpMethod.GET, "/v1/admin/users/{id}"),
            new Endpoint("list roles", HttpMethod.GET, "/v1/admin/roles"),
            new Endpoint("read audit", HttpMethod.GET, "/v1/admin/audit"),
            new Endpoint("assign DEVELOPER", HttpMethod.PUT, "/v1/admin/users/{id}/roles/DEVELOPER"),
            new Endpoint("revoke DEVELOPER", HttpMethod.DELETE, "/v1/admin/users/{id}/roles/DEVELOPER"),
            new Endpoint("suspend", HttpMethod.POST, "/v1/admin/users/{id}/suspend"),
            new Endpoint("restore", HttpMethod.POST, "/v1/admin/users/{id}/restore"),
            new Endpoint("change plan", HttpMethod.PUT, "/v1/admin/users/{id}/plan/PRO"));

    /** Expected status per endpoint, in ENDPOINTS order. */
    private static final int[] MEMBER_EXPECTED = {403, 403, 403, 403, 403, 403, 403, 403, 403};
    private static final int[] AUDITOR_EXPECTED = {200, 200, 200, 200, 403, 403, 403, 403, 403};
    private static final int[] ADMIN_EXPECTED = {200, 200, 200, 200, 200, 200, 200, 200, 403};
    private static final int[] OWNER_EXPECTED = {200, 200, 200, 200, 200, 200, 200, 200, 200};

    private void assertMatrix(String persona, String bearer, int[] expected) throws Exception {
        for (int i = 0; i < ENDPOINTS.size(); i++) {
            Endpoint e = ENDPOINTS.get(i);
            TestUser target = withRole("target", null);
            int actual = call(e.method(), e.resolve(target.id()), bearer).andReturn().getResponse().getStatus();
            assertThat(actual).as("%s calling '%s'", persona, e.name()).isEqualTo(expected[i]);
        }
    }

    @Test
    void memberIsForbiddenEverywhere() throws Exception {
        assertMatrix("MEMBER", withRole("member", null).bearer(), MEMBER_EXPECTED);
    }

    @Test
    void developerIsForbiddenEverywhere() throws Exception {
        assertMatrix("DEVELOPER", withRole("developer", "DEVELOPER").bearer(), MEMBER_EXPECTED);
    }

    @Test
    void auditorCanReadButNotWrite() throws Exception {
        assertMatrix("AUDITOR", withRole("auditor", "AUDITOR").bearer(), AUDITOR_EXPECTED);
    }

    @Test
    void adminCanManageUsersButNotPlans() throws Exception {
        assertMatrix("ADMIN", withRole("admin", "ADMIN").bearer(), ADMIN_EXPECTED);
    }

    @Test
    void ownerCanDoEverything() throws Exception {
        assertMatrix("OWNER", boss.bearer(), OWNER_EXPECTED);
    }

    @Test
    void unauthenticatedCallersGet401() throws Exception {
        call(HttpMethod.GET, "/v1/admin/users", null).andExpect(status().isUnauthorized());
        call(HttpMethod.PUT, "/v1/admin/users/" + UUID.randomUUID() + "/roles/ADMIN", null)
                .andExpect(status().isUnauthorized());
    }

    @Test
    void forbiddenResponsesAreProblemBodies() throws Exception {
        call(HttpMethod.GET, "/v1/admin/users", withRole("plain", null).bearer())
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void everyAdminHandlerDeclaresItsOwnPermission() {
        List<String> unguarded = new ArrayList<>();
        for (Class<?> c : List.of(AdminUserController.class, AdminRoleController.class, AdminAuditController.class)) {
            assertThat(c.isAnnotationPresent(RestController.class)).isTrue();
            for (Method m : c.getDeclaredMethods()) {
                boolean handler = java.util.Arrays.stream(m.getAnnotations())
                        .anyMatch(a -> a.annotationType().isAnnotationPresent(RequestMapping.class));
                if (handler && !m.isAnnotationPresent(PreAuthorize.class)) {
                    unguarded.add(c.getSimpleName() + "." + m.getName());
                }
            }
        }
        assertThat(unguarded).as("handlers without @PreAuthorize (deny by default)").isEmpty();
    }

    // ---- guardrails ----

    @Test
    void adminCannotGrantAdminOrOwner() throws Exception {
        TestUser admin = withRole("admin", "ADMIN");
        TestUser member = withRole("member", null);
        long auditBefore = auditRowsFor(member.id());
        int pvBefore = permissionsVersion(member.id());

        for (String role : List.of("ADMIN", "OWNER")) {
            call(HttpMethod.PUT, "/v1/admin/users/" + member.id() + "/roles/" + role, admin.bearer())
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("PRIVILEGED_ROLE_REQUIRED"));
        }
        call(HttpMethod.GET, "/v1/admin/users/" + member.id(), admin.bearer())
                .andExpect(jsonPath("$.roles", not(hasItem("ADMIN"))))
                .andExpect(jsonPath("$.roles", not(hasItem("OWNER"))));
        assertThat(auditRowsFor(member.id())).as("a refused grant leaves no audit row").isEqualTo(auditBefore);
        assertThat(permissionsVersion(member.id())).isEqualTo(pvBefore);
    }

    @Test
    void adminCannotTouchAnOwnerOrAnotherAdmin() throws Exception {
        TestUser admin = withRole("admin", "ADMIN");
        TestUser otherAdmin = withRole("other-admin", "ADMIN");

        for (UUID protectedTarget : List.of(boss.id(), otherAdmin.id())) {
            call(HttpMethod.POST, "/v1/admin/users/" + protectedTarget + "/suspend", admin.bearer())
                    .andExpect(status().isForbidden());
            call(HttpMethod.PUT, "/v1/admin/users/" + protectedTarget + "/roles/DEVELOPER", admin.bearer())
                    .andExpect(status().isForbidden());
            call(HttpMethod.DELETE, "/v1/admin/users/" + protectedTarget + "/roles/ADMIN", admin.bearer())
                    .andExpect(status().isForbidden());
        }
        call(HttpMethod.DELETE, "/v1/admin/users/" + boss.id() + "/roles/OWNER", admin.bearer())
                .andExpect(status().isForbidden());
        call(HttpMethod.GET, "/v1/admin/users/" + boss.id(), boss.bearer()).andExpect(jsonPath("$.suspended").value(false));
    }

    @Test
    void adminCanAssignMemberDeveloperAndAuditor() throws Exception {
        TestUser admin = withRole("admin", "ADMIN");
        TestUser target = withRole("target", null);
        for (String role : List.of("DEVELOPER", "AUDITOR")) {
            call(HttpMethod.PUT, "/v1/admin/users/" + target.id() + "/roles/" + role, admin.bearer())
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.roles", hasItem(role)));
        }
        call(HttpMethod.DELETE, "/v1/admin/users/" + target.id() + "/roles/AUDITOR", admin.bearer())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles", not(hasItem("AUDITOR"))));
    }

    @Test
    void onlyAnOwnerCanGrantAndRevokeAdminAndOwner() throws Exception {
        TestUser target = withRole("target", null);
        call(HttpMethod.PUT, "/v1/admin/users/" + target.id() + "/roles/ADMIN", boss.bearer())
                .andExpect(status().isOk()).andExpect(jsonPath("$.roles", hasItem("ADMIN")));
        call(HttpMethod.PUT, "/v1/admin/users/" + target.id() + "/roles/OWNER", boss.bearer())
                .andExpect(status().isOk()).andExpect(jsonPath("$.roles", hasItem("OWNER")));
        // the new owner can use owner powers immediately
        call(HttpMethod.PUT, "/v1/admin/users/" + target.id() + "/plan/PRO", target.bearer()).andExpect(status().isOk());
        call(HttpMethod.DELETE, "/v1/admin/users/" + target.id() + "/roles/OWNER", boss.bearer())
                .andExpect(status().isOk()).andExpect(jsonPath("$.roles", not(hasItem("OWNER"))));
        call(HttpMethod.DELETE, "/v1/admin/users/" + target.id() + "/roles/ADMIN", boss.bearer())
                .andExpect(status().isOk()).andExpect(jsonPath("$.roles", not(hasItem("ADMIN"))));
    }

    @Test
    void theLastOwnerCannotBeRevokedOrSuspended() throws Exception {
        // boss is the only OWNER
        call(HttpMethod.DELETE, "/v1/admin/users/" + boss.id() + "/roles/OWNER", boss.bearer())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LAST_OWNER"));
        call(HttpMethod.POST, "/v1/admin/users/" + boss.id() + "/suspend", boss.bearer())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LAST_OWNER"));

        // a second OWNER that is suspended does not count as a remaining owner
        TestUser second = withRole("owner2", "OWNER");
        TestUsers.suspendDirectly(dsl, second);
        call(HttpMethod.DELETE, "/v1/admin/users/" + boss.id() + "/roles/OWNER", boss.bearer())
                .andExpect(status().isConflict());

        // with another active OWNER the first can be demoted (checked on the second, so boss keeps the role)
        call(HttpMethod.POST, "/v1/admin/users/" + second.id() + "/restore", boss.bearer()).andExpect(status().isOk());
        call(HttpMethod.DELETE, "/v1/admin/users/" + second.id() + "/roles/OWNER", boss.bearer())
                .andExpect(status().isOk());

        call(HttpMethod.GET, "/v1/admin/users/" + boss.id(), boss.bearer())
                .andExpect(jsonPath("$.roles", hasItem("OWNER")))
                .andExpect(jsonPath("$.suspended").value(false));
    }

    @Test
    void anOwnerMayStepDownOnlyWhileAnotherActiveOwnerRemains() throws Exception {
        TestUser second = withRole("owner2", "OWNER");
        // two active owners: the second may step down by themselves
        call(HttpMethod.DELETE, "/v1/admin/users/" + second.id() + "/roles/OWNER", second.bearer())
                .andExpect(status().isOk());
        // now second is a plain member again and boss is the sole owner
        call(HttpMethod.DELETE, "/v1/admin/users/" + boss.id() + "/roles/OWNER", boss.bearer())
                .andExpect(status().isConflict());
    }

    @Test
    void memberRoleCannotBeRevokedAndAdminsCannotSuspendThemselves() throws Exception {
        TestUser admin = withRole("admin", "ADMIN");
        call(HttpMethod.POST, "/v1/admin/users/" + admin.id() + "/suspend", admin.bearer())
                .andExpect(status().isForbidden()); // an ADMIN is a privileged target: only an OWNER may touch it
        TestUser dev = withRole("dev", "DEVELOPER");
        call(HttpMethod.DELETE, "/v1/admin/users/" + dev.id() + "/roles/MEMBER", boss.bearer())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BASELINE_ROLE"));
    }

    @Test
    void anOwnerCannotSuspendThemselvesEvenWhenAnotherOwnerExists() throws Exception {
        TestUser second = withRole("owner2", "OWNER");
        call(HttpMethod.POST, "/v1/admin/users/" + second.id() + "/suspend", second.bearer())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("SELF_SUSPEND"));
        call(HttpMethod.GET, "/v1/admin/users/" + second.id(), boss.bearer()).andExpect(jsonPath("$.suspended").value(false));
    }

    // ---- suspension ----

    @Test
    void suspendingAUserBlocksTheExchangeAndRestoringReopensIt() throws Exception {
        TestUser target = withRole("target", null);
        call(HttpMethod.POST, "/v1/token/exchange", target.bearer()).andExpect(status().isOk());

        call(HttpMethod.POST, "/v1/admin/users/" + target.id() + "/suspend", boss.bearer())
                .andExpect(status().isOk()).andExpect(jsonPath("$.suspended").value(true));
        call(HttpMethod.POST, "/v1/token/exchange", target.bearer())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("USER_SUSPENDED"));
        // a suspended admin also loses admin access at once
        call(HttpMethod.GET, "/v1/admin/users", target.bearer()).andExpect(status().isForbidden());

        call(HttpMethod.POST, "/v1/admin/users/" + target.id() + "/restore", boss.bearer())
                .andExpect(status().isOk()).andExpect(jsonPath("$.suspended").value(false));
        call(HttpMethod.POST, "/v1/token/exchange", target.bearer()).andExpect(status().isOk());
    }

    @Test
    void suspendedAdminLosesAdminPowers() throws Exception {
        TestUser admin = withRole("admin", "ADMIN");
        call(HttpMethod.GET, "/v1/admin/users", admin.bearer()).andExpect(status().isOk());
        call(HttpMethod.POST, "/v1/admin/users/" + admin.id() + "/suspend", boss.bearer()).andExpect(status().isOk());
        call(HttpMethod.GET, "/v1/admin/users", admin.bearer()).andExpect(status().isForbidden());
    }

    // ---- plans ----

    @Test
    void ownerChangesPlansAndInvalidPlansAreRejected() throws Exception {
        TestUser target = withRole("target", null);
        call(HttpMethod.PUT, "/v1/admin/users/" + target.id() + "/plan/DEVELOPER", boss.bearer())
                .andExpect(status().isOk()).andExpect(jsonPath("$.plan").value("DEVELOPER"));
        call(HttpMethod.PUT, "/v1/admin/users/" + target.id() + "/plan/GOLD", boss.bearer())
                .andExpect(status().isBadRequest());
        call(HttpMethod.GET, "/v1/admin/users/" + target.id(), boss.bearer()).andExpect(jsonPath("$.plan").value("DEVELOPER"));
    }

    // ---- audit trail ----

    @Test
    void everyMutationWritesExactlyOneAuditRowAndBumpsPermissionsVersion() throws Exception {
        TestUser target = withRole("audited", null);
        int pv = permissionsVersion(target.id());
        long rows = auditRowsFor(target.id());

        String[][] steps = {
            {"PUT", "/v1/admin/users/" + target.id() + "/roles/DEVELOPER", "ROLE_GRANTED"},
            {"DELETE", "/v1/admin/users/" + target.id() + "/roles/DEVELOPER", "ROLE_REVOKED"},
            {"POST", "/v1/admin/users/" + target.id() + "/suspend", "USER_SUSPENDED"},
            {"POST", "/v1/admin/users/" + target.id() + "/restore", "USER_RESTORED"},
            {"PUT", "/v1/admin/users/" + target.id() + "/plan/PRO", "PLAN_CHANGED"},
        };
        for (String[] step : steps) {
            call(HttpMethod.valueOf(step[0]), step[1], boss.bearer()).andExpect(status().isOk());
            rows++;
            pv++;
            assertThat(auditRowsFor(target.id())).as(step[2]).isEqualTo(rows);
            assertThat(permissionsVersion(target.id())).as("pv after " + step[2]).isEqualTo(pv);
            var latest = dsl.selectFrom(AUDIT_LOG).where(AUDIT_LOG.TARGET_ID.eq(target.id()))
                    .orderBy(AUDIT_LOG.AT.desc(), AUDIT_LOG.ID.desc()).limit(1).fetchOne();
            assertThat(latest.getAction()).isEqualTo(step[2]);
            assertThat(latest.getActorId()).isEqualTo(boss.id());
        }
        var detail = dsl.select(AUDIT_LOG.DETAIL).from(AUDIT_LOG)
                .where(AUDIT_LOG.TARGET_ID.eq(target.id()).and(AUDIT_LOG.ACTION.eq("PLAN_CHANGED")))
                .fetchOne(AUDIT_LOG.DETAIL);
        assertThat(detail.data()).contains("\"from\"").contains("FREE").contains("\"to\"").contains("PRO");
    }

    @Test
    void repeatingAnAlreadyAppliedChangeIsANoOpWithoutAuditRow() throws Exception {
        TestUser target = withRole("noop", null);
        call(HttpMethod.PUT, "/v1/admin/users/" + target.id() + "/roles/AUDITOR", boss.bearer()).andExpect(status().isOk());
        long rows = auditRowsFor(target.id());
        int pv = permissionsVersion(target.id());
        call(HttpMethod.PUT, "/v1/admin/users/" + target.id() + "/roles/AUDITOR", boss.bearer()).andExpect(status().isOk());
        assertThat(auditRowsFor(target.id())).isEqualTo(rows);
        assertThat(permissionsVersion(target.id())).isEqualTo(pv);
    }

    @Test
    void auditRowsCannotBeUpdatedOrDeleted() throws Exception {
        TestUser target = withRole("immutable", null);
        call(HttpMethod.PUT, "/v1/admin/users/" + target.id() + "/roles/AUDITOR", boss.bearer()).andExpect(status().isOk());
        UUID auditId = dsl.select(AUDIT_LOG.ID).from(AUDIT_LOG).where(AUDIT_LOG.TARGET_ID.eq(target.id())).limit(1)
                .fetchOne(AUDIT_LOG.ID);

        assertThatThrownBy(() -> dsl.update(AUDIT_LOG).set(AUDIT_LOG.ACTION, "TAMPERED")
                        .where(AUDIT_LOG.ID.eq(auditId)).execute())
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("append-only");
        assertThatThrownBy(() -> dsl.deleteFrom(AUDIT_LOG).where(AUDIT_LOG.ID.eq(auditId)).execute())
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("append-only");
        assertThat(dsl.fetchCount(AUDIT_LOG, AUDIT_LOG.ID.eq(auditId).and(AUDIT_LOG.ACTION.eq("ROLE_GRANTED")))).isEqualTo(1);
    }

    @Test
    void bootstrapOwnerGrantIsAudited() {
        assertThat(dsl.fetchCount(AUDIT_LOG, AUDIT_LOG.TARGET_ID.eq(boss.id()).and(AUDIT_LOG.ACTION.eq("ROLE_GRANTED"))
                        .and(AUDIT_LOG.ACTOR_ID.isNull())))
                .isGreaterThanOrEqualTo(1);
    }

    @Test
    void auditEndpointListsNewestFirstAndFiltersByTarget() throws Exception {
        TestUser target = withRole("trail", null);
        call(HttpMethod.PUT, "/v1/admin/users/" + target.id() + "/roles/AUDITOR", boss.bearer()).andExpect(status().isOk());
        call(HttpMethod.PUT, "/v1/admin/users/" + target.id() + "/plan/PRO", boss.bearer()).andExpect(status().isOk());

        call(HttpMethod.GET, "/v1/admin/audit?targetId=" + target.id(), boss.bearer())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[0].action").value("PLAN_CHANGED"))
                .andExpect(jsonPath("$.items[1].action").value("ROLE_GRANTED"))
                .andExpect(jsonPath("$.items[1].detail.role").value("AUDITOR"))
                .andExpect(jsonPath("$.items[1].actorId").value(boss.id().toString()));
    }

    // ---- reads ----

    @Test
    void listIsPagedAndSearchable() throws Exception {
        String marker = "findme-" + UUID.randomUUID();
        TestUser a = TestUsers.signIn(mvc, "uid-" + marker + "-a", marker + "-a@example.com", true);
        TestUsers.signIn(mvc, "uid-" + marker + "-b", marker + "-b@example.com", true);

        call(HttpMethod.GET, "/v1/admin/users?q=" + marker.toUpperCase() + "&size=1&page=0", boss.bearer())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.items", hasSize(1)));
        call(HttpMethod.GET, "/v1/admin/users?q=" + marker + "-a", boss.bearer())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(a.id().toString()))
                .andExpect(jsonPath("$.items[0].firebaseUid").doesNotExist());
        call(HttpMethod.GET, "/v1/admin/users?q=%25", boss.bearer()).andExpect(jsonPath("$.total").value(0));
        call(HttpMethod.GET, "/v1/admin/users?size=1000", boss.bearer()).andExpect(status().isBadRequest());
        call(HttpMethod.GET, "/v1/admin/users?page=-1", boss.bearer()).andExpect(status().isBadRequest());
    }

    @Test
    void unknownUsersAndRolesAreNotFound() throws Exception {
        call(HttpMethod.GET, "/v1/admin/users/" + UUID.randomUUID(), boss.bearer()).andExpect(status().isNotFound());
        call(HttpMethod.PUT, "/v1/admin/users/" + UUID.randomUUID() + "/roles/DEVELOPER", boss.bearer())
                .andExpect(status().isNotFound());
        call(HttpMethod.PUT, "/v1/admin/users/" + boss.id() + "/roles/NOPE", boss.bearer())
                .andExpect(status().isNotFound());
        call(HttpMethod.PUT, "/v1/admin/users/" + boss.id() + "/roles/USER", boss.bearer())
                .andExpect(status().isNotFound());
    }

    @Test
    void rolesEndpointListsEveryPersonaWithItsPermissions() throws Exception {
        String body = call(HttpMethod.GET, "/v1/admin/roles", boss.bearer())
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<java.util.Map<String, Object>> roles = com.jayway.jsonpath.JsonPath.read(body, "$");
        assertThat(roles.stream().map(r -> (String) r.get("name")))
                .containsExactlyInAnyOrder("OWNER", "ADMIN", "DEVELOPER", "MEMBER", "AUDITOR");
        for (var role : roles) {
            int expected = switch ((String) role.get("name")) {
                case "MEMBER" -> 3;
                case "DEVELOPER" -> 9;
                case "AUDITOR" -> 4;
                case "ADMIN" -> 11;
                default -> 19;
            };
            assertThat((List<?>) role.get("permissions")).as((String) role.get("name")).hasSize(expected);
        }
    }
}
