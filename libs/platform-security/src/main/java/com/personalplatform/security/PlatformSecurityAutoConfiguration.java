package com.personalplatform.security;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Secure-by-default for every service: stateless, Firebase-token authenticated, health endpoints public.
 * A service that needs a different chain or decoder just declares its own bean; these back off.
 * Identity inside a service is {@code @AuthenticationPrincipal Jwt jwt} -> {@code jwt.getSubject()} (Firebase uid).
 */
@AutoConfiguration
@EnableConfigurationProperties(FirebaseProperties.class)
public class PlatformSecurityAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(JwtDecoder.class)
    JwtDecoder firebaseJwtDecoder(FirebaseProperties props) {
        return FirebaseJwtDecoderFactory.create(props);
    }

    @Bean
    @ConditionalOnMissingBean(SecurityFilterChain.class)
    SecurityFilterChain platformFilterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> {}));
        return http.build();
    }
}
