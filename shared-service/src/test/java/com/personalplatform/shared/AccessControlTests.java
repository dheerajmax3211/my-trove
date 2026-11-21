package com.personalplatform.shared;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.empty;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

/** A user outside the household (and outside a personal resource) is refused on every endpoint. */
class AccessControlTests extends AbstractIntegrationTest {

    private static final String DUE = "\"dueAt\":\"2026-02-01T09:00:00Z\"";

    @Test
    void unauthenticatedRequestsAre401() throws Exception {
        for (String path : new String[] {"/v1/households", "/v1/reminders", "/v1/files", "/v1/audit", "/v1/notifications"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
        mvc.perform(get("/v1/households").header("Authorization", "Bearer !!!")).andExpect(status().isUnauthorized());
    }

    @Test
    void outsiderIsRefusedOnEveryHouseholdEndpoint() throws Exception {
        String alice = uid("alice"), mallory = uid("mallory");
        UUID h = createHousehold(alice, "Home");
        String inviteId = read(postAs(alice, "/v1/households/" + h + "/invites", "{}"), "$.id");

        getAs(mallory, "/v1/households/" + h).andExpect(status().isNotFound());
        getAs(mallory, "/v1/households/" + h + "/membership").andExpect(status().isNotFound());
        deleteAs(mallory, "/v1/households/" + h).andExpect(status().isNotFound());
        postAs(mallory, "/v1/households/" + h + "/invites", "{}").andExpect(status().isNotFound());
        getAs(mallory, "/v1/households/" + h + "/invites").andExpect(status().isNotFound());
        deleteAs(mallory, "/v1/households/" + h + "/invites/" + inviteId).andExpect(status().isNotFound());
        postAs(mallory, "/v1/households/" + h + "/leave", "").andExpect(status().isNotFound());
        deleteAs(mallory, "/v1/households/" + h + "/members/" + alice).andExpect(status().isNotFound());
        putAs(mallory, "/v1/households/" + h + "/members/" + alice + "/role", "{\"role\":\"MEMBER\"}")
                .andExpect(status().isNotFound());
        getAs(mallory, "/v1/households").andExpect(jsonPath("$", hasSize(0)));
        // and nothing changed for alice
        getAs(alice, "/v1/households/" + h).andExpect(status().isOk()).andExpect(jsonPath("$.members", hasSize(1)));
    }

    @Test
    void outsiderIsRefusedOnHouseholdReminders() throws Exception {
        String alice = uid("alice"), mallory = uid("mallory");
        UUID h = createHousehold(alice, "Home");
        String id = read(postAs(alice, "/v1/reminders",
                "{\"title\":\"Bins\"," + DUE + ",\"householdId\":\"" + h + "\"}"), "$.id");

        postAs(mallory, "/v1/reminders", "{\"title\":\"x\"," + DUE + ",\"householdId\":\"" + h + "\"}")
                .andExpect(status().isNotFound());
        getAs(mallory, "/v1/reminders?householdId=" + h).andExpect(status().isNotFound());
        getAs(mallory, "/v1/reminders").andExpect(jsonPath("$", empty()));
        getAs(mallory, "/v1/reminders/" + id).andExpect(status().isNotFound());
        putAs(mallory, "/v1/reminders/" + id, "{\"title\":\"hacked\"," + DUE + "}").andExpect(status().isNotFound());
        postAs(mallory, "/v1/reminders/" + id + "/cancel", "").andExpect(status().isNotFound());
        getAs(alice, "/v1/reminders/" + id).andExpect(jsonPath("$.title").value("Bins"))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void personalReminderIsInvisibleToOtherUsers() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        String id = read(postAs(alice, "/v1/reminders", "{\"title\":\"secret\"," + DUE + "}"), "$.id");
        getAs(bob, "/v1/reminders/" + id).andExpect(status().isNotFound());
        putAs(bob, "/v1/reminders/" + id, "{\"title\":\"hacked\"," + DUE + "}").andExpect(status().isNotFound());
        postAs(bob, "/v1/reminders/" + id + "/cancel", "").andExpect(status().isNotFound());
        getAs(bob, "/v1/reminders").andExpect(jsonPath("$", empty()));
    }

    @Test
    void householdMemberWhoDidNotCreateAReminderCannotChangeItUnlessOwner() throws Exception {
        String alice = uid("alice"), bob = uid("bob"), carol = uid("carol");
        UUID h = createHousehold(alice, "Home");
        join(bob, h, alice);
        join(carol, h, alice);
        String id = read(postAs(bob, "/v1/reminders", "{\"title\":\"bobs\"," + DUE + ",\"householdId\":\"" + h + "\"}"), "$.id");

        getAs(carol, "/v1/reminders/" + id).andExpect(status().isOk()); // visible to all members
        putAs(carol, "/v1/reminders/" + id, "{\"title\":\"x\"," + DUE + "}").andExpect(status().isForbidden());
        postAs(carol, "/v1/reminders/" + id + "/cancel", "").andExpect(status().isForbidden());
        postAs(alice, "/v1/reminders/" + id + "/cancel", "").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void outsiderIsRefusedOnFiles() throws Exception {
        String alice = uid("alice"), mallory = uid("mallory");
        UUID h = createHousehold(alice, "Home");
        MockMultipartFile file = new MockMultipartFile("file", "a.txt", "text/plain", "hello".getBytes());
        String hid = read(send(alice, multipart("/v1/files").file(file).param("householdId", h.toString()))
                .andExpect(status().isCreated()), "$.id");
        String pid = read(send(alice, multipart("/v1/files").file(file)).andExpect(status().isCreated()), "$.id");

        send(mallory, multipart("/v1/files").file(file).param("householdId", h.toString()))
                .andExpect(status().isNotFound());
        getAs(mallory, "/v1/files?householdId=" + h).andExpect(status().isNotFound());
        getAs(mallory, "/v1/files").andExpect(jsonPath("$", empty()));
        for (String id : new String[] {hid, pid}) {
            getAs(mallory, "/v1/files/" + id).andExpect(status().isNotFound());
            deleteAs(mallory, "/v1/files/" + id).andExpect(status().isNotFound());
            postAs(mallory, "/v1/files/" + id + "/download-link", "{}").andExpect(status().isNotFound());
            getAs(alice, "/v1/files/" + id).andExpect(status().isOk());
        }
    }

    @Test
    void outsiderIsRefusedOnAudit() throws Exception {
        String alice = uid("alice"), mallory = uid("mallory");
        UUID h = createHousehold(alice, "Home");
        getAs(mallory, "/v1/audit?householdId=" + h).andExpect(status().isNotFound());
        getAs(alice, "/v1/audit?householdId=" + h).andExpect(status().isOk());
        // personal feed shows only the caller's own personal events
        getAs(mallory, "/v1/audit").andExpect(jsonPath("$.items", empty()));
    }

    @Test
    void notificationsAreOnlyVisibleToTheirRecipient() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        postAs(alice, "/v1/reminders", "{\"title\":\"x\"," + DUE + "}").andExpect(status().isCreated());
        dsl.execute("""
                insert into shared.notifications (id, reminder_id, recipient_uid, title, occurrence_at, status, attempts, next_attempt_at, created_at)
                select gen_random_uuid(), id, owner_uid, title, due_at, 'PENDING', 0, due_at, due_at from shared.reminders""");
        getAs(alice, "/v1/notifications").andExpect(jsonPath("$", hasSize(1)));
        getAs(bob, "/v1/notifications").andExpect(jsonPath("$", empty()));
    }
}
