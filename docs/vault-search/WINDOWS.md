# Windows CI 기록

lemon-qmd CI의 `windows-latest` 결과를 기록한다. 실패 항목은 패치 스택에서 고치지 않고 여기에 남긴다(implementation-plan B0).

## 잡

| 잡 | 내용 | 실패 처리 |
|---|---|---|
| `test-node` (windows-latest, Node 22) | `npm install` → vitest `test/` | `continue-on-error` — 실패 테스트를 아래 표에 기록 |
| `electron-smoke` | `npm install --no-save electron@39 @electron/rebuild` → `electron-rebuild --only better-sqlite3` → `ELECTRON_RUN_AS_NODE=1 npx electron scripts/electron-smoke.mjs` | 실패하면 앱 빌드 조건이 깨진 것 — 원인 기록 |

## 실행 기록

| 날짜 | 커밋 | test-node 실패 | electron-rebuild 소요 | electron-smoke |
|---|---|---|---|---|
| — | — | 미측정(첫 CI 실행 전) | 미측정 | 미측정 |

## 미확인

- `@electron/rebuild`가 cmake-js 모듈(node-llama-cpp)을 소스 빌드로 빠지는지 — 잡은 `--only better-sqlite3`로 한정했다. 앱의 `install-app-deps`는 전체 모듈을 대상으로 하므로 앱 CI에서 따로 잰다.
