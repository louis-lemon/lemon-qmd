# lemon-qmd

[tobi/qmd](https://github.com/tobi/qmd)의 레몬 배포판. 한국어 vault 검색(2nd-brain CLI·Electron 앱)을 위해 작은 패치 스택만 얹는다. 사용법·CLI·MCP 서버는 업스트림 [README.md](README.md)와 같다 — bin 이름과 MCP 서버명은 `qmd` 그대로다.

- 패키지 이름: `@lemoncloud/lemon-qmd` (npm 발행 없음 — git 태그로 소비)
- 버전 규칙: `<업스트림 버전>-lemon.N` (예: `2.8.3-lemon.0`)
- 브랜치: `main` = 업스트림 추적 전용, `lemon` = 기본 브랜치(패치 스택)
- 설계·계획: [docs/vault-search/design.md](docs/vault-search/design.md), [implementation-plan.md](docs/vault-search/implementation-plan.md)

## 업스트림과 다른 점

1. 패키징: 이름·repository·플러그인 marketplace owner, `publish.yml` 제거, CI에 `windows-latest`와 Electron 스모크 잡 추가
2. (예정) 한글 FTS — 질의 조사 처리·음절 bigram 색인 (`src/hangul.ts`)
3. (예정) 한국어 기본값 — 기본 임베딩 Qwen3-Embedding-0.6B, 스킬 한국어 절

## 설치

npm 레지스트리가 아니라 GitHub 태그에서 설치한다.

```sh
# 팀 CLI
npm install -g github:louis-lemon/lemon-qmd#<tag>

# 앱 package.json
"@lemoncloud/lemon-qmd": "github:louis-lemon/lemon-qmd#<tag>"
```

git 설치 시 `prepare`가 `scripts/build.mjs`(= `tsc -p tsconfig.build.json`)로 `dist/`를 만든다. **설치에는 node + tsc만 필요하고 bun은 필요 없다.** 개발용 `npm run test:unit`은 vitest와 `bun test`를 둘 다 돌리므로 bun이 필요하다.

설치 스모크(빈 디렉터리):

```sh
npm i github:louis-lemon/lemon-qmd#<commit-sha>
node -e "import('@lemoncloud/lemon-qmd').then(m=>{if(typeof m.createStore!=='function')process.exit(1)})"
```

## Electron 내장

앱은 SDK(`createStore`)를 워커(utilityProcess)에서 쓴다. CI의 `electron-smoke` 잡이 이 조건을 대변한다 — Electron 39(ABI 140)로 `better-sqlite3`를 리빌드하고 `ELECTRON_RUN_AS_NODE=1 npx electron scripts/electron-smoke.mjs`로 `createStore` → `searchLex('검색')`을 확인한다.

- **동적 `import()`만 된다.** `dist/`에 top-level await가 있어 `require()`는 `ERR_REQUIRE_ASYNC_MODULE`로 실패한다. `XDG_CACHE_HOME` 같은 env는 모듈 로드 시점에 읽히므로, 워커 진입점에서 env를 설정한 뒤 `await import('@lemoncloud/lemon-qmd')`한다.
- **`asarUnpack`** (asar 안에서는 네이티브 바이너리를 로드할 수 없다):
  - `node_modules/@node-llama-cpp/**`
  - `node_modules/sqlite-vec-*/**`
  - `node_modules/better-sqlite3/build/**`
- **pnpm `onlyBuiltDependencies`**: `better-sqlite3`, `node-llama-cpp`
- `better-sqlite3`는 Electron ABI로 리빌드해야 한다(`@electron/rebuild` 또는 electron-builder `install-app-deps`). 리빌드된 모듈은 시스템 Node(vitest)에서 `NODE_MODULE_VERSION` 불일치로 로드되지 않는다.

Windows CI 결과·리빌드 소요 시간은 [docs/vault-search/WINDOWS.md](docs/vault-search/WINDOWS.md)에 기록한다.

## 업스트림 동기화

```sh
git fetch upstream
git rebase upstream/<tag>   # on lemon
npm run test:unit && bash scripts/bench-ko.sh
```

통과하면 `v<업스트림 버전>-lemon.N` 태그를 push한다.

## 라이선스

MIT. 원저작권은 Tobi Lutke([LICENSE](LICENSE))에게 있으며 이 배포판도 같은 라이선스를 따른다.
