# vault-search 구현 플랜 (최종)

> **For agentic workers:** 태스크 단위. 태스크마다 `- [ ]`와 **판정 커맨드**. 판정 rc=0 없이 완료 표시 금지. 자동 루프는 `autoloop/PROMPT-A.md`(2nd-brain), `autoloop/PROMPT-B.md`(qmd 포크)가 이 문서를 큐로 읽는다.

**Goal:** qmd를 엔진으로 한국어 vault 검색을 벤치 가능하게 만들고, 한글 색인·질의 개선과 한국어 기본값을 `louis-lemon/lemon-qmd`(CLI + **Electron 앱이 내장하는 SDK**) git 태그로 낸다 — npm 발행 없음(design 정정 5) (설계: `design.md`).

**Tech Stack:** Track A — Markdown, bash, Python 3(unittest). Track B — TypeScript(Node ≥22 / bun), vitest, qmd 내장 bench.

## Global Constraints

- Track A 브랜치 `feat/vault-search` (2nd-brain). Track B 레포 `louis-lemon/lemon-qmd`: `main`은 업스트림 추적 전용(수정 금지), 작업은 `lemon` 기준 `feat/hangul-fts`. `master`/`main`/`lemon` 직접 push 금지, PR은 draft.
- 2nd-brain: `raw/`·`archive/`·`wiki/VAULT_MEMORY.md` 불변. 실 vault 문서·경로·수치 커밋 금지. private 산출물은 `private/vault-search/`.
- 런타임·모델 자동 설치 금지(`npm i -g`, `qmd pull`). 부재 시 BLOCKED.
- lemon-qmd: 기존 테스트 `npm run test:unit` rc=0 유지. Han·가나 동작 변경 금지(Hangul 분기만). 한글 로직은 `src/hangul.ts`에, `store.ts` 접점은 2곳 이내.
- 태스크당 커밋 1회. 실측 함정은 같은 커밋에서 `design.md` §8에 한 줄.
- 상수: `SKILL=projects/second-brain/config/skills/vault-search`.

---

## Track A — 2nd-brain

### A1: 픽스처 vault
- [ ] `$SKILL/fixtures/ko-vault/wiki/` 24건 + `INDEX.md`·`TOPIC_MAP.md`·`topics/` 2건. `templates/wiki-concept.md` 구조, 본문 한국어, 슬러그 영어, wikilink 연결(고립 ≤3). 주제 합성. **aliases는 아직 넣지 않는다**(기준선용).
- **판정:** `ls $SKILL/fixtures/ko-vault/wiki/*.md | wc -l` ≥ 24 **and** `grep -L "^## Summary" $SKILL/fixtures/ko-vault/wiki/*.md | grep -v -e INDEX -e TOPIC_MAP` 출력 없음.

### A2: 골드셋 (qmd bench 형식)
- [ ] `$SKILL/fixtures/ko-search-bench.json` — `{"description","version":1,"collection":"ko-vault","queries":[…]}` 36문항. type 분포 design §5, `description`에 `ko:particle|ko:spacing|ko:alias` 태그. `expected_files`는 `wiki/<slug>.md` 상대경로.
- **판정:** `python3 -c 'import json,sys,os; f=json.load(open(sys.argv[1])); q=f["queries"]; assert len(q)>=36; bad=[e for x in q for e in x["expected_files"] if not os.path.exists(os.path.join(sys.argv[2],e))]; assert not bad,bad; ids=[x["id"] for x in q]; assert len(ids)==len(set(ids)); print("ok")' $SKILL/fixtures/ko-search-bench.json $SKILL/fixtures/ko-vault` → `ok`.

### A3: 기준선 스크립트 + 기록
- [ ] `$SKILL/scripts/bench.sh [--fixture|--private]` — `QMD_CONFIG_DIR`·`INDEX_PATH`를 `tmp/vault-search/`로 격리, `index.yml` 생성(컬렉션 + `models:` 블록은 `$SKILL/models.yml`에서), `qmd update && qmd embed && qmd bench <json> --json`, 마지막 줄 `RESULT profile=<p> bm25_r5=<f> vector_r5=<f> hybrid_r5=<f> full_r5=<f> full_mrr=<f>`. `qmd` 부재 시 rc=3 + 설치 안내. `--private`는 `private/vault-search/ko-bench.json`과 `~/workspace/lemoncloud/lemon/knowledge/wiki`를 쓰되 경로는 `private/vault-search/profile.env`에서 읽는다.
- [ ] `$SKILL/fixtures/BASELINE.md`: stock qmd(글로벌 설치, embeddinggemma)로 돌린 `RESULT` 줄 + type별 표 + qmd 버전·날짜.
- **판정:** `bash $SKILL/scripts/bench.sh --fixture | tail -1 | grep -E '^RESULT profile=fixture .*full_r5=[0-9.]+'` **and** `grep -q "^RESULT profile=fixture" $SKILL/fixtures/BASELINE.md`. (qmd 미설치 환경이면 BLOCKED — 사람 영역.)

### A4: aliases · 한글 제목 규칙
- [ ] `templates/wiki-{concept,tool,model,framework}.md`에 `aliases: []`.
- [ ] `VAULT_RULES.md` § Note Contracts: 신규 wiki 문서는 `aliases`에 한국어 표기·영문 약어. INDEX 항목 `[[slug|한글 제목]]` 권장. Effective 날짜 명시, 기존 문서 일괄 수정 없음.
- [ ] 픽스처 24건에 aliases, INDEX 한글 제목.
- **판정:** `grep -L "^aliases:" templates/wiki-*.md` 출력 없음 **and** `grep -l "^aliases:" $SKILL/fixtures/ko-vault/wiki/*.md | wc -l` ≥ 24 **and** `python3 projects/second-brain/config/scripts/vault_verify.py --lane none` rc=0 **and** `bench.sh --fixture`의 `bm25_r5` ≥ BASELINE(파싱 비교 rc=0). 결과 줄을 BASELINE.md "A4" 절에 추가.

### A5: `vault-search` 스킬 + 연결
- [ ] `$SKILL/SKILL.md` — frontmatter `name: vault-search`, `allowed-tools: Bash(qmd:*), mcp__qmd__*`. 절차: (1) 컬렉션 존재 확인 `qmd ls`, (2) **구조화 질의를 한국어·영어 lex 양쪽으로 직접 작성**(`lex:`에 어간형 + aliases 후보 + 영문 용어, `vec:`에 한국어 패러프레이즈, `hyde:`에 있을 법한 문서 요약 한 문장), (3) `qmd multi-get`으로 본문 확보 후 답변, (4) `Evidence`에 `[[slug]]` 인용. 금지: 조사 붙은 원문을 그대로 `qmd search`에 넣기.
- [ ] `$SKILL/models.yml` — 벤치용. `embed: hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf` 외 기본값.
- [ ] vault 루트 `.qmd/index.yml` 체크인 — `collections.wiki.path: ./wiki`, `ignore: ["**/private/**"]`, `context`. **models 블록·update 훅은 넣지 않는다**(신뢰 게이트 — 모델은 lemon-qmd 기본값). `.gitignore`에 `.qmd/index.sqlite`.
- [ ] `ln -s ../../projects/second-brain/config/skills/vault-search .claude/skills/vault-search`.
- [ ] `vault-query.md` 4단계 첫 줄에 "vault-search 스킬로 `qmd query` 먼저" 추가. `README.md`·`README.en.md` 스킬 표 행 추가. `setup-vault-mac.sh`·`setup-vault-windows.ps1`에 **옵션 0** 단계(선택, `SKIP_QMD=1`): `npm install -g @tobilu/qmd` → `~/.config/qmd/index.yml`에 `models.embed: Qwen3-Embedding-0.6B`(글로벌 설정은 게이트 없음) → `qmd pull` → vault 루트에서 `qmd update`. 패키지 spec은 스크립트 상단 변수 `QMD_PKG`로 빼서 lemon-qmd 전환 시 `github:louis-lemon/lemon-qmd#<tag>`로 한 줄 교체.
- **판정:** `test -L .claude/skills/vault-search` **and** `grep -q "qmd" projects/second-brain/config/skills/vault-query.md README.md README.en.md` **and** `grep -q "QMD_PKG" projects/second-brain/config/scripts/setup-vault-mac.sh` **and** `test -f .qmd/index.yml && ! grep -q "^models:" .qmd/index.yml` **and** `vault_verify.py --lane none` rc=0.

## Track B — `louis-lemon/lemon-qmd` (branch `feat/hangul-fts` ← `lemon`)

### B0: 포크 부트스트랩 (사람 + 루프 반반)
- [ ] (사람) `gh repo fork tobi/qmd --fork-name lemon-qmd --clone=false   # louis-lemon 계정(개인 포크, 정정 6)`. `git remote add upstream https://github.com/tobi/qmd`. 기본 브랜치 `lemon` 생성(`main`은 업스트림 추적 전용).
- [ ] `package.json`: `name: @lemoncloud/lemon-qmd`, `version: 2.8.3-lemon.0`, `repository`. bin `qmd` 유지. `.claude-plugin/marketplace.json` owner·repository. `src/db.ts` 설치 안내 문자열. `test/bin-wrapper.test.ts`의 `@tobilu/qmd` 경로 문자열은 런처 로직이 이름 무관이라 그대로 통과해야 함 — 실패하면 문자열만 갱신. `README.ko.md` 생성(배포판 설명·업스트림 링크·라이선스 MIT 고지 유지).
- [ ] `.github/workflows/ci.yml` 매트릭스에 `windows-latest` 추가(Node 22). 실패 항목은 고치지 말고 `docs/vault-search/WINDOWS.md`에 기록(B0 판정은 ubuntu·macos 그린 + windows 잡 존재).
- [ ] (REVIEW 2026-09-15 선행 조건 1) **앱 빌드 조건 이식** — windows 잡이 앱 빌드를 대변한다: `electron@39` devDependency(Node 22.22, ABI 140), `better-sqlite3`를 Electron ABI로 리빌드(`@electron/rebuild`; node-llama-cpp가 cmake-js 소스 빌드로 빠지는지는 **미확인** — 소요 시간을 `WINDOWS.md`에 기록), `scripts/electron-smoke.mjs`를 `ELECTRON_RUN_AS_NODE=1 npx electron`으로 실행해 **동적 `import()`** → `createStore` → `searchLex('검색') ≥1` 확인(`require()`는 dist top-level await로 불가 — 시도하지 않는다). `README.ko.md` "Electron 내장" 절에 `asarUnpack` 목록(`node_modules/@node-llama-cpp/**`, `node_modules/sqlite-vec-*/**`, `node_modules/better-sqlite3/build/**`)과 pnpm `onlyBuiltDependencies`(`better-sqlite3`, `node-llama-cpp`), 워커 진입점 동적 import 규칙을 기록.
- [ ] (design 정정 5) npm 발행 워크플로 없음. 대신 git 설치 스모크: 빈 tmp 디렉터리에서 `npm i github:louis-lemon/lemon-qmd#<현재 커밋 sha>` → `node -e "import('@lemoncloud/lemon-qmd').then(m=>{if(typeof m.createStore!=='function')process.exit(1)})"` rc=0 — `README.ko.md` "설치" 절에 기록: 설치는 node+tsc만(bun 불필요, design 정정 5 실측), `test:unit`은 bun 필요. `.github/workflows/publish.yml`이 업스트림에 있으면 삭제.
- [ ] SDK 스모크: `test/sdk-lemon.test.ts` — `createStore({dbPath: tmp, config:{collections:{ko:{path:'test/fixtures/ko-vault/wiki'}}, models:{embed: Qwen3}}})` → `searchLex('검색')` 결과 ≥1 (모델 로드 없이 BM25만 — 유지, REVIEW 2026-09-15). 앱 내장 경로의 회귀 가드. 모델이 필요한 수치는 B1 bench-ko 몫.
- **판정:** `node -e 'const p=require("./package.json");if(p.name!=="@lemoncloud/lemon-qmd"||p.bin.qmd!=="bin/qmd"||!p.exports)process.exit(1)'` **and** `npm run lint && npm run test:unit` rc=0 **and** `! test -f .github/workflows/publish.yml` **and** `grep -q "github:louis-lemon/lemon-qmd" README.ko.md` **and** `grep -q "windows-latest" .github/workflows/ci.yml` **and** `grep -q "ELECTRON_RUN_AS_NODE" .github/workflows/ci.yml` **and** `grep -q "tobi/qmd" README.ko.md` **and** `grep -q "asarUnpack" README.ko.md`.

### B1: 픽스처 복사 + bench-ko.sh
- 로컬 원본(이 clone 한정): 2nd-brain = `/Users/tak/workspace/lemoncloud/louis/2nd-brain`, 픽스처 = `<2nd-brain>/projects/second-brain/config/skills/vault-search/fixtures/`, 원본 해시 = `git -C <2nd-brain> log -1 --format=%h -- projects/second-brain/config/skills/vault-search/fixtures`.
- [ ] `test/fixtures/ko-vault/` ← 2nd-brain `fixtures/ko-vault/`(A4 이후, aliases 포함) 복사, `test/fixtures/ko-vault/README.md`에 원본 커밋 해시. `test/fixtures/ko-vault/ko-bench.json` ← `ko-search-bench.json`. `test/fixtures/ko-vault/models.yml`(기본: embeddinggemma — 기준선).
- [ ] `scripts/bench-ko.sh`: design §6 절차. 첫 줄 `[ -d node_modules ] || npm ci`(OpenResearch는 커밋 스냅샷을 격리 디렉토리에 풀어 실행 — `node_modules` 없음). `npm run qmd --`로 **현재 브랜치 코드** 실행. 마지막 줄 `RESULT …`.
- **판정:** `bash scripts/bench-ko.sh | tail -1 | grep -E '^RESULT .*full_r5='` **and** `npm run test:unit` rc=0. 결과를 `test/fixtures/ko-vault/BASELINE.md`에 기록.

### B2: Q1 — 한글 질의 조사 stripping
- [ ] `src/store.ts` plain-term 분기: `\p{Script=Hangul}` 어절이면 조사 목록(design §4) strip → 어간(≥2음절) phrase OR 원형 phrase. `sanitizeFTS5Phrase`는 건드리지 않는다(quoted phrase는 exact 유지).
- [ ] `test/store-hangul-query.test.ts`: `검색을`→`("검 색" OR "검 색 을")`, 2음절 어절 미strip, 한자·가나 경로 불변, quoted phrase 불변.
- **판정:** `npm run test:unit` rc=0 **and** `bench-ko.sh`의 `bm25_r5` > B1 기준선.

### B3: I1 — 한글 색인 bigram
- [ ] `normalizeCjkForFTS`: Hangul 런은 unigram + 음절 bigram 모두 emit(`검색을`→`검 색 을 검색 색을`), Han·가나는 현행. `FTS_CJK_NORMALIZED_VERSION` → `"2"`. B2의 질의도 bigram phrase를 쓰도록 정합.
- [ ] `store-cjk-fts.test.ts`에 마이그레이션 케이스(v1 DB → v2 재색인) 추가.
- **판정:** `npm run test:unit` rc=0 **and** `bench-ko.sh` `bm25_r5` ≥ B2 **and** `full_r5` ≥ B2. 미달이면 실패 기록(`design.md` §8), 3회 실패 시 BLOCKED — B2만으로 PR 진행.

### B4: 한국어 기본값 + 스킬 + 문서
- [ ] `src/llm.ts` `DEFAULT_EMBED_MODEL` → Qwen3-Embedding-0.6B-Q8_0 (라운드 M1 승자로 확정, 미실험 시 이 값). 리랭커·확장 모델 기본값 유지. `test/llm.test.ts`의 기본값 단언 갱신.
- [ ] `skills/qmd/SKILL.md`에 "Korean queries" 절: `lex:`에 어간형·aliases·영문 용어, `vec:` 한국어 패러프레이즈, 조사 붙은 원문 그대로 넣지 않기.
- [ ] `README.ko.md`·`CHANGELOG.md`: Hangul 처리, 기본 임베딩 변경(`qmd embed -f` 필요), bench 전후 수치.
- **판정:** `grep -q "Qwen3-Embedding" src/llm.ts` **and** `grep -q "Korean" skills/qmd/SKILL.md` **and** `grep -q "Hangul" README.ko.md CHANGELOG.md` **and** `npm run lint && npm run test:types && npm run test:unit` rc=0. 태그·발행은 사람 영역(NEEDS-HUMAN).

---

## 후속 (사람 체크포인트)

1. **모델 준비(루프 전)**: `qmd pull`, Qwen3-Embedding·bge-m3 GGUF 1회 수동 다운로드. 없으면 A3·B1이 BLOCKED.
2. Track A → B0(사람 부분) → Track B 루프 순서. B1은 A4 결과물 복사이므로 A 루프 종료 후 시작.
3. private 골드셋: Opus 초안 → Louis 확정 → `bench.sh --private` 기준선 → `private/vault-search/BASELINE.md`.
4. Track B 라운드 실험(design §6)은 OpenResearch에서. `LOCAL-RUN.md` 참조.
5. **발행 판정**(design §3 조건: private `full_r5` 옵션 0 대비 +5pt, `bm25_r5` 무퇴행. 앱 경로는 `hybrid_r5` +5pt — REVIEW 2026-09-15). 통과 시 draft PR 리뷰·머지 → `v2.8.3-lemon.1` 태그 push → 설치 스크립트 `QMD_PKG`·앱 `package.json`을 `github:louis-lemon/lemon-qmd#v2.8.3-lemon.1`로 교체(npm 발행 없음). 미달 시 팀은 옵션 0 유지, 포크는 실험용. 업스트림 PR(Q1/I1만)은 안정화 후 선택.
6. 업스트림 동기화 루틴: 월 1회 `git fetch upstream && git rebase upstream/<tag>` on `lemon` → test:unit + bench-ko 회귀 → `-lemon.N` 태그.
7. 다른 레포를 고칠 발견은 `NEEDS-<대상>-FIX`로 PROGRESS에 남긴다. 2nd-brain 발견은 `outputs/runs/` run-log.
