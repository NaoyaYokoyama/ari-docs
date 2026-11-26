import { CalendarDays, ChevronRight, ListTodo } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { twMerge } from "tailwind-merge";

import { getTasks, notifyTasksChanged, onTasksChanged, updateTask } from "@/api/task";
import { useApp } from "@/app/AppContext";
import { errorMessage } from "@/lib/format";
import { compareForList, DUE_CLASS, dueInfo, priorityOf, today } from "@/pages/task/taskView";
import type { Task } from "@/types/task";

// ホームに出す数
const LIMIT = 6;
// 期限がこの日数以内のものを出す
const SOON_DAYS = 7;

function daysFromToday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [ty, tm, td] = today().split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000);
}

// ホームの「やること」（FN0602-BR08）。期限切れ・7 日以内・進行中の未完了のタスクを、期限の近い順に出す
export default function HomeTasks() {
  const navigate = useNavigate();
  const { showMessage } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);

  useEffect(() => {
    const load = () => void getTasks().then(setTasks).catch(console.error);
    load();
    return onTasksChanged(load);
  }, []);

  if (!tasks) {
    return null;
  }

  const open = tasks.filter((task) => task.status !== "done");
  const shown = open
    .filter((task) => task.status === "doing" || (task.dueDate !== "" && daysFromToday(task.dueDate) <= SOON_DAYS))
    .sort(compareForList({ key: "due", desc: false }));
  if (shown.length === 0) {
    return null;
  }
  const overdue = open.filter((task) => task.dueDate !== "" && daysFromToday(task.dueDate) < 0).length;

  const complete = async (task: Task) => {
    // 先に消して、失敗したら戻す
    setTasks((current) => current?.map((item) => (item.taskId === task.taskId ? { ...item, status: "done" } : item)) ?? null);
    try {
      await updateTask(task.taskId, { status: "done" });
      // 繰り返しなら次の回ができるので読み直す（FN0602-BR10）
      if (task.repeat) {
        notifyTasksChanged();
      }
      showMessage("info", `「${task.title}」を完了にしました`);
    } catch (error) {
      setTasks((current) => current?.map((item) => (item.taskId === task.taskId ? task : item)) ?? null);
      showMessage("error", errorMessage(error, "タスクを完了にできませんでした"));
    }
  };

  return (
    <section className="mx-auto mt-10 max-w-2xl">
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
        <ListTodo size={14} />
        やること
        {overdue > 0 && <span className="font-normal text-destructive">期限切れ {overdue}</span>}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => navigate("/task")}
          className="flex items-center gap-0.5 font-normal hover:text-foreground"
        >
          すべて見る（{open.length}）
          <ChevronRight size={12} />
        </button>
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {shown.slice(0, LIMIT).map((task) => {
          const due = dueInfo(task);
          const priority = priorityOf(task.priority);
          return (
            <li key={task.taskId} className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent">
              <input
                type="checkbox"
                aria-label="完了にする"
                title="完了にする"
                checked={false}
                onChange={() => void complete(task)}
                className="size-4 shrink-0 cursor-pointer accent-brand"
              />
              <button
                type="button"
                onClick={() => navigate("/task", { state: { taskId: task.taskId } })}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none"
              >
                <span className={twMerge("shrink-0 rounded px-1.5 py-0.5 text-xs", priority.className)}>{priority.label}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                {task.status === "doing" && <span className="shrink-0 text-xs text-muted-foreground">進行中</span>}
                {due && (
                  <span className={twMerge("flex shrink-0 items-center gap-1 text-xs tabular-nums", DUE_CLASS[due.state])}>
                    <CalendarDays size={12} />
                    {due.label}
                    {due.note && <span className="font-medium">{due.note}</span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length > LIMIT && (
        <p className="mt-1.5 text-right text-xs text-muted-foreground">ほか {shown.length - LIMIT} 件</p>
      )}
    </section>
  );
}
