import { invoke, isTauri } from "@tauri-apps/api/core";

// 個人の設定（配色・文字の大きさ・Vim・一覧の並びなど。FN0701-BR15）。画面はこれまでどおり localStorage を読み書きし、
// デスクトップアプリでは、その値をこの PC の ari-docs（設定ファイルと同じフォルダの preferences.json）にも保存する。
// 起動したときはファイルの値を localStorage に戻してから画面を描く。どの場所（自分の PC・共有サーバー）でも同じ設定で、
// 共有サーバーには送らない。共有の設定は管理者の「サーバーの設定」（FN0902）

// 個人の設定に入れないもの: ログインのトークン（ファイルに残さない）、最近開いたもの（場所のデータの控え）、
// 管理者の PC の鍵（ほかの PC へ写させない。FN0102-BR12）
const EXCLUDED_PREFIXES = ["ari-docs-token", "recent-opened:", "ari-docs-device"];

function isPersonalKey(key: string) {
  return !EXCLUDED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function snapshot(): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    const value = key === null ? null : localStorage.getItem(key);
    if (key !== null && value !== null && isPersonalKey(key)) {
      values[key] = value;
    }
  }
  return values;
}

// 起動したときに 1 回（main.tsx）。ファイルがまだ無ければ、今の localStorage を保存する（前の版からの引き継ぎ）
export async function restorePersonalSettings() {
  if (!isTauri()) {
    return;
  }
  try {
    const values = await invoke<Record<string, string>>("load_preferences");
    if (Object.keys(values).length === 0) {
      personalSettingsChanged();
      return;
    }
    for (const key of Object.keys(snapshot())) {
      if (!(key in values)) {
        localStorage.removeItem(key);
      }
    }
    for (const [key, value] of Object.entries(values)) {
      if (isPersonalKey(key)) {
        localStorage.setItem(key, value);
      }
    }
  } catch (error) {
    // 読めなくても、この PC の localStorage の設定で使える
    console.error("個人の設定を読めませんでした", error);
  }
}

let timer: number | undefined;

// 個人の設定を変えたら呼ぶ。続けて変えたときにまとめるため、少し待ってから保存する
export function personalSettingsChanged() {
  if (!isTauri()) {
    return;
  }
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    try {
      invoke("save_preferences", { values: snapshot() }).catch((error) =>
        console.error("個人の設定を保存できませんでした", error),
      );
    } catch (error) {
      console.error("個人の設定を保存できませんでした", error);
    }
  }, 500);
}
