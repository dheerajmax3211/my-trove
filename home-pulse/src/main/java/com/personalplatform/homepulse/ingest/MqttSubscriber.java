package com.personalplatform.homepulse.ingest;

import com.personalplatform.homepulse.config.HomePulseProperties;
import java.nio.charset.StandardCharsets;
import org.eclipse.paho.mqttv5.client.IMqttToken;
import org.eclipse.paho.mqttv5.client.MqttAsyncClient;
import org.eclipse.paho.mqttv5.client.MqttCallback;
import org.eclipse.paho.mqttv5.client.MqttConnectionOptions;
import org.eclipse.paho.mqttv5.client.MqttDisconnectResponse;
import org.eclipse.paho.mqttv5.client.persist.MemoryPersistence;
import org.eclipse.paho.mqttv5.common.MqttException;
import org.eclipse.paho.mqttv5.common.MqttMessage;
import org.eclipse.paho.mqttv5.common.packet.MqttProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

/**
 * Eclipse Paho (MQTT 5) subscriber for {@code homepulse/+/reading}. Only exists when {@code app.mqtt.enabled=true}.
 * Connects asynchronously with automatic reconnect and re-subscribes on every (re)connect, so a broker that is down
 * at startup never blocks or fails application start.
 */
@Component
@ConditionalOnProperty(name = "app.mqtt.enabled", havingValue = "true")
public class MqttSubscriber implements SmartLifecycle, MqttCallback {

    private static final Logger LOG = LoggerFactory.getLogger(MqttSubscriber.class);

    private final HomePulseProperties.Mqtt config;
    private final MqttIngestHandler handler;
    private volatile MqttAsyncClient client;
    private volatile boolean running;

    public MqttSubscriber(HomePulseProperties props, MqttIngestHandler handler) {
        this.config = props.mqtt();
        this.handler = handler;
    }

    @Override
    public void start() {
        try {
            client = new MqttAsyncClient(config.brokerUri(), config.clientId(), new MemoryPersistence());
            client.setCallback(this);
            MqttConnectionOptions options = new MqttConnectionOptions();
            options.setAutomaticReconnect(true);
            options.setCleanStart(true);
            options.setKeepAliveInterval(30);
            if (config.username() != null && !config.username().isBlank()) {
                options.setUserName(config.username());
                options.setPassword(config.password() == null ? new byte[0] : config.password().getBytes(StandardCharsets.UTF_8));
            }
            running = true;
            client.connect(options);   // async: failures surface in the callbacks, retries are automatic when connected once
            LOG.info("MQTT subscriber connecting to {} for {}", config.brokerUri(), config.topicFilter());
        } catch (MqttException e) {
            running = false;
            LOG.error("MQTT subscriber could not start: {}", e.getMessage());
        }
    }

    @Override
    public void stop() {
        running = false;
        MqttAsyncClient c = client;
        if (c != null) {
            try {
                if (c.isConnected()) {
                    c.disconnect().waitForCompletion(2000);
                }
                c.close();
            } catch (MqttException e) {
                LOG.warn("MQTT subscriber shutdown: {}", e.getMessage());
            }
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public void connectComplete(boolean reconnect, String serverUri) {
        try {
            client.subscribe(config.topicFilter(), config.qos());
            LOG.info("MQTT connected to {} (reconnect={}), subscribed to {}", serverUri, reconnect, config.topicFilter());
        } catch (MqttException e) {
            LOG.error("MQTT subscribe failed: {}", e.getMessage());
        }
    }

    @Override
    public void messageArrived(String topic, MqttMessage message) {
        handler.handle(topic, message.getPayload());
    }

    @Override
    public void disconnected(MqttDisconnectResponse disconnectResponse) {
        LOG.warn("MQTT disconnected: {}", disconnectResponse.getReasonString());
    }

    @Override
    public void mqttErrorOccurred(MqttException exception) {
        LOG.warn("MQTT error: {}", exception.getMessage());
    }

    @Override
    public void deliveryComplete(IMqttToken token) {}

    @Override
    public void authPacketArrived(int reasonCode, MqttProperties properties) {}
}
