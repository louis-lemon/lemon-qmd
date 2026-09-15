# LOCAL-RUN — 내 PC에서 돌리는 순서 (Opus)

전제: macOS, Claude Code 로그인(Opus 사용 가능), Node ≥22, `gh` 로그인. 실 vault는 `~/workspace/lemoncloud/lemon/knowledge`, 템플릿은 `~/workspace/lemoncloud/lemon/2nd-brain`.

## 0. 1회 준비 (사람 영역 — 루프가 자동 설치하지 않는다)

```bash
# qmd 글로벌 설치 + 기본 모델 (~2GB, ~/.cache/qmd/models)
npm install -g @tobilu/qmd
qmd pull
# 한국어 비교군 임베딩 모델 2개 (M1 라운드용)
QMD_EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf" qmd pull
# bge-m3는 제외(design §3) — 비교군은 embeddinggemma vs Qwen3-0.6B 두 개

# 문서 세트 배치
cd ~/workspace/lemoncloud/lemon/2nd-brain
git checkout -b feat/vault-search master
mkdir -p projects/second-brain/config/skills/vault-search
cp -r <다운로드>/vault-search/{design.md,implementation-plan.md,autoloop} projects/second-brain/config/skills/vault-search/
chmod +x projects/second-brain/config/skills/vault-search/autoloop/run.sh
git add projects/second-brain/config/skills/vault-search && git commit -m "docs(vault-search): design, plan, autoloop"

# lemon-qmd — louis-lemon 계정으로 포크 (B0 사람 부분, 정정 6)
gh repo fork tobi/qmd --fork-name lemon-qmd --clone=false   # louis-lemon 계정(개인 포크, 정정 6)
mv lemon-qmd ~/workspace/lemoncloud/lemon-qmd && cd ~/workspace/lemoncloud/lemon-qmd
git remote add upstream https://github.com/tobi/qmd && git fetch upstream --tags
git checkout -b lemon v2.8.3 && git push -u origin lemon
gh repo edit louis-lemon/lemon-qmd --default-branch lemon      # main은 업스트림 추적 전용
npm install && npm run test:unit                                   # 그린인지 먼저 확인
# npm 발행 없음(design 정정 5) — 소비는 git 태그. 툴체인 확인 1회: 빈 폴더에서 npm i github:louis-lemon/lemon-qmd#lemon
```

Claude Code 모델 확인: `claude --model opus -p "which model are you"`. 러너는 `CLAUDE_MODEL` 환경변수로 바꿀 수 있다(기본 `opus`). `--permission-mode acceptEdits` 등 플래그명은 설치된 버전의 `claude --help`로 한 번 확인.

## 1. Track A — 2nd-brain 루프 (`claude -p`, 약 30~60분)

```bash
cd ~/workspace/lemoncloud/lemon/2nd-brain
bash projects/second-brain/config/skills/vault-search/autoloop/run.sh A
# 로그: tmp/vault-search/loop-A-<n>.log · 상태: .../autoloop/PROGRESS-A.md
```

끝나면 확인할 것:
- `PROGRESS-A.md`의 BLOCKED·NEEDS-HUMAN 항목. A3가 BLOCKED면 대개 qmd/모델 미준비.
- `fixtures/BASELINE.md`의 `RESULT profile=fixture` 줄(stock qmd)과 A4 줄(aliases 후) 비교 — **aliases만으로 `bm25_r5`가 얼마나 오르는지**가 첫 실측 데이터.
- `gh pr create --draft --base master` 는 직접.

## 2. private 기준선 (사람 + Opus 대화, 루프 밖)

```bash
# 실 vault를 qmd 컬렉션으로
qmd collection add ~/workspace/lemoncloud/lemon/knowledge/wiki --name lemon-wiki
qmd update && qmd embed
# 골드셋 초안: Claude Code 대화형(Opus)로
#   "lemon-wiki 컬렉션 문서를 읽고 design.md §5 분포로 한국어 벤치 질의 50개 초안을
#    qmd bench 형식으로 private/vault-search/ko-bench.json에 써줘. 정답은 내가 확정한다."
# 확정 후
printf 'VAULT_WIKI=%s\nGOLD=%s\n' ~/workspace/lemoncloud/lemon/knowledge/wiki private/vault-search/ko-bench.json > private/vault-search/profile.env
bash projects/second-brain/config/skills/vault-search/scripts/bench.sh --private | tee private/vault-search/BASELINE.md
```

`private/`는 git 비추적. 수치를 공개 레포에 옮기지 않는다.

## 3. Track B — lemon-qmd 루프 (`claude -p`)

```bash
cd ~/workspace/lemoncloud/lemon-qmd
git checkout -b feat/hangul-fts lemon
mkdir -p docs/vault-search
cp ~/workspace/lemoncloud/lemon/2nd-brain/projects/second-brain/config/skills/vault-search/{design.md,implementation-plan.md} docs/vault-search/
cp -r ~/workspace/lemoncloud/lemon/2nd-brain/projects/second-brain/config/skills/vault-search/autoloop docs/vault-search/
bash docs/vault-search/autoloop/run.sh B
# 로그: tmp/bench-ko/loop-B-<n>.log · 상태: docs/vault-search/PROGRESS-B.md
```

B0(루프 부분: 패키지명·Windows CI·git 설치 스모크)→B1이 만드는 `scripts/bench-ko.sh`가 이후 OpenResearch의 run command다. B2·B3는 "첫 번째 후보"를 구현하고 **변형 비교는 4장에서**, B4가 승자를 기본값으로 굳힌다.

## 4. Track B 실험 — OpenResearch (Opus, 로컬 CPU)

```bash
curl -LsSf https://openresearch.sh/install.sh | sh
orx up                     # http://127.0.0.1:4791
orx install-skills         # Claude Code에 orx 스킬 설치
```

대시보드에서 **Import local project** → `~/workspace/lemoncloud/lemon-qmd`. 세션 생성 시 하네스 **Claude Code**, 모델 **Opus** 선택(세션마다 고른다). 그 다음 터미널에서:

```bash
orx projects                                   # <projectId>
orx project edit <projectId> --run-command 'bash scripts/bench-ko.sh'
orx project view <projectId>                   # root(baseline) <expId> — feat/hangul-fts 상태를 root로
orx exp run <rootId> --backend local && orx exp wait <rootId>
orx logs <rootId> | tail -3                    # RESULT 줄 = 기준선
```

주의 두 가지 — 실사에서 확인된 함정:
- **run은 커밋 스냅샷을 격리 디렉토리에 풀어 실행한다** → `node_modules`가 없다. `bench-ko.sh` 첫 줄이 `[ -d node_modules ] || npm ci` 여야 한다(B1 판정에 포함시킬 것). 모델 캐시는 `~/.cache/qmd/models`라 공유된다.
- run command에 env 접두 금지(`QMD_EMBED_MODEL=... bash …` 안 됨). 모델 선택은 커밋된 `test/fixtures/ko-vault/models.yml`을 바꾸는 **자식 노드**로 한다.

라운드는 세션의 Opus에게 이렇게 준다(design §6 그대로):

```text
docs/vault-search/design.md §6 라운드 순서로 실험 트리를 키워줘. 라운드마다 결정 하나,
옵션은 root(또는 직전 승자)의 자식 형제로, 각 자식은 src/store.ts 또는
test/fixtures/ko-vault/models.yml만 바꾼다. run command는 절대 바꾸지 마.
승자 = full_r5 최대(동률 full_mrr), bm25_r5가 기준선보다 낮으면 탈락.
라운드 끝날 때마다 표(노드·변경·RESULT)를 docs/vault-search/EXPERIMENTS.md에 append 하고 멈춰.
```

4라운드 × 2~3노드 = 10개 안팎, 로컬 CPU에서 노드당 임베딩 포함 수 분. 끝나면 `EXPERIMENTS.md`가 lemon-qmd 기본값(B4)의 근거 표이자 팀 공지 자료다.

## 4b. 앱(Electron)에서 소비하기 — 계약만 (REVIEW 2026-09-15)

앱 실제 계약(`docs/REVIEW.md` A·D·E, 결정 1·2·3·5). **메인 프로세스가 아니라 utilityProcess 워커 진입점**에서 연다 — 메인은 정적 import라 env 설정 순서가 안 맞고(정정 4 ④), llama.cpp abort·동기 `better-sqlite3`를 메인 이벤트 루프 밖에 격리해야 한다. 메인은 기존 `worker-embedder.ts`와 같은 id 매칭 IPC로 `update/embed/search/searchLex/status`만 중계, 렌더러 계약(`APP_CHANNELS.searchWiki`, `EmbeddingStatus`)은 유지.

```ts
// src/main/search-worker.ts — utilityProcess 진입점 (기존 embedding-worker.ts 대체)
import { join } from "node:path";

// 1) import 전에 env — qmd는 모듈 로드 시점에 XDG_CACHE_HOME을 읽어 MODEL_CACHE_DIR을 고정한다.
//    동봉 모델: <modelsRoot>/qmd/models/hf_Qwen_Qwen3-Embedding-0.6B-Q8_0.gguf (extraResources, 런타임 다운로드 없음)
process.env.XDG_CACHE_HOME = modelsRoot;
if (process.platform === "win32") process.env.QMD_FORCE_CPU = "1";   // CPU 프리빌트 기본, GPU는 2차 옵트인

// 2) 동적 import만 가능 — dist에 top-level await (require → ERR_REQUIRE_ASYNC_MODULE)
const { createStore } = await import("@lemoncloud/lemon-qmd");

const store = await createStore({
  dbPath: join(indexDir(vaultDir), "index.sqlite"),   // 기존 userData/embeddings/<vaultKey> 규칙 재사용
  config: {
    collections: { wiki: { path: join(vaultDir, "wiki"), pattern: "**/*.md" } },
    models: { embed: "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf" }, // lemon-qmd면 생략 가능(기본값)
  },
});

// 3) 색인 — embed()는 옵셔널이 아니다. 진행률은 IPC로 EmbeddingStatus에 중계
await store.update();
await store.embed({ onProgress });

// 4) 키 입력(디바운스): BM25만
const quick = await store.searchLex(userText);

// 5) Enter/버튼: lex + vec RRF — structured 경로. 확장 모델·리랭커 호출 없음 (결정 2)
const hits = await store.search({
  queries: [{ type: "lex", query: userText }, { type: "vec", query: userText }],
  rerank: false,
});
```

`search({query: userText})` 단일 문자열 경로는 쓰지 않는다 — BM25 강신호가 없으면 1.7B 확장 모델(1,223MB)을 부른다. raw 한국어가 그대로 들어가는 지점이므로 Q1/I1이 앱 경로에서 결정적이다.

패키징 체크(앱 레포, REVIEW 2026-09-15):
- **번들**: electron-vite 메인 산출물은 CJS, `dependencies`는 external 기본. qmd는 위처럼 워커에서 동적 `import()`만.
- **`electron-builder.yml` `asarUnpack`** — 현행 `**/*.node`만으론 부족. 목록: `node_modules/@node-llama-cpp/**`(`.node` 옆 `.dylib/.dll/.metallib`), `node_modules/sqlite-vec-*/**`(`vec0.dylib/.dll`을 `getLoadablePath()`로 `loadExtension`), `node_modules/better-sqlite3/build/**`. 기존 `onnxruntime-node/bin/**` 규칙은 삭제(결정 6). 확인: `npx asar list`.
- **`package.json` `pnpm.onlyBuiltDependencies`**에 `better-sqlite3`, `node-llama-cpp` 추가(현재 `electron`·`esbuild`뿐) — 없으면 pnpm이 설치 스크립트를 건너뛴다. Electron ABI(140) 리빌드는 `postinstall: electron-builder install-app-deps`. `@electron/rebuild`가 node-llama-cpp(cmake-js)를 소스 빌드 시도하는지는 **미확인** — B0 게이트에서 `install-app-deps` 재실행 시간 측정.
- **Windows**: `win:` 블록 신설, CPU 프리빌트(`win-x64`) 기본. 설치 크기를 위해 `files`에서 `@node-llama-cpp/win-x64-cuda*`·`*-vulkan`·`linux-*` 제외. CI는 `windows-latest` 1잡(빌드 + `build:unpack` 후 `searchLex` 스모크), macOS는 PC 수동 빌드(결정 4).
- **모델**: `extraResources`로 동봉(결정 1). `createStore`는 `LlamaCpp`에 `modelCacheDir`을 안 넘기므로 `XDG_CACHE_HOME` 우회 — 반드시 워커에서 import 전. `StoreOptions.modelCacheDir` 추가는 선택(패치 6번째, 업스트림 PR 감).
- **테스트**: vitest는 시스템 Node ABI(127)라 Electron용 `better-sqlite3`(ABI 140)를 못 연다 — 단위 테스트는 가짜 store로 격리, 실 SDK 스모크는 `ELECTRON_RUN_AS_NODE=1 electron` 또는 Playwright e2e.

## 4c. Track C — 앱 루프 (`claude -p`, REVIEW 2026-09-15)

전제: Track B B0 끝(lemon-qmd 태그 유무는 무관 — 없으면 루프가 `@tobilu/qmd@2.8.3` 핀으로 진행하고 `NEEDS-lemon-qmd`를 남긴다. npm 발행은 없다, design 정정 5). 큐는 `docs/implementation-plan-app.md` C0~C5, 프롬프트는 `docs/PROMPT-C.md`.

```bash
# 0) 별도 체크아웃 — 이 트리에는 다른 세션이 붙어 있을 수 있다. lockfile 이 바뀌는 트랙이라 node_modules 심링크 없이 자체 설치
cd ~/workspace/lemoncloud/louis/2nd-brain-app
git worktree add ../2nd-brain-app-wt-feat-qmd-search -b feat/qmd-search main
cd ../2nd-brain-app-wt-feat-qmd-search
pnpm install                                   # postinstall = install-app-deps (Electron ABI 리빌드)

# 1) 설계 문서를 브랜치에 올린다 — docs/ 는 지금 비추적이라 루프가 못 읽는다
cp -r ~/workspace/lemoncloud/louis/2nd-brain-app/docs ./docs
git add docs && git commit -m "docs(search): vault-search design, review, app plan"

# 2) 모델 파일 1회 (사람 영역 — 루프는 다운로드하지 않는다). C1 이 스크립트를 GGUF 용으로 바꾸므로 C1 뒤 한 번 더
pnpm fetch:embedding-model                     # C1 이후: resources/models/qmd/models/hf_Qwen_Qwen3-Embedding-0.6B-Q8_0.gguf (610MB)

# 3) 루프
bash docs/run.sh C
# 로그: tmp/qmd-search/loop-C-<n>.log · 상태: docs/PROGRESS-C.md
```

끝나면 확인할 것:
- `docs/PROGRESS-C.md`의 BLOCKED·NEEDS-HUMAN·NEEDS-lemon-qmd. C1 BLOCKED면 모델 파일 부재(2번 다시) — C2~C5는 모델 없이도 판정된다.
- 불변식: `grep -rln "lemon-qmd\|@tobilu/qmd" src | grep -v search-worker.ts` 출력 없음. 어기면 vitest가 시스템 Node ABI로 죽는다.
- `pnpm build:unpack` 산출물을 직접 열어 한국어 질의 3개(조사 붙은 원문 포함): 타이핑 = 키워드 결과, Enter = `both` 배지. 기존 e5 인덱스(`userData/embeddings/`)는 첫 실행에 사라져야 한다.
- C5는 push 후 Actions `build-win` 그린 → `dist/win-unpacked` 아티팩트를 Windows PC에서 실행. 설치본 형식·서명은 별도 결정.
- `gh pr create --draft --base main`은 직접. 끝나면 `git worktree remove ../2nd-brain-app-wt-feat-qmd-search`.

## 5. 마무리

0. **발행 판정 먼저**: `bench.sh --private`를 (a) stock qmd + Qwen3 글로벌 설정 + aliases(옵션 0), (b) lemon-qmd 승자 노드로 각각 돌려 `full_r5` 차이가 +5pt 미만이면 여기서 멈춘다 — 팀은 옵션 0, 아래 1~3 생략. 앱 경로는 `hybrid_r5` 기준(design §3, REVIEW 2026-09-15).
1. 승자를 `feat/hangul-fts`에 반영 → B4(기본값 확정) → `gh pr create --draft --base lemon` → 머지.
2. 태그: `git tag v2.8.3-lemon.1 && git push --tags`(npm 발행 없음). 확인: 빈 폴더에서 `npm i github:louis-lemon/lemon-qmd#v2.8.3-lemon.1` rc=0.
3. 팀 전환: 2nd-brain 설치 스크립트 `QMD_PKG=github:louis-lemon/lemon-qmd#v2.8.3-lemon.1`, 앱 `package.json` 같은 spec. 본인 PC는 `npm rm -g @tobilu/qmd && npm i -g github:louis-lemon/lemon-qmd#v2.8.3-lemon.1 && qmd embed -f`(기본 임베딩이 바뀌므로 재임베딩 필수).
4. `bench.sh --private`로 최종 수치 → `private/vault-search/BASELINE.md`에 "after" 절.
5. `vault-query` 스킬이 실제로 qmd를 먼저 부르는지 대화형으로 3개 질문 던져 `outputs/` 답변의 Evidence 확인.
6. 업스트림 동기화 루틴(월 1회): `git fetch upstream --tags && git checkout lemon && git rebase upstream/vX.Y.Z` → `npm run test:unit && bash scripts/bench-ko.sh` → `vX.Y.Z-lemon.1` 태그. 충돌은 패치 항목 단위(hangul.ts / 기본값 / 스킬 / 패키징)로 재적용.
7. (선택) Q1/I1 한글 패치만 tobi/qmd에 PR — 들어가면 패치 스택이 2개 줄어 유지비가 준다.

## 문제 시

| 증상 | 조치 |
|---|---|
| `qmd vsearch` 멈춤 | `QMD_FORCE_CPU=1`로 재시도 (Windows/Vulkan 이슈 #482 계열). bench.sh 안에서만 설정 |
| 루프가 같은 태스크에서 반복 실패 | 로그 `tmp/*/loop-*.log` 마지막 판정 출력 확인. PROGRESS의 `시도 N회`가 3이면 이미 BLOCKED 처리됨 |
| 픽스처 수치가 라운드마다 튐 | 픽스처는 회귀 가드. 승자 판정은 `bench.sh --private`로 재확인 |
