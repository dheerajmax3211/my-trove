package com.personalplatform.legacy.config;

import org.jooq.JSONB;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/** Thin helper around the application's Jackson mapper for jsonb columns. */
@Component
public class Json {

    private final ObjectMapper mapper;

    public Json(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public JSONB toJsonb(Object value) {
        return JSONB.jsonb(mapper.writeValueAsString(value));
    }

    public String toString(Object value) {
        return mapper.writeValueAsString(value);
    }

    public <T> T read(JSONB jsonb, Class<T> type) {
        return jsonb == null ? null : mapper.readValue(jsonb.data(), type);
    }

    public <T> T read(String json, Class<T> type) {
        return json == null ? null : mapper.readValue(json, type);
    }

    public <T> T read(JSONB jsonb, tools.jackson.core.type.TypeReference<T> type) {
        return jsonb == null ? null : mapper.readValue(jsonb.data(), type);
    }

    public <T> T read(String json, tools.jackson.core.type.TypeReference<T> type) {
        return json == null ? null : mapper.readValue(json, type);
    }

    public ObjectMapper mapper() {
        return mapper;
    }
}
