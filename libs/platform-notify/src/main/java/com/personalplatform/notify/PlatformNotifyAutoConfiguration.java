package com.personalplatform.notify;

import java.util.Optional;
import org.jooq.DSLContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Wires the notification pieces into every service that depends on this module. Needs a {@code DSLContext} on the
 * service's datasource; the shared schema must exist in that database (it does: one Postgres, one schema per service).
 */
@AutoConfiguration
@EnableConfigurationProperties(NotifyProperties.class)
public class PlatformNotifyAutoConfiguration {

    @Bean
    NotificationOutbox notificationOutbox(DSLContext dsl) {
        return new NotificationOutbox(dsl);
    }

    @Bean
    ContactDirectory contactDirectory(DSLContext dsl) {
        return new ContactDirectory(dsl);
    }

    /** {@code app.mail.enabled=true}: real email over SMTP (Mailpit in dev). */
    @Bean
    @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(prefix = "app.mail", name = "enabled",
            havingValue = "true")
    NotificationSender smtpNotificationSender(NotifyProperties props) {
        return new SmtpNotificationSender(props);
    }

    /** Default: write what would be sent to the log (subjects and recipients only, never bodies). */
    @Bean
    @Conditional(LoggingSenderCondition.class)
    NotificationSender loggingNotificationSender() {
        return new LoggingNotificationSender();
    }

    /** Records the caller's email from the platform token on every request, so others can reach them later. */
    @Configuration(proxyBeanMethods = false)
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    @ConditionalOnClass(WebMvcConfigurer.class)
    static class ContactRecordingConfiguration {

        @Bean
        WebMvcConfigurer platformNotifyContactRecording(ContactDirectory contacts) {
            return new WebMvcConfigurer() {
                @Override
                public void addInterceptors(InterceptorRegistry registry) {
                    registry.addInterceptor(new ContactRecordingInterceptor(contacts));
                }
            };
        }
    }

    /** Logging is the default sender unless email is enabled or a service supplies its own sender. */
    static class LoggingSenderCondition implements Condition {
        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            Environment env = context.getEnvironment();
            boolean mailEnabled = Boolean.parseBoolean(env.getProperty("app.mail.enabled", "false"));
            String sender = env.getProperty("app.notifications.sender", "logging");
            return !mailEnabled && "logging".equals(sender);
        }
    }

    static final class ContactRecordingInterceptor implements HandlerInterceptor {

        private static final Logger LOG = LoggerFactory.getLogger(ContactRecordingInterceptor.class);

        private final ContactDirectory contacts;

        ContactRecordingInterceptor(ContactDirectory contacts) {
            this.contacts = contacts;
        }

        @Override
        public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
            Optional<Jwt> jwt = currentJwt();
            if (jwt.isPresent()) {
                String email = jwt.get().getClaimAsString("email");
                try {
                    contacts.remember(jwt.get().getSubject(), email);
                } catch (RuntimeException e) {
                    // Best effort: a failed contact write must never fail the caller's request.
                    LOG.debug("Could not record contact address: {}", e.toString());
                }
            }
            return true;
        }

        private static Optional<Jwt> currentJwt() {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
                return Optional.of(jwt);
            }
            return Optional.empty();
        }
    }
}
