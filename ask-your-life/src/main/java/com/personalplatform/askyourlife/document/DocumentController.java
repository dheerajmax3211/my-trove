package com.personalplatform.askyourlife.document;

import com.personalplatform.askyourlife.document.DocumentDtos.CreateDocumentRequest;
import com.personalplatform.askyourlife.document.DocumentDtos.DocumentResponse;
import com.personalplatform.askyourlife.document.DocumentDtos.IngestResponse;
import com.personalplatform.askyourlife.document.DocumentDtos.UpdateDocumentRequest;
import com.personalplatform.askyourlife.web.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/v1/documents")
public class DocumentController {

    private final DocumentService service;

    public DocumentController(DocumentService service) {
        this.service = service;
    }

    /** Raw text body: {@code Content-Type: text/plain | text/markdown | text/html}; metadata as query params. */
    @PostMapping(consumes = {"text/plain", "text/markdown", "text/x-markdown", "text/html"})
    public ResponseEntity<IngestResponse> ingestRaw(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Content-Type") String contentType,
            @RequestParam(required = false) String title,
            @RequestParam(required = false) SourceType sourceType,
            @RequestParam(required = false) String externalId,
            @RequestBody byte[] body) {
        MediaType mt = MediaType.parseMediaType(contentType);
        Charset charset = mt.getCharset() == null ? StandardCharsets.UTF_8 : mt.getCharset();
        return respond(service.ingest(jwt.getSubject(), new DocumentService.NewContent(
                title, sourceType, mt.getType() + "/" + mt.getSubtype(), body, charset, externalId)));
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<IngestResponse> ingestJson(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateDocumentRequest req) {
        return respond(service.ingest(jwt.getSubject(), new DocumentService.NewContent(
                req.title(), req.sourceType(), req.mimeType(), req.text().getBytes(StandardCharsets.UTF_8),
                StandardCharsets.UTF_8, req.externalId())));
    }

    /** Multipart upload of a text-like file (txt, md, html, csv ...). PDF is an extension point, see TextExtractor. */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<IngestResponse> ingestFile(
            @AuthenticationPrincipal Jwt jwt,
            @RequestPart("file") MultipartFile file,
            @RequestParam(required = false) String title,
            @RequestParam(required = false) SourceType sourceType,
            @RequestParam(required = false) String externalId)
            throws IOException {
        String mime = mimeOf(file);
        String name = file.getOriginalFilename();
        return respond(service.ingest(jwt.getSubject(), new DocumentService.NewContent(
                title == null || title.isBlank() ? stripExtension(name) : title,
                sourceType == null ? SourceType.FILE : sourceType, mime, file.getBytes(),
                StandardCharsets.UTF_8, externalId)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<IngestResponse> update(
            @AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody UpdateDocumentRequest req) {
        return respond(service.updateContent(jwt.getSubject(), id, req.title(), req.mimeType(),
                req.text().getBytes(StandardCharsets.UTF_8)));
    }

    @GetMapping("/{id}")
    public DocumentResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return DocumentResponse.from(service.get(jwt.getSubject(), id));
    }

    @GetMapping
    public List<DocumentResponse> list(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) SourceType sourceType,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit,
            @RequestParam(defaultValue = "0") @Min(0) int offset) {
        return service.list(jwt.getSubject(), sourceType, limit, offset).stream().map(DocumentResponse::from).toList();
    }

    @DeleteMapping("/{id}")
    @org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        service.delete(jwt.getSubject(), id);
    }

    private static ResponseEntity<IngestResponse> respond(DocumentService.IngestResult r) {
        IngestResponse body = new IngestResponse(r.outcome().name(), DocumentResponse.from(r.document()));
        if (r.outcome() == DocumentService.Outcome.DUPLICATE) {
            return ResponseEntity.ok(body);
        }
        return ResponseEntity.accepted().location(URI.create("/v1/documents/" + r.document().id())).body(body);
    }

    private static String mimeOf(MultipartFile file) {
        String declared = file.getContentType();
        if (declared != null && !declared.isBlank() && !declared.equals("application/octet-stream")) {
            return declared;
        }
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase(java.util.Locale.ROOT);
        if (name.endsWith(".md") || name.endsWith(".markdown")) {
            return "text/markdown";
        }
        if (name.endsWith(".html") || name.endsWith(".htm")) {
            return "text/html";
        }
        if (name.endsWith(".pdf")) {
            return "application/pdf";
        }
        if (name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".log") || name.endsWith(".eml")) {
            return "text/plain";
        }
        throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "Cannot tell the file type; send a text/* content type or a .txt/.md/.html file name");
    }

    private static String stripExtension(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }
}
