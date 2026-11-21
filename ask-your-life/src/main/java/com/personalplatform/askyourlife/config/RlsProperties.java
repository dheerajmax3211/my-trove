package com.personalplatform.askyourlife.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Row-level security wiring ({@code app.rls.*}).
 *
 * @param role the non-superuser role every transaction switches to with {@code SET LOCAL ROLE}. Blank means the
 *             datasource already connects as a role subject to RLS (then no switching is needed).
 */
@ConfigurationProperties(prefix = "app.rls")
public record RlsProperties(@DefaultValue("ask_life_app") String role) {}
