package com.personalplatform.mcp.tools;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/**
 * Argument checks and schema fragments shared by the tools. The SDK validates arguments against the input schema
 * first; these checks hold the same rules in code so a call is safe even if that validation is switched off.
 */
final class Args {

    private Args() {}

    static void onlyKnown(Map<String, Object> args, Set<String> allowed) {
        for (String key : args.keySet()) {
            if (!allowed.contains(key)) {
                throw new ToolInputException("unknown argument '" + key + "'");
            }
        }
    }

    static int integer(Map<String, Object> args, String name, int min, int max, int fallback) {
        Object value = args.get(name);
        if (value == null) {
            return fallback;
        }
        if (!(value instanceof Number n) || n.doubleValue() != Math.rint(n.doubleValue())) {
            throw new ToolInputException("'" + name + "' must be an integer");
        }
        long v = n.longValue();
        if (v < min || v > max) {
            throw new ToolInputException("'" + name + "' must be between " + min + " and " + max);
        }
        return (int) v;
    }

    static String requiredString(Map<String, Object> args, String name, int maxLength) {
        Object value = args.get(name);
        if (!(value instanceof String s) || s.isBlank()) {
            throw new ToolInputException("'" + name + "' is required and must be a non-empty string");
        }
        String stripped = s.strip();
        if (stripped.length() > maxLength) {
            throw new ToolInputException("'" + name + "' must be at most " + maxLength + " characters");
        }
        return stripped;
    }

    static UUID optionalUuid(Map<String, Object> args, String name) {
        Object value = args.get(name);
        if (value == null) {
            return null;
        }
        if (value instanceof String s) {
            try {
                UUID id = UUID.fromString(s.strip());
                if (id.toString().equalsIgnoreCase(s.strip())) {
                    return id;
                }
            } catch (IllegalArgumentException ignored) {
                // falls through to the error below
            }
        }
        throw new ToolInputException("'" + name + "' must be a UUID");
    }

    // ---- schema fragments -----------------------------------------------------------------------------------

    static Map<String, Object> object(Map<String, Object> properties, String... required) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        if (required.length > 0) {
            schema.put("required", java.util.List.of(required));
        }
        schema.put("additionalProperties", false);
        return schema;
    }

    static Map<String, Object> integerSchema(String description, int min, int max, int fallback) {
        return Map.of("type", "integer", "description", description, "minimum", min, "maximum", max, "default", fallback);
    }

    static Map<String, Object> stringSchema(String description, int maxLength) {
        return Map.of("type", "string", "description", description, "minLength", 1, "maxLength", maxLength);
    }

    static Map<String, Object> uuidSchema(String description) {
        return Map.of("type", "string", "description", description, "format", "uuid",
                "pattern", "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    }

    // ---- reading downstream JSON ----------------------------------------------------------------------------

    /** The field as a string, or null when absent or JSON null. */
    static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() || v.isMissingNode() ? null : v.asString();
    }
}
