# ko-vault bench baseline (lemon-qmd)

- Command: `bash scripts/bench-ko.sh` (raw queries, no expansion)
- Code: branch `feat/hangul-fts` at B1 (no Hangul changes yet — same search code as upstream `2.8.3`)
- Models: `models.yml` → embeddinggemma-300M-Q8_0; rerank/generate defaults (qwen3-reranker-0.6b, qmd-query-expansion-1.7B)
- Fixture: 2nd-brain `e856721` (A4, aliases included), 28 documents indexed (`wiki/**/*.md`), 36 queries

## B1 — baseline (2026-09-16)

```
RESULT bm25_r5=0.6250 vector_r5=0.9861 hybrid_r5=1.0000 full_r5=1.0000 full_mrr=0.9444
RESULT bm25_r5=0.6250 vector_r5=0.9861 hybrid_r5=0.9583 full_r5=1.0000 full_mrr=0.9583
```

Two consecutive runs, same code and models. Per-type recall@5 from the second run (last column is full MRR):

| type | n | bm25 | vector | hybrid | full | full MRR |
|---|---|---|---|---|---|---|
| exact | 7 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| alias | 11 | 0.909 | 1.000 | 1.000 | 1.000 | 1.000 |
| semantic | 11 | 0.273 | 1.000 | 1.000 | 1.000 | 0.909 |
| topical | 4 | 0.625 | 1.000 | 0.875 | 1.000 | 0.875 |
| cross-domain | 3 | 0.000 | 0.833 | 0.667 | 1.000 | 1.000 |

Notes:

- `bm25_r5` matches 2nd-brain A4 (stock global qmd, 0.6250) — the fork reproduces the baseline. BM25 misses 14 of 36; 12 of those return zero results (Korean terms become exact character-sequence phrases).
- `hybrid_r5` and `full_mrr` vary between runs (hybrid 1.0000 vs 0.9583; misses in run 2: top-01, cro-01, cro-02). Compare B2/B3 on `bm25_r5`, which was identical across runs.

## B2 — Q1 Hangul query suffix stripping (2026-09-16)

Plain Hangul terms become `(stem phrase OR original phrase)` (`src/hangul.ts`). Index unchanged.

```
RESULT bm25_r5=0.6528 vector_r5=0.9861 hybrid_r5=1.0000 full_r5=1.0000 full_mrr=0.9583
RESULT bm25_r5=0.6528 vector_r5=0.9861 hybrid_r5=1.0000 full_r5=1.0000 full_mrr=0.9444
```

Per-type recall@5 from the second run (last column is full MRR):

| type | n | bm25 | vector | hybrid | full | full MRR |
|---|---|---|---|---|---|---|
| exact | 7 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| alias | 11 | 0.909 | 1.000 | 1.000 | 1.000 | 0.955 |
| semantic | 11 | 0.364 | 1.000 | 1.000 | 1.000 | 0.909 |
| topical | 4 | 0.625 | 1.000 | 1.000 | 1.000 | 0.875 |
| cross-domain | 3 | 0.000 | 0.833 | 1.000 | 1.000 | 1.000 |

Notes:

- The design §4 particle list alone scored `bm25_r5=0.6250` (no change). Adding the nominalizing ending `기` recovers sem-07 (`나누기` → `나누`): +1 of 36.
- Remaining 13 BM25 misses: every term is ANDed, and one inflected verb (`만드는 방법`, `찾기`, `정리해`, `들었는지`) or a word absent from the expected doc zeroes the query. Suffix stripping cannot fix those.
