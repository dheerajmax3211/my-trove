package com.personalplatform.legacy.vault;

import com.personalplatform.legacy.config.LegacyProperties;
import com.personalplatform.legacy.protocol.Contact;
import com.personalplatform.legacy.protocol.EscalationStep;
import com.personalplatform.legacy.protocol.SwitchPolicy;
import com.personalplatform.legacy.web.InvalidRequestException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Semantic checks beyond bean validation: bounds from configuration, schedule ordering, contact formats. */
@Component
public class PolicyValidator {

    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final Pattern PHONE = Pattern.compile("^\\+[1-9][0-9]{6,14}$");
    private static final int MAX_STEPS = 10;
    private static final int MAX_CONTACTS = 5;

    private final LegacyProperties props;

    public PolicyValidator(LegacyProperties props) {
        this.props = props;
    }

    public void validate(SwitchPolicy p) {
        List<String> problems = new ArrayList<>();
        var l = props.limits();
        range("checkInIntervalSeconds", p.checkInInterval(), l.minInterval(), l.maxInterval(), problems);
        range("graceSeconds", p.grace(), l.minGrace(), l.maxGrace(), problems);
        range("coolOffSeconds", p.coolOff(), l.minCoolOff(), l.maxCoolOff(), problems);
        if (p.escalationDuration().compareTo(l.maxEscalation()) > 0) {
            problems.add("escalationDurationSeconds exceeds " + l.maxEscalation().toSeconds());
        }
        if (p.maxPause().compareTo(l.maxPause()) > 0) {
            problems.add("maxPauseSeconds exceeds the platform maximum of " + l.maxPause().toSeconds());
        }
        if (p.quorum() > props.maxTrustees()) {
            problems.add("quorum exceeds the maximum number of trustees (" + props.maxTrustees() + ")");
        }
        List<EscalationStep> steps = p.steps();
        if (steps != null) {
            if (steps.size() > MAX_STEPS) {
                problems.add("at most " + MAX_STEPS + " escalation steps");
            }
            long prevOffset = -1;
            int prevUrgency = -1;
            for (int i = 0; i < steps.size(); i++) {
                EscalationStep s = steps.get(i);
                if (s.offsetSeconds() <= prevOffset) {
                    problems.add("steps[" + i + "].offsetSeconds must be strictly greater than the previous step");
                }
                if (s.urgency().ordinal() < prevUrgency) {
                    problems.add("steps[" + i + "].urgency must not be lower than the previous step");
                }
                if (new HashSet<>(s.channels()).size() != s.channels().size()) {
                    problems.add("steps[" + i + "].channels must not repeat");
                }
                prevOffset = s.offsetSeconds();
                prevUrgency = s.urgency().ordinal();
            }
            if (prevOffset > p.escalationDurationSeconds()) {
                problems.add("escalationDurationSeconds must be at least the last step's offsetSeconds");
            }
        }
        validateContacts("ownerContacts", p.ownerContacts(), problems);
        if (!problems.isEmpty()) {
            throw new InvalidRequestException(problems);
        }
    }

    public static void validateContacts(String field, List<Contact> contacts, List<String> problems) {
        if (contacts == null || contacts.isEmpty()) {
            problems.add(field + " needs at least one contact");
            return;
        }
        if (contacts.size() > MAX_CONTACTS) {
            problems.add(field + " allows at most " + MAX_CONTACTS + " contacts");
        }
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < contacts.size(); i++) {
            Contact c = contacts.get(i);
            if (c == null || c.channel() == null || c.address() == null) {
                problems.add(field + "[" + i + "] is incomplete");
                continue;
            }
            boolean ok = switch (c.channel()) {
                case EMAIL -> EMAIL.matcher(c.address()).matches();
                case SMS -> PHONE.matcher(c.address()).matches();
                case PUSH -> c.address().length() >= 8 && c.address().length() <= 254 && !c.address().contains(" ");
            };
            if (!ok) {
                problems.add(field + "[" + i + "] has an invalid " + c.channel() + " address");
            }
            if (!seen.add(c.channel() + ":" + c.address())) {
                problems.add(field + "[" + i + "] is a duplicate");
            }
        }
    }

    private static void range(String field, Duration v, Duration min, Duration max, List<String> problems) {
        if (v.compareTo(min) < 0 || v.compareTo(max) > 0) {
            problems.add(field + " must be between " + min.toSeconds() + " and " + max.toSeconds());
        }
    }
}
