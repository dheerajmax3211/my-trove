package com.personalplatform.auth.config;

import com.personalplatform.auth.user.AuthUser;
import com.personalplatform.auth.user.UserService;
import java.util.stream.Collectors;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, Converter<Jwt, AbstractAuthenticationToken> converter)
            throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers("/v1/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(converter)));
        return http.build();
    }

    /** Roles live in Postgres (source of truth); the token only proves who the caller is. */
    @Bean
    Converter<Jwt, AbstractAuthenticationToken> jwtToAuthentication(UserService users) {
        return jwt -> {
            AuthUser user = users.resolve(jwt);
            var authorities = user.roles().stream()
                    .map(r -> new SimpleGrantedAuthority("ROLE_" + r))
                    .collect(Collectors.toSet());
            return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
        };
    }
}
