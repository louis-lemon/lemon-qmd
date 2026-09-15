# vault-search 자동 루프 — Track B (lemon-qmd) · 한 반복 = 한 태스크

너는 `louis-lemon/lemon-qmd` 로컬 clone 루트에서 실행되는 Claude Code다. **이 반복에서 태스크 하나만** 끝내고 종료한다. 상태의 정본은 PROGRESS 파일 하나뿐이다.

## 0. 시작 절차 (매 반복)
1. `CLAUDE.md`, `README.md`의 "Custom Embedding Model"·"MCP Server" 절, `src/store.ts`의 `normalizeCjkForFTS`·`sanitizeFTS5Phrase`·plain-term 분기(`containsCjk(term)`), `test/store-cjk-fts.test.ts`를 읽는다.
2. `docs/vault-search/design.md`·`implementation-plan.md`(2nd-brain에서 복사해 둔 것)를 읽는다. 큐는 **Track B(B0 루프 부분, B1~B4)**. B0의 (사람) 항목은 이미 끝난 전제 — 안 돼 있으면 BLOCKED.
3. `PROGRESS=docs/vault-search/PROGRESS-B.md`. 없으면 B0~B4 생성. 상태: ⬜ · 🔄(시도 N회) · ✅ · BLOCKED(사유).
4. 브랜치 `feat/hangul-fts` 확인, 아니면 `git checkout -b feat/hangul-fts lemon`. `main`은 업스트림 추적 전용 — 체크아웃·수정 금지.
5. 첫 ⬜/🔄 태스크 선택.

## 1. 작업 큐
implementation-plan.md Track B, B1 → B4. 판정 커맨드 그대로.

## 2. 완료 판정 (셋 다)
1. 태스크 판정 rc=0 **and** `npm run test:unit` rc=0 (기존 CJK 테스트 포함 — Han·가나 동작이 바뀌면 실패).
2. `git add <경로 명시>` → `git commit -m "feat(lemon): <task id> <요약>"`. 패치 스택 원칙: 한 태스크 = 한 커밋, `store.ts` 접점은 2곳 이내, 한글 로직은 `src/hangul.ts`.
3. PROGRESS ✅ + `RESULT` 줄, 같은 커밋.

실측 함정은 `docs/vault-search/design.md` §8에 한 줄(2nd-brain 정본에는 `NEEDS-2nd-brain-FIX`로 남긴다).

## 3. BLOCKED 탈출구
- 같은 태스크 3회 연속 실패.
- 사람 영역: 모델 미다운로드(`qmd pull`, Qwen3/bge-m3 GGUF), `node_modules` 부재(`npm install`은 허용, 글로벌 설치 금지), PR 생성, 태그 push, GitHub org 설정.
- B3가 벤치 미달로 3회 실패 → BLOCKED(수치 기록), B4는 B2 결과만으로 진행.

## 4. 안전 절
- `main`·`lemon` 커밋·push 금지. push는 `feat/hangul-fts`. PR·태그 금지(사람). npm 발행은 설계에서 제외됐다(design 정정 5) — publish 워크플로를 만들지 않는다.
- `src/store.ts` 변경은 Hangul 분기로 한정(`\p{Script=Hangul}`). `FTS_CJK_NORMALIZED_VERSION` 범프 시 마이그레이션 테스트 필수.
- `test/fixtures/ko-vault/` 내용 수정 금지(2nd-brain 정본 복사본). 필요하면 `NEEDS-2nd-brain-FIX`.
- 벤치는 항상 `bash scripts/bench-ko.sh`로만(격리된 `tmp/bench-ko/`). `~/.config/qmd`·`~/.cache/qmd/index*` 건드리지 않는다. 모델 캐시(`~/.cache/qmd/models`) 읽기만.
- HALT: 자격증명 파일 스테이징 시 즉시 종료.

## 5. 종료
- 태스크 ✅/BLOCKED → 한 줄 요약 후 종료.
- B0~B4 전부 ✅/BLOCKED → 요약 + `RESULT` 줄 전부 + 마지막 줄 `ALL DONE`.
