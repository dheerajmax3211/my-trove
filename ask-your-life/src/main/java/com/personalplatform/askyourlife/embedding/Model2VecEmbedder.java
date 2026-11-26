package com.personalplatform.askyourlife.embedding;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * A real, tiny language model in pure Java: Model2Vec static embeddings (default {@code minishlab/potion-base-2M},
 * MIT, 64 dimensions, ~29.5k WordPiece tokens).
 *
 * <p>Embedding a text = tokenize with the model's own {@code tokenizer.json} (no special tokens), drop
 * {@code [UNK]} ids, keep the first {@value #MAX_TOKENS} tokens, average those rows of the embedding matrix and
 * L2-normalise: exactly what Model2Vec's {@code StaticModel.encode} does for this model ({@code normalize: true}).
 * There is no attention and no context: word order is ignored and every occurrence of a token has the same vector.
 *
 * <p>The schema column is {@code vector(384)}: the {@code modelDimension}-d vector is zero-padded to
 * {@link #dimension()}. Zero padding changes neither dot products nor norms, so cosine similarity is unchanged.
 * A text with no known token (empty, only unknown symbols) cannot be averaged; it maps to the unit vector on the
 * first padding axis, which is orthogonal to every real embedding (cosine 0) and never the zero vector
 * (pgvector's cosine distance is undefined for it).
 */
public final class Model2VecEmbedder implements Embedder {

    /** Model2Vec's default {@code max_length} in {@code encode}. */
    public static final int MAX_TOKENS = 512;

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final BertWordPieceTokenizer tokenizer;
    private final float[] matrix; // rows x modelDimension, row-major
    private final int rows;
    private final int modelDimension;
    private final int dimension;
    private final String id;

    private Model2VecEmbedder(BertWordPieceTokenizer tokenizer, float[] matrix, int rows, int modelDimension,
            int dimension, String id) {
        this.tokenizer = tokenizer;
        this.matrix = matrix;
        this.rows = rows;
        this.modelDimension = modelDimension;
        this.dimension = dimension;
        this.id = id;
    }

    /**
     * Loads {@code model.safetensors} and {@code tokenizer.json} from {@code dir}.
     *
     * @param dimension output dimension (the schema's); must be >= the model's
     * @param modelName recorded in {@link #id()}, e.g. {@code potion-base-2M@389b9f6}
     */
    public static Model2VecEmbedder load(Path dir, int dimension, String modelName) throws IOException {
        BertWordPieceTokenizer tokenizer = BertWordPieceTokenizer.load(dir.resolve("tokenizer.json"));
        Tensor t = readEmbeddings(dir.resolve("model.safetensors"));
        if (t.dim > dimension) {
            throw new IllegalArgumentException("model dimension " + t.dim + " exceeds output dimension " + dimension);
        }
        if (t.rows < tokenizer.vocabSize()) {
            throw new IllegalArgumentException("embedding matrix has " + t.rows + " rows for a vocabulary of "
                    + tokenizer.vocabSize());
        }
        return new Model2VecEmbedder(tokenizer, t.data, t.rows, t.dim, dimension,
                "model2vec:" + modelName + ":" + t.dim + "->" + dimension);
    }

    @Override
    public int dimension() {
        return dimension;
    }

    public int modelDimension() {
        return modelDimension;
    }

    @Override
    public String id() {
        return id;
    }

    @Override
    public List<float[]> embedAll(List<String> texts) {
        return texts.stream().map(this::embedOne).toList();
    }

    /** The un-padded model vector (mean of token rows, L2-normalised); zero vector when no token is known. */
    public float[] modelVector(String text) {
        List<Integer> ids = tokenizer.encode(text == null ? "" : text);
        double[] sum = new double[modelDimension];
        int n = 0;
        for (int tokenId : ids) {
            if (tokenId == tokenizer.unkId()) {
                continue; // Model2Vec removes unknown tokens before truncating
            }
            if (n == MAX_TOKENS) {
                break;
            }
            if (tokenId < 0 || tokenId >= rows) {
                continue;
            }
            int base = tokenId * modelDimension;
            for (int d = 0; d < modelDimension; d++) {
                sum[d] += matrix[base + d];
            }
            n++;
        }
        float[] v = new float[modelDimension];
        if (n == 0) {
            return v;
        }
        for (int d = 0; d < modelDimension; d++) {
            v[d] = (float) (sum[d] / n);
        }
        return Embedder.normalize(v);
    }

    private float[] embedOne(String text) {
        float[] m = modelVector(text);
        float[] out = new float[dimension];
        System.arraycopy(m, 0, out, 0, modelDimension);
        boolean zero = true;
        for (float f : m) {
            if (f != 0f) {
                zero = false;
                break;
            }
        }
        if (zero) {
            out[dimension > modelDimension ? modelDimension : 0] = 1f;
        }
        return out;
    }

    // ---- safetensors ------------------------------------------------------------------------------------

    private record Tensor(float[] data, int rows, int dim) {}

    /**
     * safetensors layout: u64 little-endian header length N, N bytes of JSON header
     * ({@code {"name": {"dtype", "shape", "data_offsets": [begin, end]}, "__metadata__": {...}}}), then the data,
     * offsets relative to its start. Reads the 2-d tensor named {@code embeddings}; F32, F16 and BF16 supported.
     */
    static Tensor readEmbeddings(Path file) throws IOException {
        try (FileChannel ch = FileChannel.open(file, StandardOpenOption.READ)) {
            ByteBuffer len = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
            readFully(ch, len, 0);
            long headerLen = len.flip().getLong();
            if (headerLen <= 0 || headerLen > 100_000_000L || headerLen + 8 > ch.size()) {
                throw new IOException("invalid safetensors header length " + headerLen);
            }
            ByteBuffer header = ByteBuffer.allocate((int) headerLen);
            readFully(ch, header, 8);
            JsonNode h = JSON.readTree(new String(header.array(), StandardCharsets.UTF_8));
            JsonNode e = h.path("embeddings");
            if (e.isMissingNode()) {
                throw new IOException("safetensors file has no 'embeddings' tensor");
            }
            String dtype = e.path("dtype").asString("");
            JsonNode shape = e.path("shape");
            if (shape.size() != 2) {
                throw new IOException("embeddings tensor must be 2-d, shape was " + shape);
            }
            int rows = shape.get(0).asInt();
            int dim = shape.get(1).asInt();
            int width = switch (dtype) {
                case "F32" -> 4;
                case "F16", "BF16" -> 2;
                default -> throw new IOException("unsupported dtype " + dtype);
            };
            long begin = e.path("data_offsets").get(0).asLong();
            long end = e.path("data_offsets").get(1).asLong();
            long expected = (long) rows * dim * width;
            if (end - begin != expected) {
                throw new IOException("embeddings data is " + (end - begin) + " bytes, expected " + expected);
            }
            long dataStart = 8 + headerLen;
            if (dataStart + end > ch.size()) {
                throw new IOException("safetensors file is truncated");
            }
            ByteBuffer data = ByteBuffer.allocate((int) expected).order(ByteOrder.LITTLE_ENDIAN);
            readFully(ch, data, dataStart + begin);
            data.flip();
            float[] out = new float[rows * dim];
            for (int i = 0; i < out.length; i++) {
                out[i] = switch (dtype) {
                    case "F32" -> data.getFloat();
                    case "F16" -> Float.float16ToFloat(data.getShort());
                    default -> Float.intBitsToFloat((data.getShort() & 0xffff) << 16); // BF16
                };
                if (!Float.isFinite(out[i])) {
                    throw new IOException("non-finite value in embeddings at index " + i);
                }
            }
            return new Tensor(out, rows, dim);
        }
    }

    private static void readFully(FileChannel ch, ByteBuffer buf, long position) throws IOException {
        long pos = position;
        while (buf.hasRemaining()) {
            int n = ch.read(buf, pos);
            if (n < 0) {
                throw new IOException("unexpected end of file");
            }
            pos += n;
        }
    }
}
