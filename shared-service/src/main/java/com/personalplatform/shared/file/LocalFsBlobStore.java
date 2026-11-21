package com.personalplatform.shared.file;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.regex.Pattern;

/** Filesystem-backed {@link BlobStore}. Writes go to a temp file first and are moved into place atomically. */
public class LocalFsBlobStore implements BlobStore {

    private static final Pattern SAFE_KEY = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._/-]*");

    private final Path root;

    public LocalFsBlobStore(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    @Override
    public long put(String key, InputStream data) throws IOException {
        Path target = resolve(key);
        Files.createDirectories(target.getParent());
        Path tmp = Files.createTempFile(target.getParent(), ".upload-", ".tmp");
        try {
            long n = Files.copy(data, tmp, StandardCopyOption.REPLACE_EXISTING);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            return n;
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    @Override
    public InputStream open(String key) throws IOException {
        return Files.newInputStream(resolve(key));
    }

    @Override
    public boolean delete(String key) throws IOException {
        return Files.deleteIfExists(resolve(key));
    }

    @Override
    public boolean exists(String key) {
        return Files.isRegularFile(resolve(key));
    }

    /** Rejects anything that could escape the root (absolute paths, "..", odd characters). */
    Path resolve(String key) {
        if (key == null || !SAFE_KEY.matcher(key).matches() || key.contains("..")) {
            throw new IllegalArgumentException("Illegal blob key");
        }
        Path p = root.resolve(key).normalize();
        if (!p.startsWith(root) || p.equals(root)) {
            throw new IllegalArgumentException("Illegal blob key");
        }
        return p;
    }
}
