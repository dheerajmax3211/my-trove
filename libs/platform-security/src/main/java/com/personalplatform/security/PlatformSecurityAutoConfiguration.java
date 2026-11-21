package com.personalplatform.security;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.annotation.AnnotationTemplateExpressionDefaults;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Secure-by-default for every service: stateless, token authenticated, health endpoints public.
 * <p>
 * {@code app.security.mode=firebase} (default) accepts Firebase ID tokens; {@code platform} accepts platform tokens
 * issued by {@code auth} (see {@link PlatformJwtDecoderFactory}) and maps their claims to authorities
 * (see {@link PermissionAuthoritiesConverter}). A service that needs a different chain or decoder just declares its
 * own bean; these back off (a service with its own chain should obtain its decoder from {@link IdentityDecoderFactory}).
 * Identity inside a service is {@code @AuthenticationPrincipal Jwt jwt} -> {@code jwt.getSubject()} (Firebase uid).
 * <p>
 * Method security is enabled so {@link RequiresPermission} works; it only affects beans that carry such annotations.
 */
@AutoConfiguration
@EnableConfigurationProperties({FirebaseProperties.class, PlatformProperties.class, SecurityModeProperties.class})
public class PlatformSecurityAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(JwtDecoder.class)
    JwtDecoder identityJwtDecoder(
            SecurityModeProperties mode, FirebaseProperties firebase, PlatformProperties platform) {
        return IdentityDecoderFactory.create(mode.mode(), firebase, platform);
    }

    @Bean
    @ConditionalOnMissingBean(SecurityFilterChain.class)
    SecurityFilterChain platformFilterChain(HttpSecurity http, SecurityModeProperties mode) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> {
                    if (mode.mode() == SecurityMode.PLATFORM) {
                        j.jwtAuthenticationConverter(PermissionAuthoritiesConverter.jwtAuthenticationConverter());
                    }
                }));
        return http.build();
    }

    /** Switches on {@code @PreAuthorize}-style checks, which {@link RequiresPermission} is built on. */
    @Configuration(proxyBeanMethods = false)
    @EnableMethodSecurity(proxyTargetClass = true)
    static class MethodSecurityConfiguration {

        /** Resolves the {@code {value}} placeholder of {@link RequiresPermission}. */
        @Bean
        @ConditionalOnMissingBean
        static AnnotationTemplateExpressionDefaults requiresPermissionTemplateDefaults() {
            return new AnnotationTemplateExpressionDefaults();
        }
    }
}
