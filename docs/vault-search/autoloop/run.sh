#!/usr/bin/env bash
# vault-search 자동 루프 러너 (Opus).
#   Track A (2nd-brain 루트에서):  bash <SKILL>/autoloop/run.sh A [N]
#   Track B (lemon-qmd 루트에서):   bash docs/vault-search/autoloop/run.sh B [N]
#   Track C (2nd-brain-app 루트에서): bash docs/run.sh C [N]
# N = 최대 반복. 기본 A=9 (태스크 5 + 여유 4), B=9 (태스크 5 + 여유 4), C=10 (태스크 6 + 여유 4).
set -uo pipefail

TRACK="${1:?usage: run.sh A|B|C [N]}"
HERE="$(cd "$(dirname "$0")" && pwd)"
MODEL="${CLAUDE_MODEL:-opus}"

case "$TRACK" in
  A) PROMPT="$HERE/PROMPT-A.md"; MAX="${2:-9}"; LOGDIR="tmp/vault-search"
     [ -f VAULT_RULES.md ] && [ -d wiki ] || { echo "2nd-brain vault 루트에서 실행" >&2; exit 1; } ;;
  B) PROMPT="$HERE/PROMPT-B.md"; MAX="${2:-9}"; LOGDIR="tmp/bench-ko"
     [ -f src/store.ts ] && grep -q 'qmd' package.json || { echo "lemon-qmd 루트에서 실행" >&2; exit 1; } ;;
  C) PROMPT="$HERE/PROMPT-C.md"; MAX="${2:-10}"; LOGDIR="tmp/qmd-search"
     [ -f electron-builder.yml ] && grep -q '"2nd-brain-app"' package.json || { echo "2nd-brain-app 루트에서 실행" >&2; exit 1; } ;;
  *) echo "track은 A·B·C 중 하나" >&2; exit 1 ;;
esac
mkdir -p "$LOGDIR"

for i in $(seq 1 "$MAX"); do
  LOG="$LOGDIR/loop-$TRACK-$i.log"
  echo "=== track $TRACK iteration $i/$MAX model=$MODEL $(date +%FT%T) ===" | tee "$LOG"
  claude -p "$(cat "$PROMPT")" --model "$MODEL" --permission-mode acceptEdits 2>&1 | tee -a "$LOG"
  if tail -n 3 "$LOG" | grep -q "^ALL DONE$"; then
    echo "=== ALL DONE at iteration $i ==="; exit 0
  fi
done
echo "=== 최대 반복($MAX) 도달 — PROGRESS-$TRACK.md 확인 ===" >&2
exit 2
