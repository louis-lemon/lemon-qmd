# PROGRESS — Track B (lemon-qmd)

큐 정본 = `implementation-plan.md` Track B. 상태: ⬜ · 🔄(시도 N회) · ✅ · BLOCKED(사유).

| 태스크 | 상태 | 비고 |
|---|---|---|
| B0 포크 부트스트랩(루프 부분) | ✅ | 사람 부분(포크·upstream·`lemon`) 확인됨 |
| B1 픽스처 복사 + bench-ko.sh | ✅ | 원본 2nd-brain `e856721`, 기준선 `test/fixtures/ko-vault/BASELINE.md` |
| B2 Q1 한글 질의 조사 stripping | ✅ | 조사 목록만으론 0.6250(무변화) — `기` 어미 추가로 통과. 표 `BASELINE.md` B2 |
| B3 I1 한글 색인 bigram | ✅ | 시도 2. bigram-only 질의는 0.5972(띄어쓰기 변형 0건) — 글자 phrase OR 유지로 B2와 동률. 표 `BASELINE.md` B3 |
| B4 한국어 기본값 + 스킬 + 문서 | ✅ | M1 미실험 → Qwen3-Embedding-0.6B-Q8_0. Qwen3 벤치 수치 미측정(ko-vault `models.yml`이 embeddinggemma 고정). 태그·발행은 NEEDS-HUMAN |

## RESULT

RESULT B0 name=@lemoncloud/lemon-qmd version=2.8.3-lemon.0 publish_yml=removed ci=windows-latest+electron-smoke sdk_smoke=test/sdk-lemon.test.ts electron_smoke_node=searchLex=1 windows_ci=미측정(push 후 첫 실행)
RESULT B1 fixture=e856721 docs=28 queries=36 bm25_r5=0.6250 vector_r5=0.9861 hybrid_r5=0.9583|1.0000 full_r5=1.0000 full_mrr=0.9444|0.9583 model=embeddinggemma
RESULT B2 bm25_r5=0.6528|0.6528 vector_r5=0.9861 hybrid_r5=1.0000|1.0000 full_r5=1.0000 full_mrr=0.9583|0.9444 particles_only_bm25_r5=0.6250 store_ts_touchpoints=1 test=test/store-hangul-query.test.ts
RESULT B3 bm25_r5=0.6528|0.6528 vector_r5=0.9861 hybrid_r5=0.9861|0.9583 full_r5=1.0000|1.0000 full_mrr=0.9306|0.9444 bigram_only_bm25_r5=0.5972 per_query_bm25_delta=0 fts_cjk_version=2 store_ts_touchpoints=2 test=test/store-cjk-fts.test.ts(v1→v2)
RESULT B4 default_embed=hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf dims=1024 rerank_generate=unchanged skill=Korean-queries docs=README.ko.md+CHANGELOG.md lint=0 test_types=0 test_unit=0(vitest 45 files, bun 1158 pass) qwen3_bench=미측정 tag=NEEDS-HUMAN

## 메모

- B0 SDK 스모크는 `test/fixtures/ko-vault/`(B1에서 복사) 대신 tmp 한국어 문서를 쓴다 — B0가 B1보다 먼저라서.
- git 설치 스모크(`npm i github:louis-lemon/lemon-qmd#<sha>`)는 push 후 재측정 필요. 정정 5 실측(2026-09-15, `#lemon`, 이름 변경 전)만 있음.
- `skills/release/SKILL.md`는 아직 `publish.yml`을 언급한다 — 업스트림 릴리즈 스킬, 레몬 태그 절차는 README.ko.md.
- B1 실행 중 첫 초안 `bench-ko.sh`가 `tmp/bench-ko/`를 통째로 지워 `loop-B-1.log`(복원함)와 진행 중이던 `loop-B-2.log`가 날아갔다. 스크립트는 이제 자기 산출물만 지운다.
