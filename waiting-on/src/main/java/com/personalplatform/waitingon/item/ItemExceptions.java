package com.personalplatform.waitingon.item;

/** Namespace for the small domain exceptions mapped to HTTP statuses by the API exception handler. */
public final class ItemExceptions {

    private ItemExceptions() {
    }

    /** Also used for "exists but belongs to someone else": the caller must not learn the difference. */
    public static class ItemNotFoundException extends RuntimeException {
        public ItemNotFoundException() {
            super("Item not found");
        }
    }

    public static class InvalidStateException extends RuntimeException {
        public InvalidStateException(String message) {
            super(message);
        }
    }

    /** The follow-up scheduler (Temporal) could not be reached. */
    public static class FollowUpUnavailableException extends RuntimeException {
        public FollowUpUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
