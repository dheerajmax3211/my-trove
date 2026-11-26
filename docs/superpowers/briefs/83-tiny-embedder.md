# 83: Real semantic search in Ask Your Life with a tiny local model

Read `80-common.md` first. Report: `docs/superpowers/briefs/83-report.md`.

Today Ask Your Life's "semantic" leg uses `HashingEmbedder` (a deterministic stand-in) unless `EMBEDDER_URL` points at an
external service. Replace the default with a real, tiny, local model that runs anywhere, in pure Java.

Model (owner-approved download): Model2Vec `minishlab/potion-base-2M` from Hugging Face, MIT licence, files
`model.safetensors` (about 7.6 MB, a static embedding matrix, 64 dimensions) and `tokenizer.json` (about 0.7 MB).
Pin the exact revision (commit sha from the HF API) and verify a sha256 of both files.

Do:
1. `Model2VecEmbedder implements Embedder` (package `embedding`): load `tokenizer.json` (WordPiece/BPE as the file
   says; implement exactly what the file specifies: normalizer, pre-tokenizer, model, and unknown-token handling),
   read the safetensors header and the float32 (or the stored dtype) embedding matrix, embed = mean of the token
   rows (skip padding/special tokens the way Model2Vec does), then L2-normalise. No ONNX, no DJL, no native code.
2. The `ask_life.chunks.embedding` column is `vector(384)`: zero-pad the 64-d vector to 384 (cosine similarity is
   unchanged by zero padding; prove it in a unit test). Do not change the column. Record the embedder name and
   dimension the way the code records the current embedder (look for how documents are marked with an embedder, and
   re-embed existing chunks if the embedder changed: check whether that mechanism exists; if not, add a small one).
3. Where the model lives: do not commit the binary to git. Add a fetch step: `ask-your-life/model/fetch-model.sh`
   (curl from the pinned HF revision, checksum-verified) used by (a) the Maven build or tests via a documented
   property, (b) `deploy/docker/service.Dockerfile` for the ask-your-life image (the model must be inside the image so
   it runs offline), (c) `dev/up.sh`. Configuration: `EMBEDDER=model2vec` (new default) | `hashing` | `http`, plus a
   model directory setting. If the model files are missing at startup, fall back to hashing with a loud WARN and say
   so in `/actuator/health` details, never crash.
4. Quality proof, in tests: a small gold set (20 to 40 query/passage pairs you write, everyday household paperwork:
   receipts, warranties, insurance, rent, bills) where lexical overlap is low (synonyms, paraphrase). Measure
   recall@3 and MRR for hashing vs model2vec vs hybrid search, assert model2vec beats hashing by a clear margin, and
   publish the numbers in `ask-your-life/README.md` and the report. This is spec item 4.B in miniature.
5. Answers: no generative model (none that small is useful). Add an extractive answer: for a question, return the
   best-matching sentence(s) from the top passages with citations (document id/title, chunk), as a new field or
   endpoint the UI can show above the results; update the Ask Your Life UI to show it ("From your documents: ...",
   cited) and its demo mock to return one. Tests for both.
6. Update `ask-your-life/README.md` (honest: what the model is, size, licence, limits: English-centric, static
   embeddings, no reasoning) and the site/workspace copy that calls semantic search a stand-in.
