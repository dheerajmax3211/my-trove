package com.personalplatform.shared.file;

import com.personalplatform.shared.common.ApiException;
import com.personalplatform.shared.file.FileService.DownloadLink;
import com.personalplatform.shared.file.FileService.FileContent;
import com.personalplatform.shared.file.FileService.FileView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/v1/files")
public class FileController {

    public record DownloadLinkRequest(@Min(1) @Max(3600) Integer ttlSeconds) {}

    private final FileService files;

    public FileController(FileService files) {
        this.files = files;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public FileView upload(@AuthenticationPrincipal Jwt jwt, @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) UUID householdId) throws IOException {
        try (var in = file.getInputStream()) {
            return files.upload(jwt.getSubject(), householdId, file.getOriginalFilename(), file.getContentType(), in);
        }
    }

    @GetMapping
    public List<FileView> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) UUID householdId) {
        return files.list(jwt.getSubject(), householdId);
    }

    @GetMapping("/{id}")
    public FileView get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return files.get(jwt.getSubject(), id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) throws IOException {
        files.delete(jwt.getSubject(), id);
    }

    @PostMapping("/{id}/download-link")
    public DownloadLink downloadLink(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody(required = false) DownloadLinkRequest req) {
        Duration ttl = req == null || req.ttlSeconds() == null ? null : Duration.ofSeconds(req.ttlSeconds());
        return files.issueDownloadLink(jwt.getSubject(), id, ttl);
    }

    /** Public (no bearer token): authorization is the signed, expiring token itself. */
    @GetMapping("/download")
    public ResponseEntity<InputStreamResource> download(@RequestParam String token) throws IOException {
        FileContent content = files.openWithToken(token);
        FileView f = content.file();
        MediaType type;
        try {
            type = MediaType.parseMediaType(f.contentType());
        } catch (IllegalArgumentException e) {
            type = MediaType.APPLICATION_OCTET_STREAM;
        }
        return ResponseEntity.ok()
                .contentType(type)
                .contentLength(f.sizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(f.name(), java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(new InputStreamResource(content.data()));
    }

    /** Same 403 for tampered, malformed and expired tokens, so the response is not an oracle. */
    @ExceptionHandler(DownloadTokenService.InvalidTokenException.class)
    ResponseEntity<org.springframework.http.ProblemDetail> invalidToken(DownloadTokenService.InvalidTokenException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(org.springframework.http.ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.getMessage()));
    }
}
