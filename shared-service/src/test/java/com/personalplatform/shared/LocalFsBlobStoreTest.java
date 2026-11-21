package com.personalplatform.shared;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.shared.file.LocalFsBlobStore;
import java.io.ByteArrayInputStream;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LocalFsBlobStoreTest {

    @TempDir Path root;

    @Test
    void putOpenDelete() throws Exception {
        var store = new LocalFsBlobStore(root);
        assertThat(store.put("objects/a1", new ByteArrayInputStream("abc".getBytes()))).isEqualTo(3);
        assertThat(store.exists("objects/a1")).isTrue();
        assertThat(store.open("objects/a1").readAllBytes()).isEqualTo("abc".getBytes());
        assertThat(store.delete("objects/a1")).isTrue();
        assertThat(store.delete("objects/a1")).isFalse();
        assertThatThrownBy(() -> store.open("objects/a1")).isInstanceOf(NoSuchFileException.class);
    }

    @Test
    void keysCannotEscapeTheRoot() {
        var store = new LocalFsBlobStore(root);
        for (String bad : new String[] {"../x", "a/../../x", "/etc/passwd", "a/..", "", "..", "a\\b", "a b"}) {
            assertThatThrownBy(() -> store.put(bad, new ByteArrayInputStream(new byte[0])))
                    .as(bad).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void overwriteLeavesNoTempFiles() throws Exception {
        var store = new LocalFsBlobStore(root);
        store.put("objects/k", new ByteArrayInputStream("one".getBytes()));
        store.put("objects/k", new ByteArrayInputStream("two!".getBytes()));
        assertThat(store.open("objects/k").readAllBytes()).isEqualTo("two!".getBytes());
        try (var files = java.nio.file.Files.list(root.resolve("objects"))) {
            assertThat(files.map(p -> p.getFileName().toString())).containsExactly("k");
        }
    }
}
