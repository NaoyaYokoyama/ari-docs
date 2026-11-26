import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { getPlaceScope } from "@/api/client";
import { getTasks } from "@/api/task";
import { getPreferences } from "@/app/preferences";
import { today } from "@/pages/task/taskView";

// タスクの期限を OS の通知で知らせる（FN0602-BR13）。デスクトップアプリの最初の窓だけ。
// 起動したとき（ログインしたあと）と、開いたまま日が変わって朝 8 時を過ぎたときに、場所ごとに 1 日 1 回
const CHECK_MS = 10 * 60 * 1000;
const MORNING_HOUR = 8;
const NOTIFIED_KEY = "task-notified";
const MAX_TITLES = 3;

function notifiedKey() {
  const scope = getPlaceScope();
  return scope ? `${NOTIFIED_KEY}:${scope}` : NOTIFIED_KEY;
}

function readNotified() {
  try {
    return localStorage.getItem(notifiedKey()) ?? "";
  } catch {
    return "";
  }
}

function writeNotified(date: string) {
  try {
    localStorage.setItem(notifiedKey(), date);
  } catch {
    // 覚えられなくても通知は出す（次に起動したときにもう一度出るだけ）
  }
}

// 期限が今日のものと過ぎたもの（未完了）を通知の文にする。無ければ null
export function taskNoticeText(tasks: { title: string; status: string; dueDate: string }[], day: string) {
  const open = tasks.filter((task) => task.status !== "done" && task.dueDate !== "" && task.dueDate <= day);
  if (open.length === 0) {
    return null;
  }
  const overdue = open.filter((task) => task.dueDate < day);
  const dueToday = open.length - overdue.length;
  const counts = [dueToday > 0 && `今日が期限 ${dueToday} 件`, overdue.length > 0 && `期限切れ ${overdue.length} 件`]
    .filter(Boolean)
    .join("・");
  // 期限切れ（古い順）を先に
  const sorted = [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const names = sorted.slice(0, MAX_TITLES).map((task) => `・${task.title}`);
  if (sorted.length > MAX_TITLES) {
    names.push(`ほか ${sorted.length - MAX_TITLES} 件`);
  }
  return { title: `ari-docs のタスク: ${counts}`, body: names.join("\n") };
}

async function check(startup: boolean) {
  if (!getPreferences().taskNotify) {
    return;
  }
  const day = today();
  if (readNotified() === day || (!startup && new Date().getHours() < MORNING_HOUR)) {
    return;
  }
  const text = taskNoticeText(await getTasks(), day);
  writeNotified(day);
  if (text) {
    await invoke("notify", text);
  }
}

// ログインしたあとに呼ぶ。止めるための関数を返す
export function startTaskNotice() {
  if (!isTauri() || getCurrentWindow().label !== "main") {
    return () => {};
  }
  const run = (startup: boolean) => void check(startup).catch(console.error);
  run(true);
  const timer = window.setInterval(() => run(false), CHECK_MS);
  return () => window.clearInterval(timer);
}
