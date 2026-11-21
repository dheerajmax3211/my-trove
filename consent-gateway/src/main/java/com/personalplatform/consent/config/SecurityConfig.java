package com.personalplatform.consent.config;

import com.personalplatform.consent.keys.GatewayJwtDecoderFactory;
import com.personalplatform.consent.keys.SigningKeyService;
import com.personalplatform.consent.token.GatewayTokenConverter;
import com.personalplatform.security.FirebaseJwtDecoderFactory;
import com.personalplatform.security.FirebaseProperties;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Three chains, evaluated in order:
 * <ol>
 *   <li>{@code /v1/gateway/**}: the gateway's OWN RS256 tokens (client tokens and access tokens);</li>
 *   <li>{@code /v1/oauth/**} and {@code /.well-known/**}: public; clients authenticate with id + secret in the controller;</li>
 *   <li>everything else (owner APIs): Firebase ID tokens, exactly like the other services.</li>
 * </ol>
 * Because this service declares its own {@code JwtDecoder} beans, the platform-security default decoder backs off, so
 * the Firebase decoder is declared here explicitly. Decoders are selected by qualifier, never by type.
 */
@Configuration
public class SecurityConfig {

    public static final String TOKEN_ACCESS = "TOKEN_ACCESS";
    public static final String TOKEN_CLIENT = "TOKEN_CLIENT";

    @Bean
    @Qualifier("firebase")
    JwtDecoder firebaseJwtDecoder(FirebaseProperties props) {
        return FirebaseJwtDecoderFactory.create(props);
    }

    @Bean
    @Qualifier("gateway")
    JwtDecoder gatewayJwtDecoder(SigningKeyService keys, ConsentProperties props, Clock clock) {
        return GatewayJwtDecoderFactory.create(keys.jwkSource(), props, clock);
    }

    @Bean
    @Order(1)
    SecurityFilterChain gatewayChain(
            HttpSecurity http, @Qualifier("gateway") JwtDecoder decoder, GatewayTokenConverter converter)
            throws Exception {
        http.securityMatcher("/v1/gateway/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/v1/gateway/data", "/v1/gateway/data/**").hasAuthority(TOKEN_ACCESS)
                        .anyRequest().hasAuthority(TOKEN_CLIENT))
                .oauth2ResourceServer(o -> o.jwt(j -> j.decoder(decoder).jwtAuthenticationConverter(converter)));
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain publicOauthChain(HttpSecurity http) throws Exception {
        http.securityMatcher("/v1/oauth/**", "/.well-known/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }

    @Bean
    @Order(3)
    SecurityFilterChain ownerChain(HttpSecurity http, @Qualifier("firebase") JwtDecoder decoder) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> j.decoder(decoder)));
        return http.build();
    }
}
