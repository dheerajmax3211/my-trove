{{- define "trove.labels" -}}
app.kubernetes.io/part-of: my-trove
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "trove.secretName" -}}
{{- if .Values.secrets.existingSecret -}}{{ .Values.secrets.existingSecret }}{{- else if .Values.secrets.create -}}{{ .Release.Name }}-secrets{{- else -}}{{ fail "set secrets.existingSecret (or secrets.create=true for a throwaway cluster)" }}{{- end -}}
{{- end -}}

{{- define "trove.image" -}}
{{- $tag := required "image.tag is required (the git commit CI built)" .root.Values.image.tag -}}
{{ .root.Values.image.registry }}/{{ .name }}:{{ $tag }}
{{- end -}}

{{/* Env for one backend: shared values, then the service's own, then overrides from values. */}}
{{- define "trove.backendEnv" -}}
{{- $v := .root.Values -}}
{{- $secret := include "trove.secretName" .root -}}
- { name: MANAGEMENT_PORT, value: {{ .svc.managementPort | quote }} }
- { name: MANAGEMENT_ENDPOINT_HEALTH_PROBES_ENABLED, value: "true" }
- { name: TRACING_SAMPLING, value: {{ $v.common.tracingSampling | quote }} }
- { name: OTLP_TRACES_ENDPOINT, value: {{ $v.common.otlpTracesEndpoint | quote }} }
- { name: JAVA_TOOL_OPTIONS, value: {{ $v.common.javaToolOptions | quote }} }
{{- if ne .name "gateway" }}
- { name: DB_URL, value: {{ $v.common.db.url | quote }} }
- { name: DB_USER, value: {{ $v.common.db.user | quote }} }
- name: DB_PASSWORD
  valueFrom: { secretKeyRef: { name: {{ $secret }}, key: DB_PASSWORD } }
- { name: FIREBASE_PROJECT_ID, value: {{ required "common.firebaseProjectId is required" $v.common.firebaseProjectId | quote }} }
{{- if $v.common.firebaseJwkSetUri }}
- { name: APP_FIREBASE_JWK_SET_URI, value: {{ $v.common.firebaseJwkSetUri | quote }} }
{{- end }}
- { name: APP_SECURITY_MODE, value: platform }
- { name: APP_PLATFORM_JWK_SET_URI, value: "http://auth:8081/.well-known/jwks.json" }
- { name: APP_PLATFORM_ACCEPT_PLATFORM_TOKENS, value: "true" }
- name: APP_INTERNAL_API_KEY
  valueFrom: { secretKeyRef: { name: {{ $secret }}, key: APP_INTERNAL_API_KEY } }
{{- end }}
{{- if eq .name "gateway" }}
- name: GATEWAY_INTERNAL_API_KEY
  valueFrom: { secretKeyRef: { name: {{ $secret }}, key: APP_INTERNAL_API_KEY } }
- { name: GATEWAY_METERING_KAFKA_BOOTSTRAP_SERVERS, value: {{ $v.common.kafkaBootstrapServers | quote }} }
# Service URIs use map keys with dashes, which environment variables cannot express; JSON keeps them intact.
- name: SPRING_APPLICATION_JSON
  value: {{ dict "gateway" (dict "cors" (dict "allowed-origins" (list $v.urls.workspace $v.urls.site)) "services" (dict "auth" (dict "uri" "http://auth:8081") "shared" (dict "uri" "http://shared-service:8082") "waiting-on" (dict "uri" "http://waiting-on:8083") "consent" (dict "uri" "http://consent-gateway:8084") "home-pulse" (dict "uri" "http://home-pulse:8085") "ask-your-life" (dict "uri" "http://ask-your-life:8086") "digital-legacy" (dict "uri" "http://digital-legacy:8087") "family-treasury" (dict "uri" "http://family-treasury:8088") "platform" (dict "uri" "http://platform-service:8089") "mcp" (dict "uri" "http://mcp-server:8090"))) | toJson | quote }}
{{- end }}
{{- if eq .name "auth" }}
- name: APP_PLATFORM_KEY_ENCRYPTION_KEY
  valueFrom: { secretKeyRef: { name: {{ $secret }}, key: APP_PLATFORM_KEY_ENCRYPTION_KEY } }
- { name: BOOTSTRAP_ADMIN_EMAILS, value: {{ $v.bootstrapAdminEmails | quote }} }
- { name: PLATFORM_SERVICE_URL, value: "http://platform-service:8089" }
{{- end }}
{{- if eq .name "platform-service" }}
- { name: KAFKA_BOOTSTRAP_SERVERS, value: {{ $v.common.kafkaBootstrapServers | quote }} }
{{- end }}
{{- if eq .name "shared-service" }}
- name: FILE_TOKEN_SECRET
  valueFrom: { secretKeyRef: { name: {{ $secret }}, key: FILE_TOKEN_SECRET } }
- { name: FILES_ROOT, value: /data/blobs }
- { name: MAIL_ENABLED, value: {{ $v.mail.enabled | quote }} }
- { name: MAIL_HOST, value: {{ $v.mail.host | quote }} }
- { name: MAIL_PORT, value: {{ $v.mail.port | quote }} }
- { name: MAIL_FROM, value: {{ $v.mail.from | quote }} }
- { name: MAIL_USERNAME, value: {{ $v.mail.username | quote }} }
- { name: MAIL_STARTTLS, value: {{ $v.mail.starttls | quote }} }
- name: MAIL_PASSWORD
  valueFrom: { secretKeyRef: { name: {{ $secret }}, key: MAIL_PASSWORD, optional: true } }
- { name: MAIL_PUBLIC_BASE_URL, value: {{ $v.urls.workspace | quote }} }
{{- end }}
{{- if eq .name "waiting-on" }}
- name: INBOUND_WEBHOOK_SECRET
  valueFrom: { secretKeyRef: { name: {{ $secret }}, key: INBOUND_WEBHOOK_SECRET } }
- { name: TEMPORAL_ENABLED, value: {{ $v.temporal.enabled | quote }} }
- { name: TEMPORAL_TARGET, value: {{ $v.temporal.target | quote }} }
- { name: TEMPORAL_NAMESPACE, value: {{ $v.temporal.namespace | quote }} }
- { name: TEMPORAL_TLS, value: {{ $v.temporal.tls | quote }} }
- { name: REPLY_DOMAIN, value: {{ $v.inboundEmail.replyDomain | quote }} }
- { name: INBOUND_SMTP_ENABLED, value: {{ $v.inboundEmail.enabled | quote }} }
{{- if $v.inboundEmail.enabled }}
- { name: INBOUND_SMTP_PORT, value: {{ $v.inboundEmail.containerPort | quote }} }
- { name: INBOUND_SMTP_BIND_ADDRESS, value: "0.0.0.0" }
- { name: INBOUND_SMTP_MAX_MESSAGE_SIZE, value: {{ $v.inboundEmail.maxMessageSize | quote }} }
{{- end }}
{{- end }}
{{- if eq .name "consent-gateway" }}
- name: CONSENT_KEY_ENCRYPTION_KEY
  valueFrom: { secretKeyRef: { name: {{ $secret }}, key: CONSENT_KEY_ENCRYPTION_KEY } }
- { name: CONSENT_ISSUER, value: {{ $v.urls.consentIssuer | quote }} }
{{- end }}
{{- if eq .name "mcp-server" }}
# Tools call the product services directly with the caller's platform token.
- { name: WAITING_ON_URL, value: "http://waiting-on:8083" }
- { name: ASK_YOUR_LIFE_URL, value: "http://ask-your-life:8086" }
- { name: HOME_PULSE_URL, value: "http://home-pulse:8085" }
- { name: FAMILY_TREASURY_URL, value: "http://family-treasury:8088" }
# API-key callers act for their owner via auth's /internal/v1/token/delegate (APP_INTERNAL_API_KEY is set above).
- { name: AUTH_URL, value: "http://auth:8081" }
{{- end }}
{{- if eq .name "digital-legacy" }}
- { name: LEGACY_TRUSTEE_PORTAL_URL, value: {{ $v.urls.workspace | quote }} }
{{- end }}
{{- range $k, $val := $v.common.extraEnv }}
- { name: {{ $k }}, value: {{ $val | quote }} }
{{- end }}
{{- range $k, $val := .svc.env }}
- { name: {{ $k }}, value: {{ $val | quote }} }
{{- end }}
{{- end -}}
