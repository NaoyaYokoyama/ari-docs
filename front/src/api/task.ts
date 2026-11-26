import { get, post } from "@/api/client";
import type { Task, TaskInput, TaskStatus } from "@/types/task";

// 個人のタスク（FN0602）。本人のものだけ
export function getTasks() {
  return get<Task[]>("/api/tasks");
}

export function createTask(input: TaskInput) {
  return post<Task>("/api/tasks/create", input);
}

// 変えるものだけ送る
export function updateTask(taskId: string, input: TaskInput) {
  return post<Task>("/api/tasks/update", { taskId, ...input });
}

// 列の並び（カンバンのドラッグ）。taskIds の順にその状態へ並べる
export function reorderTasks(status: TaskStatus, taskIds: string[]) {
  return post("/api/tasks/order", { status, taskIds });
}

export function deleteTask(taskId: string) {
  return post("/api/tasks/delete", { taskId });
}

export function deleteDoneTasks() {
  return post("/api/tasks/delete-done", {});
}

// ほかの画面（探して開くの「タスクに追加」など）でタスクを変えたことを、開いているタスクの一覧に知らせる
const CHANGED = "ari-docs:tasks-changed";

export function notifyTasksChanged() {
  window.dispatchEvent(new Event(CHANGED));
}

export function onTasksChanged(handler: () => void) {
  window.addEventListener(CHANGED, handler);
  return () => window.removeEventListener(CHANGED, handler);
}
