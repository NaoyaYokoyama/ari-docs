#!/usr/bin/env bash
# 作業終了時(Stop hook)の検証
# - front: tsc -b / eslint
# - back : cargo build（警告もNG）
# - desktop: cargo build（警告もNG。バックエンドをライブラリとして使うため）
# 失敗したら exit 2 で Claude に差し戻す。
# 前回成功時からコードが変わっていなければスキップする。
set -u

input=$(cat)
root="$(cd "$(dirname "$0")/../.." && pwd)"
cache="$root/.claude/.verify-cache"

# Stop hook の差し戻しで再開したターンでは再チェックしない（無限ループ防止）
if [ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ]; then
  exit 0
fi

cd "$root" || exit 0

# front/back の変更内容（未追跡ファイル含む）からハッシュを作る
state=$(
  {
    git diff HEAD -- front back desktop
    git ls-files --others --exclude-standard -- front back desktop | while read -r f; do
      echo "$f"; cat "$f"
    done
  } | sha1sum | cut -d' ' -f1
)
if [ -f "$cache" ] && [ "$(cat "$cache")" = "$state" ]; then
  exit 0
fi

errors=""

if ! out=$(cd front && npx tsc -b 2>&1); then
  errors+=$'\n## front: tsc -b\n'"$out"
fi
if ! out=$(cd front && npx eslint src 2>&1); then
  errors+=$'\n## front: eslint src\n'"$out"
fi
out=$(cd back && cargo build --message-format short 2>&1)
status=$?
# 例: src/main.rs:43:4: warning: function `x` is never used
problems=$(grep -E '^[^ ]+:[0-9]+:[0-9]+: (warning|error)|^error' <<<"$out")
if [ $status -ne 0 ] || [ -n "$problems" ]; then
  errors+=$'\n## back: cargo build（警告も修正すること）\n'"$problems"
fi
out=$(cd desktop/src-tauri && cargo build --message-format short 2>&1)
status=$?
problems=$(grep -E '^[^ ]+:[0-9]+:[0-9]+: (warning|error)|^error' <<<"$out")
if [ $status -ne 0 ] || [ -n "$problems" ]; then
  errors+=$'\n## desktop: cargo build（警告も修正すること）\n'"$problems"
fi

if [ -n "$errors" ]; then
  echo "検証に失敗しました。以下を修正してから作業を終えてください。$errors" >&2
  exit 2
fi

echo "$state" > "$cache"
exit 0
