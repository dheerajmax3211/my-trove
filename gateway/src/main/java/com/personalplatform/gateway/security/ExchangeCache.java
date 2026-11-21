package com.personalplatform.gateway.security;

import com.personalplatform.gateway.config.GatewayProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

/**
 * Remembers exchanged platform tokens so {@code auth} is not called per request. The key is the SHA-256 of the
 * incoming credential (the credential itself is never stored), the lifetime is {@code gateway.exchange.cache-ttl}
 * (60 s) capped by the token's own expiry, and the size is bounded. Concurrent requests for the same credential
 * share one in-flight exchange. Failures are never cached.
 */
@Component
public class ExchangeCache {

    private static final Duration EXPIRY_SKEW = Duration.ofSeconds(5);

    private static final class Entry {
        final Mono<ExchangeResult> result;
        volatile Instant expiresAt;

        Entry(Mono<ExchangeResult> result, Instant expiresAt) {
            this.result = result;
            this.expiresAt = expiresAt;
        }
    }

    private final Clock clock;
    private final Duration ttl;
    private final int maxEntries;
    private final Map<String, Entry> entries = new LinkedHashMap<>();

    @Autowired
    public ExchangeCache(Clock clock, GatewayProperties props) {
        this(clock, props.exchange().cacheTtl(), props.exchange().cacheMaxEntries());
    }

    public ExchangeCache(Clock clock, Duration ttl, int maxEntries) {
        this.clock = clock;
        this.ttl = ttl;
        this.maxEntries = maxEntries;
    }

    /** The cached exchange for this credential, or the result of {@code loader} (remembered on success). */
    public Mono<ExchangeResult> get(String credential, Supplier<Mono<ExchangeResult>> loader) {
        String key = key(credential);
        Instant now = clock.instant();
        Entry entry;
        synchronized (entries) {
            entry = entries.get(key);
            if (entry != null && !entry.expiresAt.isAfter(now)) {
                entries.remove(key);
                entry = null;
            }
            if (entry == null) {
                entry = newEntry(key, loader, now.plus(ttl));
                makeRoom(now);
                entries.put(key, entry);
            }
        }
        return entry.result;
    }

    private Entry newEntry(String key, Supplier<Mono<ExchangeResult>> loader, Instant expiresAt) {
        Entry[] holder = new Entry[1];
        Mono<ExchangeResult> shared = Mono.defer(loader)
                .doOnNext(r -> {
                    Instant tokenExp = r.claims().expiresAt();
                    if (tokenExp != null) {
                        Instant cap = tokenExp.minus(EXPIRY_SKEW);
                        if (cap.isBefore(holder[0].expiresAt)) {
                            holder[0].expiresAt = cap;
                        }
                    }
                })
                .doOnError(e -> remove(key, holder[0]))
                .cache();
        holder[0] = new Entry(shared, expiresAt);
        return holder[0];
    }

    private void remove(String key, Entry entry) {
        synchronized (entries) {
            entries.remove(key, entry);
        }
    }

    private void makeRoom(Instant now) {
        if (entries.size() < maxEntries) {
            return;
        }
        for (Iterator<Entry> it = entries.values().iterator(); it.hasNext();) {
            if (!it.next().expiresAt.isAfter(now)) {
                it.remove();
            }
        }
        while (entries.size() >= maxEntries) {
            Iterator<String> oldest = entries.keySet().iterator();
            oldest.next();
            oldest.remove();
        }
    }

    public int size() {
        synchronized (entries) {
            return entries.size();
        }
    }

    public void clear() {
        synchronized (entries) {
            entries.clear();
        }
    }

    static String key(String credential) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(credential.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
