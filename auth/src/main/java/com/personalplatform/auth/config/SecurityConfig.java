package com.personalplatform.auth.config;

import com.personalplatform.auth.common.ProblemResponses;
import com.personalplatform.auth.token.ApiKeyBearer;
import jakarta.servlet.http.HttpServletRequest;
import com.personalplatform.auth.user.AuthUser;
import com.personalplatform.auth.user.UserService;
import java.util.HashSet;
import java.util.Set;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.security.autoconfigure.actuate.web.servlet.EndpointRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableMethodSecurity
@EnableConfigurationProperties(AppProperties.class)
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, Converter<Jwt, AbstractAuthenticationToken> converter)
            throws Exception {
        BearerTokenAuthenticationEntryPoint bearerEntryPoint = new BearerTokenAuthenticationEntryPoint();
        // A pk_ key is not a JWT: the exchange controller verifies it itself, so the resource server must not try.
        DefaultBearerTokenResolver jwtBearer = new DefaultBearerTokenResolver();
        BearerTokenResolver bearerResolver = request -> ApiKeyBearer.presented(request).isPresent() ? null : jwtBearer.resolve(request);
        RequestMatcher apiKeyExchange = (HttpServletRequest request) -> ApiKeyBearer.isApiKeyExchange(request);
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers(HttpMethod.GET, "/.well-known/jwks.json").permitAll()
                        .requestMatchers(apiKeyExchange).permitAll()
                        // Coarse gate; every admin handler additionally carries its own @PreAuthorize.
                        .requestMatchers(HttpMethod.GET, "/v1/admin/**").hasAnyAuthority("users:read", "audit:read")
                        .requestMatchers("/v1/admin/**").hasAnyAuthority("users:write", "roles:assign", "plans:manage")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o
                        .bearerTokenResolver(bearerResolver)
                        .jwt(j -> j.jwtAuthenticationConverter(converter))
                        .authenticationEntryPoint((req, res, ex) -> {
                            bearerEntryPoint.commence(req, res, ex);
                            ProblemResponses.write(res, HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED",
                                    "A valid bearer token is required");
                        })
                        .accessDeniedHandler((req, res, ex) -> ProblemResponses.write(
                                res, HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have permission to do this")));
        return http.build();
    }

    /**
     * {@code /internal/**}: service-to-service only, shared secret in {@code X-Internal-Key}
     * ({@code app.platform-service.internal-api-key}, env {@code APP_INTERNAL_API_KEY}); no JWT is looked at, and a
     * wrong or missing key is 401. The gateway blocks {@code /internal/**} on every route.
     */
    @Bean
    @Order(1)
    SecurityFilterChain internalChain(HttpSecurity http, AppProperties props) throws Exception {
        http.securityMatcher("/internal/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().hasRole("INTERNAL"))
                .addFilterBefore(new InternalApiKeyFilter(props.platformService().internalApiKey()),
                        UsernamePasswordAuthenticationFilter.class)
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) -> ProblemResponses.write(res, HttpStatus.UNAUTHORIZED,
                                "UNAUTHENTICATED", "Missing or invalid internal key"))
                        .accessDeniedHandler((req, res, ex) -> ProblemResponses.write(res, HttpStatus.FORBIDDEN,
                                "FORBIDDEN", "You do not have permission to do this")));
        return http.build();
    }

    /**
     * Roles and permissions live in Postgres (source of truth); the token only proves who the caller is. A suspended
     * user is authenticated but holds no authority at all. A token that acts for someone (an {@code act} object, as
     * on a delegated API-key token) never gets more than the permissions it carries, and no roles.
     */
    @Bean
    Converter<Jwt, AbstractAuthenticationToken> jwtToAuthentication(UserService users) {
        return jwt -> {
            AuthUser user = users.resolve(jwt);
            Set<GrantedAuthority> authorities = new HashSet<>();
            if (!user.suspended()) {
                if (jwt.getClaims().get("act") instanceof java.util.Map<?, ?>) {
                    Set<String> carried = new HashSet<>();
                    if (jwt.getClaims().get("permissions") instanceof java.util.Collection<?> items) {
                        items.forEach(i -> carried.add(String.valueOf(i)));
                    }
                    user.permissions().stream().filter(carried::contains)
                            .forEach(p -> authorities.add(new SimpleGrantedAuthority(p)));
                } else {
                    user.roles().forEach(r -> authorities.add(new SimpleGrantedAuthority("ROLE_" + r)));
                    user.permissions().forEach(p -> authorities.add(new SimpleGrantedAuthority(p)));
                }
            }
            return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
        };
    }

    /**
     * Actuator endpoints for the private management port (Prometheus scrape, health). {@link EndpointRequest} only
     * matches in the management context when the management port differs from the main one, so the main port never
     * serves these paths and its own chains still answer 401 for them. The management port must stay private.
     */
    @Bean
    @Order(0)
    SecurityFilterChain actuatorChain(HttpSecurity http) throws Exception {
        http.securityMatcher(EndpointRequest.toAnyEndpoint())
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }
}
