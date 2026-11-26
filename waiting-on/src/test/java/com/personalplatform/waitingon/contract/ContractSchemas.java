package com.personalplatform.waitingon.contract;

import com.networknt.schema.Error;
import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaLocation;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SchemaRegistryConfig;
import com.networknt.schema.SpecificationVersion;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Validates a response body against a JSON Schema in the repo-root {@code contracts/} folder: the same files the
 * workspace's demo-mode mock APIs are checked against (ui-common {@code apps/workspace/src/contracts}), so the two
 * cannot drift apart. Formats (date-time, date) are asserted, not just annotated.
 */
public final class ContractSchemas {

    /** Schemas are addressed by this base so relative {@code $ref}s resolve to sibling files (and paths with spaces). */
    private static final String BASE = "https://contracts.my-trove.local/";

    private static final SchemaRegistry REGISTRY = SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12,
            builder -> builder
                    .schemaRegistryConfig(SchemaRegistryConfig.builder().formatAssertionsEnabled(true).build())
                    .schemas(ContractSchemas::read));

    private ContractSchemas() {}

    /** {@code contracts/} found by walking up from the working directory (the module folder under Maven). */
    static Path contractsDir() {
        for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path candidate = dir.resolve("contracts");
            if (Files.isDirectory(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("No contracts/ folder above " + Path.of("").toAbsolutePath());
    }

    private static String read(String iri) {
        if (!iri.startsWith(BASE)) {
            return null;
        }
        try {
            return Files.readString(contractsDir().resolve(iri.substring(BASE.length())));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Fails with every violation when {@code json} does not match {@code contracts/<file>} (for example
     * {@code waiting-on/item.schema.json}). An empty JSON array fails too: it would prove nothing about the elements.
     */
    public static void assertMatches(String file, String json) {
        Path path = contractsDir().resolve(file);
        if (!Files.isRegularFile(path)) {
            throw new AssertionError("No contract file " + path);
        }
        if (json.strip().equals("[]")) {
            throw new AssertionError(file + ": the response is an empty list, which proves nothing about its elements");
        }
        Schema schema = REGISTRY.getSchema(SchemaLocation.of(BASE + file));
        List<Error> errors = schema.validate(json, InputFormat.JSON);
        if (!errors.isEmpty()) {
            throw new AssertionError(file + " does not match the response:\n  "
                    + errors.stream().map(Error::toString).collect(Collectors.joining("\n  ")) + "\nbody: " + json);
        }
    }
}
