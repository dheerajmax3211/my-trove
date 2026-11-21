package com.personalplatform.gateway.security;

/** Why an exchange did not produce a platform token. */
public abstract sealed class ExchangeFailure extends RuntimeException {

    protected ExchangeFailure(String message, Throwable cause) {
        super(message, cause, false, false);
    }

    /** {@code auth} refused the credential (401), the account (403) or the caller's rate (429). */
    public static final class Rejected extends ExchangeFailure {

        private final int status;
        private final byte[] body;
        private final String retryAfter;

        public Rejected(int status, byte[] body, String retryAfter) {
            super("exchange rejected with " + status, null);
            this.status = status;
            this.body = body;
            this.retryAfter = retryAfter;
        }

        public int status() {
            return status;
        }

        public byte[] body() {
            return body;
        }

        public String retryAfter() {
            return retryAfter;
        }
    }

    /** {@code auth} could not be reached, was too slow, or answered something that is not a token. */
    public static final class Unavailable extends ExchangeFailure {

        private final boolean timeout;

        public Unavailable(String message, boolean timeout, Throwable cause) {
            super(message, cause);
            this.timeout = timeout;
        }

        public boolean timeout() {
            return timeout;
        }
    }
}
