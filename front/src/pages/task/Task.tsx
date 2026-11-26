import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Columns3,
  Link2,
  List,
  ListTodo,
  ListTree,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { twMerge } from "tailwind-merge";

import {
  createTask,
  deleteDoneTasks,
  deleteTask,
  getTasks,
  moveTaskInWbs,
  onTasksChanged,
  reorderTasks,
  updateTask,
} from "@/api/task";
import { useApp } from "@/app/AppContext";
import { usePreferences } from "@/app/preferences";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import Input from "@/components/common/Input";
import Spinner from "@/components/common/Spinner";
import { ariLinkLabel } from "@/lib/ariLink";
import { errorMessage } from "@/lib/format";
import TaskDialog from "@/pages/task/TaskDialog";
import {
  compareForList,
  DEFAULT_LIST_SORT,
  DUE_CLASS,
  dueInfo,
  findAriLinks,
  LIST_SORTS,
  type ListSort,
  parseTaskText,
  PRIORITIES,
  priorityOf,
  repeatLabel,
  STATUSES,
} from "@/pages/task/taskView";
import WbsView, { childrenMap } from "@/pages/task/WbsView";
import { SHORTCUT, shortcutLabel } from "@/shortcut/shortcut";
import { usePageShortcuts } from "@/shortcut/usePageShortcuts";
import type { Task as TaskItem, TaskInput, TaskPriority, TaskStatus } from "@/types/task";

type View = "board" | "list" | "wbs";
const VIEW_KEY = "task-view";

function readView(): View {
  try {
    const value = localStorage.getItem(VIEW_KEY);
    return value === "list" || value === "wbs" ? value : "board";
  } catch {
    return "board";
  }
}

const SORT_KEY = "task-list-sort";

// 一覧の並べ方（この PC に覚える）
function readSort(): ListSort {
  try {
    const value = JSON.parse(localStorage.getItem(SORT_KEY) ?? "null") as Partial<ListSort> | null;
    if (value && LIST_SORTS.some((item) => item.value === value.key)) {
      return { key: value.key!, desc: !!value.desc };
    }
  } catch {
    // 読めなければ既定
  }
  return DEFAULT_LIST_SORT;
}

// 個人のタスク（FN0602）。優先度（高・中・低）と期限を付け、カンバン（未着手・進行中・完了）か一覧で見る
export default function Task() {
  const { showMessage, showConfirm } = useApp();
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [savedView, setView] = useState<View>(readView);
  // WBS を使わない設定（FN0602-BR14）ならボードにする
  const { taskWbs } = usePreferences();
  const view: View = savedView === "wbs" && !taskWbs ? "board" : savedView;
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const [sort, setSort] = useState<ListSort>(readSort);
  const titleRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    getTasks()
      .then(setTasks)
      .catch((error) => {
        console.error(error);
        setTasks([]);
        showMessage("error", errorMessage(error, "タスクを読み込めませんでした"));
      });
  }, [showMessage]);

  useEffect(load, [load]);
  useEffect(() => onTasksChanged(load), [load]);

  // ホーム・探して開くから来たとき（FN0602-BR08）。taskId はそのタスクの詳細、create は追加の欄へ
  const location = useLocation();
  const state = location.state as { taskId?: string; create?: boolean } | null;
  const loaded = tasks !== null;
  const handledKey = useRef("");
  useEffect(() => {
    if (!loaded || handledKey.current === location.key) {
      return;
    }
    handledKey.current = location.key;
    if (state?.taskId) {
      const task = tasks.find((item) => item.taskId === state.taskId);
      if (task) {
        setEditing(task);
      } else {
        showMessage("error", "タスクが見つかりませんでした（削除された可能性があります）");
      }
    } else if (state?.create) {
      titleRef.current?.focus();
    }
    // 読み込んだとき・別の画面から開き直したときだけ動かす
  }, [loaded, location.key]);

  const changeView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // 覚えられなくても表示は変える
    }
  };

  const changeSort = (next: ListSort) => {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, JSON.stringify(next));
    } catch {
      // 覚えられなくても並びは変える
    }
  };

  // Ctrl+N で追加の欄へ
  usePageShortcuts([
    {
      shortcut: SHORTCUT.CREATE,
      handler: () => titleRef.current?.focus(),
      whileTyping: true,
      enabled: editing === null,
    },
  ]);

  // 文の終わりの「明日」「金曜」「!高」などを期限・優先度にする（FN0602-BR11）。選んだ期限があればそちらが先
  const parsed = useMemo(() => parseTaskText(title), [title]);
  const effectiveDue = dueDate || parsed.dueDate;
  const effectivePriority = parsed.priority ?? priority;

  const add = async () => {
    const text = parsed.title.trim();
    if (!text) {
      return;
    }
    try {
      const task = await createTask({ title: text, priority: effectivePriority, dueDate: effectiveDue });
      setTasks((current) => [task, ...(current ?? [])]);
      // WBS では足した行を選ぶ（続けて Tab で段を下げられるように）
      if (view === "wbs") {
        requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-wbs-row="${task.taskId}"]`)?.focus());
      }
      setTitle("");
      setDueDate("");
      setPriority("medium");
    } catch (error) {
      showMessage("error", errorMessage(error, "タスクを追加できませんでした"));
    }
  };

  const save = async (task: TaskItem, input: TaskInput) => {
    try {
      const saved = await updateTask(task.taskId, input);
      setTasks((current) => current?.map((item) => (item.taskId === saved.taskId ? saved : item)) ?? null);
      // 繰り返しのタスクを完了にしたら、サーバーが作った次の回を読み込む（FN0602-BR10）
      if (saved.status === "done" && task.status !== "done" && (input.repeat ?? task.repeat)) {
        load();
      }
      setEditing(null);
      return true;
    } catch (error) {
      showMessage("error", errorMessage(error, "タスクを保存できませんでした"));
      return false;
    }
  };

  const remove = async (task: TaskItem) => {
    if (!(await showConfirm(`「${task.title}」を削除しますか？（元に戻せません）`))) {
      return;
    }
    try {
      await deleteTask(task.taskId);
      setTasks((current) => current?.filter((item) => item.taskId !== task.taskId) ?? null);
      setEditing(null);
      // 子があれば消したものの位置へ繰り上がるので読み直す（FN0602-BR14）
      if (tasks?.some((item) => item.parentId === task.taskId)) {
        load();
      }
    } catch (error) {
      showMessage("error", errorMessage(error, "タスクを削除できませんでした"));
    }
  };

  const removeDone = async () => {
    const count = tasks?.filter((task) => task.status === "done").length ?? 0;
    if (count === 0 || !(await showConfirm(`完了したタスク ${count} 件を削除しますか？（元に戻せません）`))) {
      return;
    }
    try {
      await deleteDoneTasks();
      setTasks((current) => current?.filter((task) => task.status !== "done") ?? null);
      load();
    } catch (error) {
      showMessage("error", errorMessage(error, "削除できませんでした"));
    }
  };

  // 状態だけを変える（一覧のチェック）
  const setStatus = (task: TaskItem, status: TaskStatus) => void save(task, { status });

  // カンバンで動かした（列の中の並び・ほかの列へ）。先に画面を変え、失敗したら読み直す
  const move = async (taskId: string, status: TaskStatus, index: number) => {
    if (!tasks) {
      return;
    }
    const column = tasks
      .filter((task) => task.status === status && task.taskId !== taskId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((task) => task.taskId);
    column.splice(Math.min(index, column.length), 0, taskId);
    setTasks(
      tasks.map((task) => {
        const order = column.indexOf(task.taskId);
        return order === -1 ? task : { ...task, status, sortOrder: order };
      }),
    );
    try {
      await reorderTasks(status, column);
      // 繰り返しのタスクを完了の列へ動かしたら、次の回を読み込む
      const moved = tasks.find((task) => task.taskId === taskId);
      if (status === "done" && moved && moved.status !== "done" && moved.repeat) {
        load();
      }
    } catch (error) {
      showMessage("error", errorMessage(error, "動かせませんでした"));
      load();
    }
  };

  // WBS の子を足す（FN0602-BR14）
  const addChild = async (input: TaskInput) => {
    try {
      const task = await createTask(input);
      setTasks((current) => [task, ...(current ?? [])]);
      return task;
    } catch (error) {
      showMessage("error", errorMessage(error, "タスクを追加できませんでした"));
      return null;
    }
  };

  // WBS の中で動かす（段を下げる・上げる・並べ替え）。先に画面を変え、失敗したら読み直す
  const moveWbs = async (taskId: string, parentId: string, index: number) => {
    if (!tasks) {
      return;
    }
    const siblings = (childrenMap(tasks).get(parentId) ?? [])
      .filter((task) => task.taskId !== taskId)
      .map((task) => task.taskId);
    siblings.splice(Math.min(index, siblings.length), 0, taskId);
    setTasks(
      tasks.map((task) => {
        const order = siblings.indexOf(task.taskId);
        return order === -1 ? task : { ...task, parentId, wbsOrder: order };
      }),
    );
    try {
      await moveTaskInWbs(taskId, parentId, index);
    } catch (error) {
      showMessage("error", errorMessage(error, "動かせませんでした"));
      load();
    }
  };

  const counts = useMemo(() => {
    const result = { todo: 0, doing: 0, done: 0, overdue: 0 };
    for (const task of tasks ?? []) {
      result[task.status] += 1;
      if (dueInfo(task)?.state === "overdue") {
        result.overdue += 1;
      }
    }
    return result;
  }, [tasks]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <ListTodo size={20} className="text-brand" />
          タスク
        </h1>
        <span className="text-xs text-muted-foreground">
          未着手 {counts.todo}・進行中 {counts.doing}・完了 {counts.done}
          {counts.overdue > 0 && <span className="ml-2 text-destructive">期限切れ {counts.overdue}</span>}
        </span>
        <span className="flex-1" />
        <div role="radiogroup" aria-label="表示" className="flex rounded-md border border-border p-0.5">
          {(
            [
              ["board", "ボード", Columns3],
              ["list", "一覧", List],
              ["wbs", "WBS", ListTree],
            ] as const
          ).filter(([value]) => value !== "wbs" || taskWbs).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={view === value}
              onClick={() => changeView(value)}
              className={twMerge(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs",
                view === value ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 追加の欄（Ctrl+N） */}
      <form
        className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          ref={titleRef}
          aria-label="新しいタスクのタイトル"
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`新しいタスク（例: 資料を送る 明日 !高）。Enter で追加・${shortcutLabel(SHORTCUT.CREATE)} でここへ`}
          className="min-w-48 flex-1"
        />
        <div role="radiogroup" aria-label="優先度" className="flex gap-1">
          {PRIORITIES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={effectivePriority === item.value}
              title={`優先度: ${item.label}`}
              onClick={() => setPriority(item.value)}
              className={twMerge(
                "h-9 w-9 rounded-md border text-sm",
                effectivePriority === item.value
                  ? twMerge("border-transparent font-medium", item.className)
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Input
          type="date"
          aria-label="期限"
          title="期限"
          value={effectiveDue}
          onChange={(e) => setDueDate(e.target.value)}
          className={twMerge("w-40", !dueDate && parsed.dueDate && "border-brand")}
        />
        <Button type="submit" disabled={!title.trim()}>
          <Plus size={16} />
          追加
        </Button>
      </form>

      <div className="min-h-0 flex-1 overflow-auto">
        {!tasks ? (
          <Spinner />
        ) : view === "wbs" ? (
          <WbsView tasks={tasks} onOpen={setEditing} onStatus={setStatus} onMove={moveWbs} onAdd={addChild} />
        ) : view === "board" ? (
          <Board tasks={tasks} onOpen={setEditing} onMove={(id, status, index) => void move(id, status, index)} onRemoveDone={() => void removeDone()} />
        ) : (
          <TaskList
            tasks={tasks}
            hideDone={hideDone}
            onHideDoneChange={setHideDone}
            sort={sort}
            onSortChange={changeSort}
            onOpen={setEditing}
            onStatus={setStatus}
            onRemoveDone={() => void removeDone()}
          />
        )}
      </div>

      <TaskDialog task={editing} onClose={() => setEditing(null)} onSave={save} onDelete={(task) => void remove(task)} />
    </div>
  );
}

const DRAG_TYPE = "application/x-ari-task";

function PriorityBadge({ value }: { value: TaskPriority }) {
  const item = priorityOf(value);
  return (
    <span className={twMerge("shrink-0 rounded px-1.5 py-0.5 text-[0.6875rem] font-medium", item.className)} title={`優先度: ${item.label}`}>
      {item.label}
    </span>
  );
}

function DueLabel({ task }: { task: TaskItem }) {
  const due = dueInfo(task);
  const repeat = task.repeat ? (
    <span className="flex shrink-0 items-center text-muted-foreground" title={`繰り返し: ${repeatLabel(task.repeat)}`}>
      <Repeat size={12} />
    </span>
  ) : null;
  if (!due) {
    return repeat;
  }
  return (
    <span className={twMerge("flex shrink-0 items-center gap-1 text-xs tabular-nums", DUE_CLASS[due.state])} title="期限">
      <CalendarDays size={12} />
      {due.label}
      {due.note && <span className="font-medium">{due.note}</span>}
      {repeat}
    </span>
  );
}

// カードのメモの 1 行目。ari:// のリンクは名前と印にする（FN0602-BR12）
function MemoSummary({ text }: { text: string }) {
  if (!text) {
    return null;
  }
  const links = findAriLinks(text);
  let rest = text;
  for (const { text: raw } of links) {
    rest = rest.split(raw).join(" ");
  }
  rest = rest.replace(/\s+/g, " ").trim();
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
      {links.length > 0 && (
        <span className="flex shrink-0 items-center gap-0.5 text-brand" title={links.map((item) => item.text).join("\n")}>
          <Link2 size={12} />
          {!rest && <span className="truncate">{ariLinkLabel(links[0].link)}</span>}
        </span>
      )}
      {rest && <span className="truncate">{rest}</span>}
    </span>
  );
}

// カンバン。カードをドラッグして列（状態）と並びを変える。押すと詳細
function Board({
  tasks,
  onOpen,
  onMove,
  onRemoveDone,
}: {
  tasks: TaskItem[];
  onOpen: (task: TaskItem) => void;
  onMove: (taskId: string, status: TaskStatus, index: number) => void;
  onRemoveDone: () => void;
}) {
  // ドロップする場所（列と、その列の何番目に入れるか）
  const [target, setTarget] = useState<{ status: TaskStatus; index: number } | null>(null);
  const dragging = useRef<string | null>(null);

  return (
    <div className="grid h-full min-w-[720px] grid-cols-3 gap-4 p-4">
      {STATUSES.map((column) => {
        const items = tasks.filter((task) => task.status === column.value).sort((a, b) => a.sortOrder - b.sortOrder);
        const over = target?.status === column.value;
        return (
          <section
            key={column.value}
            aria-label={column.label}
            className={twMerge(
              "flex min-h-0 flex-col rounded-xl border border-border bg-muted/40",
              over && "border-brand bg-brand/5",
            )}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_TYPE)) {
                return;
              }
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              // カードの上でなければ列の最後
              if (!(e.target as HTMLElement).closest("[data-task]")) {
                setTarget({ status: column.value, index: items.length });
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setTarget(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = dragging.current;
              if (id && target) {
                onMove(id, target.status, target.index);
              }
              setTarget(null);
              dragging.current = null;
            }}
          >
            <header className="flex items-center gap-2 px-3 pt-3 pb-2 text-sm font-medium">
              {column.label}
              <span className="rounded-full bg-background px-2 text-xs font-normal text-muted-foreground">{items.length}</span>
              <span className="flex-1" />
              {column.value === "done" && items.length > 0 && (
                <button
                  type="button"
                  onClick={onRemoveDone}
                  title="完了したタスクをまとめて削除"
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-normal text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Trash2 size={12} />
                  まとめて削除
                </button>
              )}
            </header>
            <ul className="min-h-16 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
              {items.map((task, index) => (
                <li key={task.taskId} data-task={task.taskId}>
                  {over && target?.index === index && <div className="mb-2 h-0.5 rounded bg-brand" />}
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      dragging.current = task.taskId;
                      e.dataTransfer.setData(DRAG_TYPE, task.taskId);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      dragging.current = null;
                      setTarget(null);
                    }}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(DRAG_TYPE)) {
                        return;
                      }
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const after = e.clientY > rect.top + rect.height / 2;
                      setTarget({ status: column.value, index: index + (after ? 1 : 0) });
                    }}
                    onClick={() => onOpen(task)}
                    onKeyDown={(e) => {
                      // キーで動かす（FN0602-BR04）。Alt+←→ で隣の列の一番上へ、Alt+↑↓ で列の中の並び
                      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
                        return;
                      }
                      const columnIndex = STATUSES.findIndex((item) => item.value === column.value);
                      let next: { status: TaskStatus; index: number } | null = null;
                      if (e.key === "ArrowLeft" && columnIndex > 0) {
                        next = { status: STATUSES[columnIndex - 1].value, index: 0 };
                      } else if (e.key === "ArrowRight" && columnIndex < STATUSES.length - 1) {
                        next = { status: STATUSES[columnIndex + 1].value, index: 0 };
                      } else if (e.key === "ArrowUp" && index > 0) {
                        next = { status: column.value, index: index - 1 };
                      } else if (e.key === "ArrowDown" && index < items.length - 1) {
                        next = { status: column.value, index: index + 1 };
                      }
                      if (!next) {
                        return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      onMove(task.taskId, next.status, next.index);
                      // 動かした先のカードにフォーカスを残す
                      requestAnimationFrame(() =>
                        document.querySelector<HTMLElement>(`[data-task="${task.taskId}"] button`)?.focus(),
                      );
                    }}
                    title="押すと詳細。ドラッグか Alt+矢印で動かせます"
                    className={twMerge(
                      "block w-full cursor-grab rounded-lg border border-border bg-background p-3 text-left shadow-sm transition hover:border-brand/60 active:cursor-grabbing",
                      task.status === "done" && "opacity-70",
                    )}
                  >
                    <span className="flex items-start gap-2">
                      <PriorityBadge value={task.priority} />
                      <span className={twMerge("min-w-0 flex-1 text-sm break-words", task.status === "done" && "line-through")}>
                        {task.title}
                      </span>
                    </span>
                    {(task.dueDate || task.description || task.repeat) && (
                      <span className="mt-2 flex items-center gap-2">
                        <DueLabel task={task} />
                        <MemoSummary text={task.description} />
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {over && target?.index === items.length && <li className="h-0.5 rounded bg-brand" />}
              {items.length === 0 && !over && (
                <li className="py-6 text-center text-xs text-muted-foreground">
                  {tasks.length === 0 && column.value === "todo" ? "上の欄に入力して Enter で追加できます" : "ここへドラッグ"}
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// 一覧。期限・優先度・状態・追加で並べ替える（同じものをもう一度押すと逆順）。チェックで完了・未着手を切り替える
function TaskList({
  tasks,
  hideDone,
  onHideDoneChange,
  sort,
  onSortChange,
  onOpen,
  onStatus,
  onRemoveDone,
}: {
  tasks: TaskItem[];
  hideDone: boolean;
  onHideDoneChange: (value: boolean) => void;
  sort: ListSort;
  onSortChange: (sort: ListSort) => void;
  onOpen: (task: TaskItem) => void;
  onStatus: (task: TaskItem, status: TaskStatus) => void;
  onRemoveDone: () => void;
}) {
  const shown = tasks.filter((task) => !hideDone || task.status !== "done").sort(compareForList(sort));
  const current = LIST_SORTS.find((item) => item.value === sort.key) ?? LIST_SORTS[0];
  const SortArrow = sort.desc ? ArrowUp : ArrowDown;
  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <div role="radiogroup" aria-label="並べ方" className="flex items-center gap-1">
          <span>並び</span>
          {LIST_SORTS.map((item) => {
            const active = item.value === sort.key;
            const label = active ? (sort.desc ? item.desc : item.asc) : item.asc;
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={active}
                title={active ? `${label}（押すと逆順）` : label}
                onClick={() => onSortChange(active ? { key: item.value, desc: !sort.desc } : { key: item.value, desc: false })}
                className={twMerge(
                  "flex items-center gap-0.5 rounded-md border px-2 py-1",
                  active ? "border-border bg-accent font-medium text-foreground" : "border-transparent hover:text-foreground",
                )}
              >
                {item.label}
                {active && <SortArrow size={12} />}
              </button>
            );
          })}
          <span className="ml-1 mr-3">{sort.desc ? current.desc : current.asc}</span>
        </div>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={hideDone} onChange={(e) => onHideDoneChange(e.target.checked)} className="accent-brand" />
          完了を隠す
        </label>
        <span className="flex-1" />
        <button type="button" onClick={onRemoveDone} className="flex items-center gap-1 hover:text-foreground">
          <Trash2 size={12} />
          完了をまとめて削除
        </button>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={ListTodo} title="タスクはありません" description="上の欄に入力して Enter で追加できます" />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {shown.map((task) => {
            const status = STATUSES.find((item) => item.value === task.status);
            return (
              <li key={task.taskId} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/50">
                <input
                  type="checkbox"
                  aria-label={task.status === "done" ? "未着手に戻す" : "完了にする"}
                  title={task.status === "done" ? "未着手に戻す" : "完了にする"}
                  checked={task.status === "done"}
                  onChange={() => onStatus(task, task.status === "done" ? "todo" : "done")}
                  className="size-4 shrink-0 cursor-pointer accent-brand"
                />
                <button type="button" onClick={() => onOpen(task)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <PriorityBadge value={task.priority} />
                  <span className={twMerge("min-w-0 flex-1 truncate text-sm", task.status === "done" && "text-muted-foreground line-through")}>
                    {task.title}
                  </span>
                  {findAriLinks(task.description).length > 0 && (
                    <Link2 size={13} className="shrink-0 text-brand" aria-label="リンクあり" />
                  )}
                  <DueLabel task={task} />
                  <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">{status?.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
