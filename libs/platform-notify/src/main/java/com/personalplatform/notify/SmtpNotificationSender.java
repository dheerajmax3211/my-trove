package com.personalplatform.notify;

import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;

/**
 * Sends each notification as a plain-text email over SMTP. A link becomes an absolute URL under
 * {@code app.mail.public-base-url}. Any mail failure propagates, so the relay retries it.
 */
public class SmtpNotificationSender implements NotificationSender {

    private final JavaMailSenderImpl mailer;
    private final NotifyProperties props;

    public SmtpNotificationSender(NotifyProperties props) {
        this.props = props;
        this.mailer = new JavaMailSenderImpl();
        this.mailer.setHost(props.host());
        this.mailer.setPort(props.port());
        this.mailer.setProtocol("smtp");
        this.mailer.getJavaMailProperties().setProperty("mail.smtp.connectiontimeout", "5000");
        this.mailer.getJavaMailProperties().setProperty("mail.smtp.timeout", "10000");
        this.mailer.getJavaMailProperties().setProperty("mail.smtp.writetimeout", "10000");
    }

    @Override
    public void send(Message message) {
        SimpleMailMessage mail = new SimpleMailMessage();
        mail.setFrom(props.from());
        mail.setTo(message.recipientEmail());
        mail.setSubject(message.title());
        mail.setText(text(message));
        if (message.replyTo() != null && !message.replyTo().isBlank()) {
            mail.setReplyTo(message.replyTo());
        }
        mailer.send(mail);
    }

    String text(Message message) {
        StringBuilder sb = new StringBuilder();
        if (message.body() != null && !message.body().isBlank()) {
            sb.append(message.body()).append("\n");
        }
        if (message.link() != null && !message.link().isBlank()) {
            String base = props.publicBaseUrl().endsWith("/")
                    ? props.publicBaseUrl().substring(0, props.publicBaseUrl().length() - 1)
                    : props.publicBaseUrl();
            sb.append("\nOpen: ").append(base).append(message.link()).append("\n");
        }
        sb.append("\n-- My-Trove. You receive this because of something you set up here.\n");
        return sb.toString();
    }
}
