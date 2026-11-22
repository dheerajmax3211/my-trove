package com.personalplatform.legacy.notify;

/** Fixed, secret-free message texts. Never interpolate vault content, labels of other people, or tokens here. */
final class MessageTemplates {

    private MessageTemplates() {}

    static NotificationMessage render(OutboxRepository.PendingNotification n) {
        boolean owner = "OWNER".equals(n.recipientKind());
        String subject;
        String body;
        switch (n.kind()) {
            case CHECK_IN_MISSED -> {
                subject = "You missed a check-in";
                body = "Your Digital Legacy check-in is overdue. Open the app and tap check-in to confirm you are fine.";
            }
            case ESCALATION -> {
                subject = owner ? "Please check in now (" + n.urgency() + ")" : "Check-in missed (" + n.urgency() + ")";
                body = owner
                        ? "You have not checked in. Your trusted contacts will be asked to approve release if you stay silent."
                        : "The person who named you as a trustee has missed their check-ins. No action is needed yet.";
            }
            case RELEASE_PENDING -> {
                subject = owner ? "FINAL: check in to cancel release" : "Your approval is needed";
                body = owner
                        ? "Release is pending trustee approval. One check-in cancels it, until the cool-off ends."
                        : "Release of the vault is pending. Open your trustee link to approve or decline.";
            }
            case OWNER_RETURNED -> {
                subject = "Release cancelled";
                body = "The owner checked in. Nothing is released and earlier approvals no longer count.";
            }
            case RELEASED -> {
                subject = owner ? "Your vault was released" : "The vault has been released";
                body = owner
                        ? "The vault was released to your trustees after the quorum approved and the cool-off ended."
                        : "You can now fetch your sealed share and the encrypted vault from your trustee link.";
            }
            default -> throw new IllegalStateException();
        }
        return new NotificationMessage(n.vaultId(), n.kind(), n.urgency(), n.recipientKind(), subject, body, n.id());
    }
}
