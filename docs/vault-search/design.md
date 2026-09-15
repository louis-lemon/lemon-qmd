# vault-search 설계 문서 (최종)

- 작성: 2026-09-15 · 상태: 설계 확정 대기 (실사 완료)
- 위치: `projects/second-brain/config/skills/vault-search/design.md`
- 실사 대상: tobi/qmd v2.8.3 (2026-09-09) · nashsu/llm_wiki v0.6.11 · lemoncloud-io/2nd-brain `1da6a85` · alphaXiv/OpenResearch v0.2.2
- **정정 1**: 1차 초안은 Python으로 BM25 검색기를 직접 만들었다. qmd 실사 후 폐기 — 검색 엔진은 qmd를 쓰고, 우리는 **한국어 처리·vault 메타데이터·벤치**만 만든다.
- **정정 2**: 2차 초안은 업스트림 PR을 목표로 했다. 재조사 결과 코드 변경은 **레몬 배포판 `lemon-qmd`**(lemoncloud-io 포크, `@lemoncloud/lemon-qmd`)로 간다. 업스트림 PR은 선택지로만 남긴다.
- **정정 3(리뷰)**: 2차에서 "신뢰 게이트 때문에 배포판이 필수"라고 쓴 것은 과장. 글로벌 `~/.config/qmd/index.yml`은 게이트되지 않아 설치 스크립트로 우회 가능(옵션 0). 배포판이 필수인 건 한글 코드 변경뿐이며, 그 가치는 §6 실험이 증명해야 한다.
- **정정 4(REVIEW 2026-09-15, 앱 실사 — `docs/REVIEW.md` H 4건)**:
  ① §2 "2nd-brain: 검색 엔진 없음"은 vault 레포 기준. **앱에는 이미 BM25(`src/shared/wiki/search.ts`) + `Xenova/multilingual-e5-small`(`src/main/embedding/*`, onnxruntime, 모델 129MB 동봉) 엔진이 있다.** 앱 작업은 "통합"이 아니라 **완전 교체**(결정 6).
  ② 모델 크기 실측: 임베딩 610MB + 리랭커 610MB + 쿼리 확장 1.7B 1,223MB = 2.4GB("~1.3GB"는 확장 모델을 뺀 값). SDK 기본 `search({query})`는 BM25 강신호가 없으면 확장 모델을 호출한다(qmd `dist/store.js:4344-4354`) → 앱은 **structured 경로** `search({queries:[{type:'lex'},{type:'vec'}], rerank:false})`로 확장 모델·리랭커를 부르지 않는다. §3 "쿼리 확장… Opus가 lex/vec/hyde 직접 작성"은 CLI 경로 설명이라 앱 경로엔 적용되지 않는다.
  ③ LOCAL-RUN §4b `store.embed?.()` — `embed()`는 옵셔널이 아니다(qmd `dist/index.d.ts:195`).
  ④ `XDG_CACHE_HOME` 우회는 메인 프로세스 정적 import로는 불가 — qmd가 모듈 로드 시점에 읽어 고정하고(`dist/llm.js:143-145`) 앱 메인은 정적 import가 `setPath('userData')`보다 먼저 평가된다. **워커 진입점에서 env 설정 후 동적 `import()`**. qmd dist에 top-level await가 있어 `require()` 자체가 불가(실측 `ERR_REQUIRE_ASYNC_MODULE`) — lemon-qmd에 CJS 빌드는 추가하지 않는다(결정 5).

- **정정 5(2026-09-15, Louis)**: **npm 발행 없음.** lemon-qmd는 GitHub 포크 + git 태그로 소비한다 — 앱 `package.json` `github:louis-lemon/lemon-qmd#v2.8.3-lemon.1`, 팀 CLI `npm i -g github:louis-lemon/lemon-qmd#<tag>`. 근거: 업스트림 `package.json`에 `"prepare": "node scripts/install-hooks.mjs && node scripts/build.mjs"`가 있어 git 설치 시 `dist/`가 만들어진다(`dist/` 미커밋, `files: [bin/, dist/]`). `publish.yml`·npm 토큰·`@lemoncloud` 스코프 권한 확인은 전부 뺀다. 실측(2026-09-15): `scripts/build.mjs`는 `node_modules/typescript/bin/tsc -p tsconfig.build.json`만 실행 — **bun 불필요**. 빈 폴더에서 `npm i github:louis-lemon/lemon-qmd#lemon` → 154패키지 26초, `dist/index.js` 생성, `import()` 후 `createStore` function 확인. B0 이름 변경 전이라 import 이름은 `@tobilu/qmd`(B0 뒤 `@lemoncloud/lemon-qmd`). `test:unit`은 vitest + `bun test` 둘이라 **개발자 PC·CI엔 bun 필요**. npm 발행은 나중에 필요해지면 추가(패치 스택 밖).

- **정정 6(2026-09-15, Louis)**: 포크 소유자는 `lemoncloud-io` org가 아니라 **`louis-lemon` 개인 계정** — `louis-lemon/lemon-qmd`. 테스트 단계라 org 권한·설정 없이 간다. org 이전은 나중 결정(GitHub transfer 한 번, spec 문자열 교체).

## 1. 한 줄 결론

**qmd를 엔진으로 채택한다.** 한국어 개선은 3층 — vault(aliases·한글 제목), 모델 설정(Qwen3-Embedding), 한글 코드(질의 조사 처리·bigram 색인). 앞의 두 층은 **stock qmd + 설치 스크립트가 쓰는 글로벌 `index.yml`**로 충분하다(옵션 0). 세 번째 층만 코드 변경이라 레몬 배포판 `lemon-qmd`가 필요하며, **발행은 벤치 이득이 증명될 때만** 한다. 판정은 qmd 내장 `qmd bench` 하나. 자체 채점기는 만들지 않는다.

## 2. 실사로 확정된 사실

| 대상 | 사실 | 함의 |
|---|---|---|
| **qmd** | SQLite FTS5(`porter unicode61`) BM25 + 벡터 + 쿼리 확장(1.7B 파인튜닝) + 리랭커(Qwen3-Reranker-0.6B) + RRF. MCP 서버·HTTP 데몬·Claude Code 스킬 내장. 28.5k★, 주간 릴리즈 | 성숙도·생태계에서 직접 구현은 정당화 불가 |
| qmd 한글 색인 | `normalizeCjkForFTS`: Han·가나·**Hangul** 런을 **글자 단위로 공백 분리**해 색인(`검색을`→`검 색 을`). 한글 질의어는 글자 시퀀스 **exact phrase**로 변환 | 코드 읽기 기준(실행 미검증, A3 기준선에서 실측): 어간 질의(`검색`)는 `검색을`에 매치될 것(phrase 부분일치), 반대(`검색을`→`검색 개선`)는 실패, 띄어쓰기 변형은 글자 단위라 자연 해결될 것. BM25 IDF가 음절 단위라 **랭킹 품질은 낮고 리랭커 의존일 것으로 추정** |
| qmd 모델 | 기본 임베딩 embeddinggemma-300M(영어 최적). README가 CJK엔 Qwen3-Embedding-0.6B 권장. `index.yml`의 `models:` 블록으로 역할별 지정 가능(env 불필요) | 모델 교체는 설정 한 줄 + `qmd embed -f` |
| qmd 스킬 | 에이전트가 `intent:/lex:/vec:/hyde:` 구조화 질의를 **직접 작성**하도록 설계됨 | 조사·활용·en↔ko 변환의 상당 부분을 Opus가 질의 작성 단계에서 흡수할 수 있다. 형태소 분석기 없이 시작 가능 |
| qmd 벤치 | `qmd bench <fixture.json> [--json] [-c col]` — bm25/vector/hybrid/full 4개 백엔드, recall@1/3/5·MRR·P@k, 질의 `type`(exact/semantic/topical/cross-domain/alias)별 집계. `test/store-cjk-fts.test.ts` 회귀 테스트 존재 | **채점기 완성품**. 골드셋만 이 형식으로 쓰면 된다 |
| qmd 격리 | `INDEX_PATH`(DB), `QMD_CONFIG_DIR`(설정) 환경변수로 격리. 모델 캐시는 `~/.cache/qmd/models` 공유 | 벤치 스크립트가 worktree 안 tmp에 DB·설정을 만들면 OpenResearch 노드별 독립 실행 가능 |
| qmd 프로젝트 설정 | `.qmd/index.yml`이 레포와 함께 clone되어 자동 적용. 단 **기본값이 아닌 모델 URI·프로젝트 밖 경로·update 훅은 신뢰 게이트** — 터미널에선 `qmd trust`로 1회 승인, 에이전트·MCP·CI에선 **조용히 무시** | 체크인한 `.qmd/index.yml`로 Qwen3를 지정하면 에이전트·MCP 경로에선 안 먹는다. **단, `~/.config/qmd/index.yml`은 게이트되지 않으므로** 설치 스크립트가 사용자 글로벌 설정에 `models:`를 써 주면 포크 없이도 우회된다(**옵션 0**). 따라서 게이트는 배포판의 *보조* 근거이고, 포크가 반드시 필요한 것은 **코드 변경(Q1/I1)뿐**이다 |
| qmd 패키징 | `@tobilu/qmd`, bin `qmd`, `bin/qmd` 런처는 패키지명에 의존하지 않음(`node_modules` 세그먼트로 판정). `publish.yml`은 태그 push → bun test → `npm publish --provenance`. `.claude-plugin/marketplace.json`으로 Claude Code 플러그인 배포 | 이름만 바꿔 `@lemoncloud/lemon-qmd`로 발행 가능했으나 **npm 발행은 하지 않는다(정정 5)** — git 태그 설치는 `prepare`가 `dist/`를 빌드. bin·MCP 서버명은 `qmd` 유지 → 업스트림 스킬·`allowed-tools: mcp__qmd__*` 호환 |
| qmd 릴리즈 속도 | v2.5.1→v2.8.3 사이 태그 다수, PR #949(2026-09-09). 정확한 주기는 미확인이나 잦다 | 포크는 **작은 패치 스택**이어야 리베이스가 산다. 한글 로직은 `src/hangul.ts` 한 파일에 격리, `store.ts` 접점 최소 |
| qmd SDK (Electron 내장 경로) | `createStore({dbPath, config:{collections, models}})` — 인라인 config가 `models`를 그대로 `LlamaCpp`에 넘김(`src/index.ts`). **SDK 경로엔 신뢰 게이트 없음.** `exports`·`dist/index.d.ts` 있어 라이브러리 소비 가능. `search/searchLex/searchVector/expandQuery/get/multiGet/update` | 앱은 모델·컬렉션을 코드로 지정하니 기본값 논쟁이 사라진다. 대신 **앱 사용자는 Opus 없이 raw 한국어 질의를 친다** → Q1/I1 코드 변경이 앱 경로에서 결정적 |
| node-llama-cpp × Electron | 공식 Electron 가이드: 번들러 external 지정, 네이티브 바이너리 `asarUnpack`, asar에선 소스 빌드 불가(프리빌트만), Windows x64 CUDA/Vulkan/CPU 프리빌트 제공. `better-sqlite3`는 Electron ABI 리빌드 필요(`@electron/rebuild`) | 앱 패키징 리스크는 qmd가 아니라 네이티브 모듈 3개(node-llama-cpp·better-sqlite3·sqlite-vec) |
| qmd finetune/ | Qwen3-1.7B GRPO로 쿼리 확장 모델을 학습한 레시피·평가기(`eval_retrieval.py`) 동봉, `language: en` | **한국어 쿼리 확장 모델**은 업스트림이 절대 기본으로 싣지 않을 것 — 배포판만이 가질 수 있는 장기 레버 |
| **nashsu/llm_wiki** | 검색 파이프라인(토큰→벡터→wikilink 1-hop→RRF)은 qmd와 동형. CJK 판정 `U+3400–9FFF`(한자만) — 한글은 어절 통째 substring. 벤치 비공개 | 가져올 것 없음. qmd가 상위호환 |
| **2nd-brain** | (vault 레포 기준 — 앱은 정정 4 ①) 검색 엔진 없음(INDEX.md + `rg`). 슬러그·헤딩 영어, 본문 한국어, 템플릿에 `aliases` 없음. 공개 템플릿 wiki 0건, 실 코퍼스는 private `knowledge`(107건+). 게이트 `vault_verify.py`·unittest·vitest | en↔ko 불일치가 최대 구멍. `aliases`는 어떤 엔진에서도 효과 |
| **OpenResearch** | 노드=git 브랜치, run command 고정(env 접두 금지), 결과=로그 마지막 줄, 프리즈, stacked bushes. 세션은 별도 worktree(gitignore 파일 없음) | 루프는 **qmd 포크 레포**에서 돈다(코드가 바뀌는 곳). 픽스처·골드는 포크 안에 복사본 필요 |

## 3. 결정사항

| 축 | 결정 | 근거 |
|---|---|---|
| 엔진 | qmd (`npm i -g @tobilu/qmd`, lemon-qmd 전환 후 `npm i -g github:louis-lemon/lemon-qmd#<tag>`). vault-search 스킬은 qmd 래퍼 | §2 |
| 작업 분할 | **Track A** 2nd-brain: aliases·한글 제목 규칙, 픽스처 vault + 골드셋(qmd bench 형식), `.qmd/index.yml` 체크인, `vault-search` 스킬, 설치 스크립트가 lemon-qmd를 git 태그로 설치. **Track B** `louis-lemon/lemon-qmd`: 포크 부트스트랩(이름·Windows CI) → 한글 색인·질의 → 한국어 기본값 → `scripts/bench-ko.sh` → git 태그(`vX.Y.Z-lemon.N`, npm 발행 없음 — 정정 5) | 코드가 바뀌는 곳과 데이터가 사는 곳을 분리 |
| lemon-qmd가 바꾸는 것 | (1) `package.json` name·repository·marketplace owner, (2) `src/hangul.ts` + `store.ts` 접점 2곳(색인 정규화·plain-term 질의), (3) **기본 모델**: `DEFAULT_EMBED_MODEL`→Qwen3-Embedding-0.6B(리랭커 유지, 확장 모델은 벤치 후), (4) 스킬 `skills/qmd/SKILL.md` 한국어 절(lex 어간·alias 작성법), (5) `README.ko.md`. **그 외는 업스트림 그대로** | 패치 스택 5개 이내. 각 항목이 독립 커밋이라 리베이스 충돌 시 항목 단위로 재적용 |
| 업스트림 동기화 | `upstream` 리모트, `main`은 업스트림 추적만, `lemon`이 기본 브랜치(=패치 스택). 업스트림 태그마다 `git rebase upstream/vX.Y.Z` → `npm run test:unit` + `bench-ko.sh` 회귀 → 태그 `vX.Y.Z-lemon.N` push(npm 발행 없음 — 정정 5). 월 1회 주기, 긴급 시 수시 | 배포판 유지비를 정량화(태그당 1 리베이스) |
| **lemon-qmd 태그 조건**(구 "발행 조건") | 앱이 SDK로 내장하므로 포크·태그 자체는 확정(버전 고정 + Windows CI만으로도 근거 충분). 소비는 git 태그(정정 5). 단 **한글 코드(Q1/I1)를 lemon 브랜치에 남길지**는 §6 실험 — raw 질의 기준 private `full_r5`가 stock+Qwen3+aliases 대비 **+5pt 이상**, `bm25_r5` 무퇴행일 때만. 미달이면 lemon-qmd는 패치 스택 3개(패키징·기본값·Windows CI)로 줄인다. **앱 경로 기준 병기(REVIEW 2026-09-15)**: 앱 v1은 리랭커 없이 쓰므로(결정 2) 앱 관점 판정 지표는 `full_r5`가 아니라 **`hybrid_r5` +5pt 이상, `bm25_r5` 무퇴행** | 유지비를 정당화할 수치 임계. CLI는 full, 앱은 hybrid |
| 업스트림 PR | 선택. 한글 질의·색인 패치(Q1/I1)만 한글 분기 격리라 보내기 쉬움 — lemon-qmd 안정화 후 결정. 기본값 변경·한국어 스킬은 보내지 않는다 | 포크 유지비 절감이 유일한 동기 |
| 골드셋 정본 | 2nd-brain `fixtures/ko-search-bench.json`(qmd 형식). qmd 포크의 `test/fixtures/ko-vault/`는 **복사본**이며 헤더에 원본 커밋 해시 기록 | 정본 하나, 복사본은 해시로 추적 |
| 기준선 | **stock qmd**(수정 없는 `main`, embeddinggemma, aliases 없는 픽스처)의 `qmd bench` 4개 백엔드 수치 | 배포 가능한 현실적 출발점. rg 방식은 수치화 불가 |
| 임베딩 | Qwen3-Embedding-0.6B-Q8_0 (`hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf`). 옵션 0에선 글로벌 `index.yml`, lemon-qmd에선 빌트인 기본값. **bge-m3는 제외** — 공식 GGUF 없음(lm-kit·vonjack 등 커뮤니티 양자화), qmd의 프롬프트 포맷 분기가 embeddinggemma/nomic·Qwen3만 인식, llama.cpp CUDA misaligned 크래시 이슈(#17796) | qmd README 권장 + Korean MTEB. 비교군을 늘리면 골드셋 노이즈만 는다 |
| 리랭커 | 기본 Qwen3-Reranker-0.6B 유지(다국어) — **CLI 경로**. 앱 v1은 제외(결정 2, REVIEW 2026-09-15) | 변경 사유 없음 |
| 쿼리 확장 | 내장 1.7B 모델은 영어 파인튜닝 — 한국어 질의엔 쓰지 않고 **에이전트(Opus)가 lex/vec/hyde 직접 작성** — CLI 경로. 앱은 structured 경로라 확장 모델 미호출(정정 4 ②) | qmd 스킬 자체가 이걸 기본으로 권장 |
| 형태소 분석기 | 1차 범위 밖. bigram·조사 stripping으로 시작, kind별 수치가 막히면 `kiwi-nlp`(WASM) 검토 | YAGNI. 벤치가 필요를 증명하면 도입 |
| **앱 결정 1 — 모델 전달** (REVIEW 2026-09-15, Louis 확정) | **빌드 시 동봉** — Qwen3-Embedding-0.6B-Q8(610MB)을 지금 e5-small처럼 `extraResources`로 싣고 런타임 다운로드 없음(설치본 +480MB). 동봉 경로를 `XDG_CACHE_HOME`으로 지정, 파일명은 node-llama-cpp `resolveModelFile` 규칙(`hf_Qwen_Qwen3-Embedding-0.6B-Q8_0.gguf`). 모델 파일이 없으면 `searchLex`만으로 동작 + 사유 표시 | PRODUCT "install ≤10 min"·오프라인. 첫 실행 다운로드 UI·실패 처리 불필요 |
| **앱 결정 2 — 로컬 LLM 범위** (REVIEW 2026-09-15) | **리랭커·확장 모델 둘 다 v1 제외.** 앱 v1 = BM25 + 벡터 RRF. lemon-qmd 벤치에서 `full_r5 - hybrid_r5` 이득이 크면 v1.1 옵트인 재검토 | PRODUCT "Local LLMs: out of v1". 상주 1.2GB 회피 |
| **앱 결정 3 — 검색 UI** (REVIEW 2026-09-15) | **입력=키워드, 제출=전체.** 키 입력 디바운스는 `searchLex`(BM25)만, Enter/버튼에 lex+vec RRF(`rerank:false`) | 키 입력당 하이브리드+리랭크 불가. 제출 지연은 임베딩 1회 |
| **앱 결정 4 — Windows 러너** (REVIEW 2026-09-15) | **앱 CI `windows-latest` 1잡** 신설(빌드 + `build:unpack` 후 `searchLex` 스모크), **macOS는 PC 수동 빌드.** lemon-qmd B0 windows 잡과 Electron 39·`install-app-deps`·`asarUnpack` 조건 공유 | 앱 `.github/` 부재. 라이브러리 CI가 앱 빌드를 대변 |
| **앱 결정 5 — CJS/ESM** (REVIEW 2026-09-15) | 워커 진입점에서 동적 `import()`. lemon-qmd 패치 스택에 CJS 빌드 추가 없음 | 실측 `ERR_REQUIRE_ASYNC_MODULE`(정정 4 ④) |
| **앱 결정 6 — 기존 엔진 교체** (REVIEW 2026-09-15) | **완전 교체, 병행 기간 없음.** 삭제: `src/shared/wiki/search.ts`·`src/main/embedding/*`·`scripts/fetch-embedding-model.mjs`·`resources/models/Xenova`·`@huggingface/transformers`(+onnxruntime)·`electron-builder.yml` onnxruntime unpack 규칙. e2e spec(`search`·`embedding-index`·`workbench` 등) 갱신 | 정정 4 ① |

## 4. 한국어 개선 벡터 (실험 대상)

```
                 vault (Track A)              qmd fork (Track B)                  models (설정)
질의 ──► aliases/한글 제목이 lex 후보 ──► [Q1] 한글 term: 조사 strip + 어간 phrase OR 원형 ──► BM25
                                           [I1] 한글 색인: 음절 unigram / bigram / 둘 다      ──► RRF ──► 리랭커 ──► 결과
                                                                                             [M1] embeddinggemma / Qwen3-0.6B / bge-m3 ──► 벡터
```

- **I1 색인 정규화** (`src/store.ts normalizeCjkForFTS`): Hangul 런을 unigram(현행) / 음절 bigram(`검색을`→`검색 색을`) / 둘 다. `FTS_CJK_NORMALIZED_VERSION` 범프로 기존 DB 자동 재색인 — 메커니즘 이미 있음.
- **Q1 질의 처리** (`src/store.ts` plain-term 분기, `containsCjk`): Hangul 어절 끝 조사(은/는/이/가/을/를/에/에서/으로/로/의/도/와/과/에게/까지/부터/처럼) strip → 어간 phrase, 원형 phrase와 OR. 2음절 이하 어간은 strip 금지.
- **M1 모델**: 설정만. 벤치 백엔드 vector/hybrid/full에 영향.
- **A1 vault 메타데이터**: `aliases` frontmatter(한글 표기·영문 약어), INDEX `[[slug|한글 제목]]`. qmd는 frontmatter·제목을 색인하므로 BM25에 바로 반영.

측정 축: `qmd bench` 질의 `type`을 다음으로 쓴다 — `exact`(어간 그대로), `alias`(en↔ko), `semantic`(조사·활용·동의어), `topical`(토픽 질의), `cross-domain`(여러 문서). 한국어 특화 kind는 `description` 필드에 `ko:particle`, `ko:spacing` 태그로 남긴다(qmd 형식을 깨지 않기 위해).

## 5. 골드셋 규격

- 형식: qmd `BenchmarkFixture` v1. `collection: "ko-vault"`. 문항 `id`, `query`, `type`, `description`(ko 태그), `expected_files`(1~3), `expected_in_top_k`.
- 픽스처: 합성 한국어 wiki 24~30건(실 vault 내용 복사 금지) + 질의 36문항. 분포: exact 20% · alias 30% · semantic 30% · topical 10% · cross-domain 10%.
- private: `~/workspace/lemoncloud/lemon/knowledge/wiki` 컬렉션 `lemon-wiki`, 질의 40~60문항, 파일은 `private/vault-search/ko-bench.json`(git 비추적).
- 절차: Opus가 문서를 읽고 type별 질의 초안 → **Louis가 정답 확정**. 확정 전 수치는 기준선으로 쓰지 않는다.

## 6. OpenResearch 루프 (Track B 실험)

- 프로젝트 = `louis-lemon/lemon-qmd` 로컬 clone(`lemon` 브랜치). 하네스 Claude Code, 모델 Opus, 컴퓨트 로컬 CPU(임베딩 300MB~600MB 모델, M-series면 Metal).
- **run command(고정)**: `bash scripts/bench-ko.sh` — 스크립트가 (1) `INDEX_PATH`·`QMD_CONFIG_DIR`을 worktree 내 `tmp/bench-ko/`로 설정, (2) `index.yml`에 `ko-vault` 컬렉션 + `models:` 블록 기록(모델 선택은 **커밋된** `test/fixtures/ko-vault/models.yml`에서 읽음), (3) `npm run qmd -- update && embed`, (4) `npm run qmd -- bench test/fixtures/ko-vault/ko-bench.json --json` → 마지막 줄 `RESULT bm25_r5=.. vector_r5=.. hybrid_r5=.. full_r5=.. full_mrr=..`. 스크립트는 모든 노드에서 동일, 노드 간 차이는 `src/store.ts`·`models.yml`뿐.
- 라운드(결정 하나씩, 승자 위에 쌓기):
  1. **I1** 색인: unigram / bigram / union
  2. **Q1** 질의: strip off / strip+OR
  3. **M1** 임베딩: embeddinggemma / Qwen3-0.6B (2안)
  4. 리랭크 후보 수 30 / 60 — **CLI 경로 전용**(앱은 `rerank:false`, 결정 2, REVIEW 2026-09-15)
- 승자 판정: `full_r5` 최대, 동률 `full_mrr`. `bm25_r5`가 기준선보다 떨어지면 탈락(리랭커가 가리는 퇴행 방지). **앱 경로 기준 병기(REVIEW 2026-09-15)**: 라운드 1~3은 `hybrid_r5`(+5pt, `bm25_r5` 무퇴행)도 같이 기록 — 앱은 리랭커 없이 쓰므로 `full_r5`만 오르고 `hybrid_r5`가 안 오르는 승자는 앱 관점에선 무의미.
- 반론: 노드 ≤ 10개면 idea-to-autoloop `claude -p` 루프가 더 싸다. OpenResearch의 실익은 노드별 로그·diff가 증거로 남아 **lemon-qmd 기본값 선택의 근거 문서(`docs/EXPERIMENTS.md`)와 팀 설득 자료**가 된다는 것. Track B 실험은 OpenResearch, Track A는 `claude -p` 루프.

## 7. 범위 밖

- 데스크탑 앱 자체의 교체 코드(Electron 패키징, UI — 기존 BM25+e5 엔진 **완전 교체**, 결정 6). 이 문서는 앱이 소비할 **패키지·벤치·계약**까지만. 앱 쪽 계약(REVIEW 2026-09-15): 워커(utilityProcess) 진입점에서 env 설정 후 `await import('@lemoncloud/lemon-qmd')` → `createStore` 인라인 config에 `models.embed=Qwen3`, 컬렉션은 vault `wiki/`, 키 입력 `searchLex`·제출 `search({queries:[lex,vec], rerank:false})`(하이브리드, 리랭커·확장 모델 없음). 임베딩 모델은 앱이 빌드 시 동봉(`extraResources`) — **동봉 경로를 `XDG_CACHE_HOME`으로 지정, 파일명은 node-llama-cpp `resolveModelFile` 규칙**. 스니펫·패키징 체크는 LOCAL-RUN §4b.

- 자체 검색 엔진·MCP 서버 구현. Obsidian 플러그인.
- 기존 wiki 문서 일괄 aliases 추가(신규 문서부터, Language Convention과 같은 방식).
- 형태소 분석기(1차). 쿼리 확장 모델 한국어 파인튜닝.
- nashsu/llm_wiki 도입.

## 8. 리스크

| 리스크 | 대응 |
|---|---|
| 골드셋 라벨이 진짜 일 | 사람 확정 전 수치 무효. type별 표에서 이상치 확인 |
| 픽스처 작아 수치 요동 | 픽스처는 회귀 가드, 승자는 private 수치로 |
| 배포판 유지비(주간 릴리즈 리베이스) | 패치 스택 ≤5, `src/hangul.ts` 격리, 태그 단위 리베이스 + bench 회귀. 월 1회로 제한 |
| `.qmd/index.yml` 신뢰 게이트가 에이전트 경로에서 모델을 무시 | 모델은 lemon-qmd 기본값으로; `.qmd/index.yml`엔 기본값·프로젝트 내 경로(`./wiki`)만 둔다 |
| Hangul bigram이 Han/가나 동작을 바꿈 | Hangul 런만 분기(`\p{Script=Hangul}`), 기존 CJK 테스트 rc=0 유지가 게이트 |
| **Windows 필수** — 업스트림 CI 매트릭스는 ubuntu·macos뿐(windows 없음). 네이티브 의존(node-llama-cpp, better-sqlite3, sqlite-vec-windows-x64 옵션 dep 존재), vsearch 행 이슈(#482, AMD Vulkan), CUDA 병렬 컨텍스트 크래시(README `QMD_EMBED_PARALLELISM`) | lemon-qmd CI에 `windows-latest` 잡 추가(B0 게이트). 설치 스크립트 Windows 경로는 `QMD_FORCE_CPU=1` 기본 + `qmd doctor` 출력 로그. bench-ko를 Windows에서 1회 수동 재현(사람 체크포인트) |
| 비개발자 온보딩 비용 — 모델 ~2GB + Qwen3 0.6B, 첫 `qmd embed` 수 분 | 설치 스크립트가 `qmd pull`을 백그라운드로, 실패해도 BM25는 동작함을 안내 |
| qmd CLI는 `--index` 없으면 cwd에서 위로 `.qmd/index.yml`을 찾아 설정·DB를 바꾼다(`dist/cli/qmd.js` 2682행) — vault 루트 `.qmd/`(A5) 아래서 돌린 벤치가 격리 설정을 무시 (A3 실측) | `bench.sh`는 `qmd --index index`를 항상 명시. bench 매칭은 경로 **접미사**(`dist/bench/score.js`)라 컬렉션을 `wiki/`로 잡으면 `index.md`가 `wiki/inverted-index.md`에 맞는다 → 컬렉션 루트는 `ko-vault/` |
| 픽스처 천장 — stock qmd에서 vector 0.986·hybrid/full recall@5 1.0 (A3 실측) | 픽스처 개선 판정은 `bm25_r5`·recall@1·MRR로, 모델·리랭커 승자는 private 수치로 |
| aliases 추가가 hybrid를 흔든다 — A4에서 `bm25_r5` +5.6pt인데 `hybrid_r5` 1.0→0.986(cro-02 두 번째 문서 탈락) (A4 실측) | 메타데이터 변경 판정은 `bm25_r5`로, Track B 비교 기준선은 A4 줄(aliases 포함 픽스처)로 |
| 옵션 0의 "글로벌 `~/.config/qmd/index.yml`에 `models:`"는 vault 루트에서 안 먹는다 — CLI(`qmd mcp` 포함)는 `--index` 없으면 cwd 위로 찾은 `.qmd/index.yml`만 config source로 쓰고 글로벌 파일은 읽지 않는다(`dist/cli/qmd.js` 2682행, `dist/collections.js loadConfig`). 모델은 `config.models` → `QMD_EMBED_MODEL` env → 기본값 순(`dist/llm.js` 127행) (A5 실측) | 설치 스크립트 옵션 0은 글로벌 yml 대신 `QMD_EMBED_MODEL` 환경변수를 등록한다. 부수효과: vault 루트에서 뜬 qmd MCP는 글로벌 컬렉션 대신 `wiki`만 본다 |
| A5가 `models.yml`(Qwen3 embed)을 추가해 이후 `bench.sh` 실행은 Qwen3로 돈다 — A3·A4 `RESULT` 줄은 embeddinggemma(`models.yml` 부재) (A5) | embeddinggemma 수치 재현은 `models.yml`을 잠시 치우고 돌린다. 수치 비교 시 BASELINE의 모델 표기를 먼저 본다 |
| stock qmd CLI는 실행(`qmd ls` 포함)마다 해석된 `models:`를 활성 config 파일에 저장한다(`ensureModelsConfiguredForCli` → `saveConfig`, `dist/cli/qmd.js` 1831행) — 체크인 `.qmd/index.yml`이 매번 수정되고 YAML 주석이 지워진다 (A5 실측) | 체크인 파일은 qmd 직렬화 형식·주석 없이 둬 churn을 `models:` 블록 추가로 한정, 스킬·설치 스크립트가 `git checkout -- .qmd/index.yml`. 근본 수정은 lemon-qmd(project-local config엔 models 미저장) — `NEEDS-qmd-FIX` |
| 벤치가 모델 다운로드(~2GB) 요구 | 사람 영역: 루프 전 `qmd pull`·Qwen3·bge-m3 1회 수동. 캐시는 `~/.cache/qmd/models` 공유 |
| OpenResearch run은 커밋 스냅샷을 격리 디렉토리에 풀어 실행 — `node_modules`·`tmp/`·`private/` 없음 | `bench-ko.sh`가 `npm ci`·tmp 생성을 스스로 한다. private 벤치는 루프 밖 사람 체크포인트 |
| Opus가 lex를 잘 써서 Q1 효과가 안 보임 | 벤치는 raw 질의(확장 없음)로 측정 — **앱 사용자 경로**가 정확히 이것 |
| 앱 사용자 질의엔 Opus의 lex 작성이 없다 — 내장 확장 모델은 영어 파인튜닝 | 1차(CLI): Q1/I1 + Qwen3 임베딩 + 리랭커. 앱 v1은 리랭커 없음(결정 2, REVIEW 2026-09-15). 2차(범위 밖): `finetune/` 레시피로 한국어 쿼리 확장 모델, 또는 앱이 자체 LLM 호출로 lex/vec 생성 |
| Electron 네이티브 모듈 3종(node-llama-cpp·better-sqlite3·sqlite-vec) 패키징 | 앱 레포 책임. node-llama-cpp 공식 Electron 템플릿의 `electron-builder` 설정을 기준으로, Windows는 CPU 프리빌트 기본(`QMD_FORCE_CPU=1`) + GPU 옵션. 빌드 조건(Electron 39/ABI 140, `install-app-deps`, `asarUnpack` 목록)은 lemon-qmd B0 windows 잡이 대변(REVIEW 2026-09-15 선행 조건 1). `@electron/rebuild`가 cmake-js 모듈(node-llama-cpp)을 소스 빌드 시도하는지는 **미확인** — B0에서 `install-app-deps` 재실행 시간 측정 |
| vitest(시스템 Node 22.23, ABI 127)와 Electron 리빌드 `better-sqlite3`(ABI 140) 충돌 — qmd를 import하는 앱 단위 테스트는 `NODE_MODULE_VERSION` 불일치로 죽는다 (REVIEW 2026-09-15) | 앱 단위 테스트는 **가짜 store로 격리**(qmd 의존성 추가 전 준비 커밋에서 IPC 계약 + 가짜 store 먼저). 실 SDK 스모크는 `ELECTRON_RUN_AS_NODE=1 electron` 또는 Playwright e2e. 모델이 필요한 수치는 앱 CI에 넣지 않는다 |
| 업스트림 `package.json`에 `lint` 스크립트가 없다 — B0 판정 `npm run lint`가 그대로는 rc≠0 (B0 실측) | `lint` = `tsc -p tsconfig.build.json --noEmit`(`test:types`와 같은 검사). oxlint 도입은 패치 스택 밖 |
| `electron`을 devDependency로 넣으면 git 설치 소비자가 `prepare`용 devDependencies 설치 때 Electron 바이너리(~100MB)까지 받는다 (B0) | `electron@39`·`@electron/rebuild`는 CI `electron-smoke` 잡에서만 `npm install --no-save` |
| `bench-ko.sh`의 `npm ci`는 격리 스냅샷에서 실패한다 — `package-lock.json`이 `.gitignore`에 있어 커밋에 없다 (B1 실측) | `[ -d node_modules ] \|\| npm install`로 대체. 재현성은 `package.json` 범위에 의존 |
| `run.sh B`의 루프 로그 디렉터리 = `tmp/bench-ko/` = 벤치 격리 디렉터리. B1 첫 초안이 `rm -rf tmp/bench-ko`로 실행 중 루프 로그(`loop-B-*.log`)를 지웠다 (B1 실측) | `bench-ko.sh`는 자기 산출물(`config/`·`index.sqlite*`·`bench.json`)만 지운다 |
| 같은 코드·모델로 연속 2회 `hybrid_r5` 1.0000 / 0.9583, `full_mrr` 0.9444 / 0.9583 — hybrid도 실행 간 흔들린다. `bm25_r5` 0.6250은 동일 (B1 실측) | B2/B3 판정은 `bm25_r5`로. hybrid·full 비교는 여러 회 실행 후 |
| `2.8.3-lemon.0` 같은 prerelease 버전은 `test/esm-ambiguous-module.test.ts`의 `qmd --version` 정규식(`\d+\.\d+\.\d+`)에 걸려 실패한다 (B0 실측) | 정규식에 semver prerelease 접미사 허용 추가 — 업스트림 리베이스 시 충돌 후보 |
| Q1을 design §4 조사 목록대로만 구현하면 ko-vault `bm25_r5` 0.6250 — 기준선과 같다. 명사형 어미 `기`를 더해야 0.6528(sem-07 `나누기`). 남은 BM25 미스 13건은 모든 term이 AND라 활용형 동사(`만드는`·`정리해`·`들었는지`)나 문서에 없는 단어 하나가 질의 전체를 0건으로 만든다 (B2 실측). `NEEDS-2nd-brain-FIX`: §4 목록에 `기` 추가 | `src/hangul.ts` 접미사 = 조사 + `기`. 추가 이득은 접미사가 아니라 한글 다어절 질의의 AND 완화나 형태소 분석(kiwi) 쪽 — B3 이후 판단 |
| I1 bigram을 질의에 bigram phrase만으로 쓰면 ko-vault `bm25_r5` 0.6528→0.5972 — 띄어쓰기 변형(`하이브리드검색`↔`하이브리드 검색`)은 글자 phrase만 어절 경계를 넘는다. 글자 phrase를 OR로 남기면 B2와 36문항 전부 recall·MRR 동일: FTS5 `bm25()`는 phrase 단위 IDF라 bigram이 글자 phrase 점수를 중복할 뿐이다. bigram을 런 안에 끼우면(`검 색 을 검색 색을`) `"검색 품질"`이 `검색 품질을`에 안 맞는 quoted-phrase 퇴행이 생겨 필드 끝 꼬리에 붙였다 (B3 실측). `NEEDS-2nd-brain-FIX`: §4 I1 예시·기대효과 | 색인 bigram은 수치 이득 없음 — 유지비 대비 되돌릴지 private 벤치로 판단. 한글 BM25 이득은 AND 완화·형태소 분석 쪽 |
| 기본 임베딩을 Qwen3로 바꾸면 `test:unit`(CI=true)이 잡는 건 `formatQueryForEmbedding`/`formatDocForEmbedding` 기본 포맷 단언뿐이다 — 768차원 단언(`llm.test.ts`·`eval.test.ts`·`mcp.test.ts` 가짜 `float[768]` 테이블)은 `describe.skipIf(CI)` 안이라 초록인 채 로컬 실행에서만 깨진다. Qwen3-Embedding-0.6B 차원 1024는 GGUF 메타데이터 `qwen3.embedding_length`로 확인 (B4 실측) | 모델 기본값 변경 시 `grep -rn 768 test/`로 skip된 단언까지 같이 갱신 |
