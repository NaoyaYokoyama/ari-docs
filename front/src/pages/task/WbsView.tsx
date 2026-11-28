import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { isHoliday } from "@/lib/holiday";
import { parseTaskText, priorityOf, today } from "@/pages/task/taskView";
import type { Task, TaskInput, TaskStatus } from "@/types/task";

// WBS の深さの上限（サーバーの WBS_DEPTH_MAX と同じ）
export const WBS_DEPTH_MAX = 5;
// ガントチャートの 1 日の幅（px）
const DAY_WIDTH = 24;
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 44;
// 左の表の幅（番号・タイトル・開始・期限・進み）
const LEFT_WIDTH = 560;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const MS_DAY = 86_400_000;

type Props = {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onStatus: (task: Task, status: TaskStatus) => void;
  // parentId（空なら一番上）の子の index 番目へ
  onMove: (taskId: string, parentId: string, index: number) => Promise<void>;
  onAdd: (input: TaskInput) => Promise<Task | null>;
};

type Row = {
  task: Task;
  depth: number;
  number: string;
  children: Task[];
  // 子孫を含めた日付の範囲（YYYY-MM-DD。無ければ空）
  from: string;
  to: string;
  // 子孫の末端のうち完了した割合（0〜100）
  progress: number;
};

function toDate(text: string) {
  const [y, m, d] = text.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toText(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shortDate(text: string) {
  if (!text) {
    return "";
  }
  // MM/DD（1〜9 月・日でも幅が変わらないように 2 けた）
  const [, m, d] = text.split("-");
  return `${m}/${d}`;
}

function byWbsOrder(a: Task, b: Task) {
  return a.wbsOrder - b.wbsOrder || a.createdAt.localeCompare(b.createdAt);
}

// 親ごとの子（WBS の並び）。親が見つからないものは一番上に出す
export function childrenMap(tasks: Task[]) {
  const ids = new Set(tasks.map((task) => task.taskId));
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    const parent = task.parentId && ids.has(task.parentId) ? task.parentId : "";
    map.set(parent, [...(map.get(parent) ?? []), task]);
  }
  for (const list of map.values()) {
    list.sort(byWbsOrder);
  }
  return map;
}

// 木を上から順に並べる（閉じた親の子は出さない）。番号は 1・1.1・1.2 のように振る
function buildRows(tasks: Task[], collapsed: Set<string>) {
  const map = childrenMap(tasks);
  const rows: Row[] = [];
  const summary = new Map<string, { from: string; to: string; done: number; leaves: number }>();

  const measure = (task: Task): { from: string; to: string; done: number; leaves: number } => {
    const children = map.get(task.taskId) ?? [];
    const own = [task.startDate, task.dueDate].filter(Boolean);
    let from = own.length ? own.reduce((a, b) => (a < b ? a : b)) : "";
    let to = own.length ? own.reduce((a, b) => (a > b ? a : b)) : "";
    let done = children.length === 0 && task.status === "done" ? 1 : 0;
    let leaves = children.length === 0 ? 1 : 0;
    for (const child of children) {
      const result = measure(child);
      if (result.from && (!from || result.from < from)) {
        from = result.from;
      }
      if (result.to && (!to || result.to > to)) {
        to = result.to;
      }
      done += result.done;
      leaves += result.leaves;
    }
    const result = { from, to, done, leaves };
    summary.set(task.taskId, result);
    return result;
  };
  for (const task of map.get("") ?? []) {
    measure(task);
  }

  const walk = (parent: string, depth: number, prefix: string) => {
    (map.get(parent) ?? []).forEach((task, index) => {
      const number = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      const info = summary.get(task.taskId) ?? { from: "", to: "", done: 0, leaves: 1 };
      const children = map.get(task.taskId) ?? [];
      rows.push({
        task,
        depth,
        number,
        children,
        from: info.from,
        to: info.to,
        progress: Math.round((info.done / Math.max(info.leaves, 1)) * 100),
      });
      if (!collapsed.has(task.taskId)) {
        walk(task.taskId, depth + 1, number);
      }
    });
  };
  walk("", 1, "");
  return { rows, map };
}

// 表示する日の範囲。タスクの日付と今日を含め、前に 3 日・後ろに 14 日足す（6 週は出す。2 年まで）
function timeline(tasks: Task[]) {
  const dates = tasks.flatMap((task) => [task.startDate, task.dueDate]).filter(Boolean);
  const now = today();
  const min = [now, ...dates].reduce((a, b) => (a < b ? a : b));
  const max = [now, ...dates].reduce((a, b) => (a > b ? a : b));
  const start = toDate(min);
  start.setDate(start.getDate() - 3);
  let count = Math.round((toDate(max).getTime() - start.getTime()) / MS_DAY) + 15;
  count = Math.min(Math.max(count, 42), 731);
  const days = Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  return { start, days };
}

// WBS（FN0602-BR14）。番号付きの木と、日ごとのガントチャート。キーボードで組める
export default function WbsView({ tasks, onOpen, onStatus, onMove, onAdd }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // 子を足している親（"" は一番上）
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const focusAfter = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const { rows, map } = useMemo(() => buildRows(tasks, collapsed), [tasks, collapsed]);
  const { start, days } = useMemo(() => timeline(tasks), [tasks]);
  const todayText = today();
  const dayIndex = (text: string) => Math.round((toDate(text).getTime() - start.getTime()) / MS_DAY);

  // 動かしたあとも同じタスクにフォーカスを残す
  useEffect(() => {
    if (focusAfter.current) {
      rootRef.current?.querySelector<HTMLElement>(`[data-wbs-row="${focusAfter.current}"]`)?.focus();
      focusAfter.current = null;
    }
  }, [rows]);

  const focusRow = (taskId: string) =>
    rootRef.current?.querySelector<HTMLElement>(`[data-wbs-row="${taskId}"]`)?.focus();

  const siblingsOf = (task: Task) => {
    const parent = task.parentId && tasks.some((item) => item.taskId === task.parentId) ? task.parentId : "";
    return { parent, siblings: map.get(parent) ?? [] };
  };

  const depthOf = (taskId: string) => rows.find((row) => row.task.taskId === taskId)?.depth ?? 1;
  const heightOf = (taskId: string): number =>
    1 + Math.max(0, ...(map.get(taskId) ?? []).map((child) => heightOf(child.taskId)));

  const move = (task: Task, parentId: string, index: number) => {
    focusAfter.current = task.taskId;
    void onMove(task.taskId, parentId, index);
  };

  const toggle = (taskId: string, open?: boolean) =>
    setCollapsed((current) => {
      const next = new Set(current);
      const isOpen = !next.has(taskId);
      if (open ?? !isOpen) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });

  const handleKey = (event: React.KeyboardEvent, row: Row, position: number) => {
    const { task } = row;
    const { parent, siblings } = siblingsOf(task);
    const index = siblings.findIndex((item) => item.taskId === task.taskId);
    const key = event.key;
    let handled = true;
    if (key === "ArrowDown" && event.altKey) {
      if (index < siblings.length - 1) {
        move(task, parent, index + 1);
      }
    } else if (key === "ArrowUp" && event.altKey) {
      if (index > 0) {
        move(task, parent, index - 1);
      }
    } else if (key === "ArrowDown" || key === "j") {
      const next = rows[position + 1];
      if (next) {
        focusRow(next.task.taskId);
      }
    } else if (key === "ArrowUp" || key === "k") {
      const previous = rows[position - 1];
      if (previous) {
        focusRow(previous.task.taskId);
      }
    } else if (key === "Tab" && !event.shiftKey) {
      // 1 段下げる: すぐ上の兄弟の子の一番下へ
      const above = siblings[index - 1];
      if (above && depthOf(above.taskId) + heightOf(task.taskId) <= WBS_DEPTH_MAX) {
        toggle(above.taskId, true);
        move(task, above.taskId, (map.get(above.taskId) ?? []).length);
      }
    } else if (key === "Tab" && event.shiftKey) {
      // 1 段上げる: 親のすぐ下へ
      if (parent) {
        const parentTask = tasks.find((item) => item.taskId === parent)!;
        const grand = siblingsOf(parentTask);
        move(task, grand.parent, grand.siblings.findIndex((item) => item.taskId === parent) + 1);
      }
    } else if (key === "ArrowRight" || key === "l") {
      toggle(task.taskId, true);
    } else if (key === "ArrowLeft" || key === "h") {
      if (row.children.length > 0 && !collapsed.has(task.taskId)) {
        toggle(task.taskId, false);
      } else if (parent) {
        focusRow(parent);
      }
    } else if (key === "Enter" && (event.ctrlKey || event.metaKey)) {
      toggle(task.taskId, true);
      setAddingUnder(task.taskId);
    } else if (key === "Enter") {
      onOpen(task);
    } else if (key === " " && row.children.length === 0) {
      onStatus(task, task.status === "done" ? "todo" : "done");
    } else {
      handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const submitChild = async () => {
    const parsed = parseTaskText(newTitle);
    if (!parsed.title.trim() || addingUnder === null) {
      return;
    }
    const created = await onAdd({
      title: parsed.title.trim(),
      dueDate: parsed.dueDate,
      priority: parsed.priority ?? "medium",
      parentId: addingUnder,
    });
    if (created) {
      setNewTitle("");
    }
  };

  const addRow = (parentId: string, depth: number) => (
    <div className="flex items-center border-b border-border bg-background" style={{ height: ROW_HEIGHT }}>
      <div
        className="sticky left-0 z-10 flex h-full items-center bg-background pr-2"
        style={{ width: LEFT_WIDTH, paddingLeft: 72 + (depth - 1) * 20 }}
      >
        <input
          autoFocus
          aria-label="子のタスクのタイトル"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submitChild();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setAddingUnder(null);
              setNewTitle("");
              if (parentId) {
                focusRow(parentId);
              }
            }
          }}
          onBlur={() => {
            if (!newTitle.trim()) {
              setAddingUnder(null);
            }
          }}
          placeholder="タイトル（例: 見積を作る 金曜 !高）。Enter で足す・Esc でやめる"
          className="h-7 w-full rounded border border-ring bg-background px-2 text-sm outline-none"
        />
      </div>
    </div>
  );

  if (tasks.length === 0) {
    return (
      <p className="p-10 text-center text-sm text-muted-foreground">
        上の欄でタスクを足してください。行を選んで Tab で 1 段下げると、その上のタスクの子になります
      </p>
    );
  }

  const width = LEFT_WIDTH + days.length * DAY_WIDTH;

  return (
    <div ref={rootRef} className="flex h-full flex-col">
      <p className="border-b border-border px-6 py-1.5 text-xs text-muted-foreground">
        行を選んで <Key>Tab</Key>・<Key>Shift+Tab</Key> で段を下げる・上げる、<Key>Alt+↑↓</Key> で並べ替え、
        <Key>Ctrl+Enter</Key> で子を足す、<Key>Enter</Key> で詳細、<Key>Space</Key> で完了。日付は詳細の開始日と期限です
      </p>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width, minHeight: "100%" }}>
          {/* 見出し（左の表とカレンダー） */}
          <div className="sticky top-0 z-30 flex border-b border-border bg-background" style={{ height: HEADER_HEIGHT }}>
            <div
              className="sticky left-0 z-10 flex items-end gap-2 border-r border-border bg-background px-3 pb-1.5 text-xs font-medium text-muted-foreground"
              style={{ width: LEFT_WIDTH }}
            >
              <span className="w-12 shrink-0">番号</span>
              <span className="min-w-0 flex-1">タイトル</span>
              <span className="w-12 shrink-0 text-right">開始</span>
              <span className="w-12 shrink-0 text-right">期限</span>
              <span className="w-12 shrink-0 text-right">進み</span>
            </div>
            {days.map((date, index) => {
              const text = toText(date);
              const off = date.getDay() === 0 || date.getDay() === 6 || isHoliday(date);
              const showMonth = index === 0 || date.getDate() === 1;
              return (
                <div
                  key={text}
                  className={twMerge(
                    "relative flex shrink-0 flex-col items-center justify-end pb-1 text-[0.6875rem] tabular-nums",
                    off ? "text-muted-foreground" : "text-foreground",
                    text === todayText && "font-bold text-brand",
                  )}
                  style={{ width: DAY_WIDTH }}
                  title={`${date.getMonth() + 1}/${date.getDate()}（${WEEKDAYS[date.getDay()]}）${isHoliday(date) ? " 祝日" : ""}`}
                >
                  {showMonth && (
                    <span className="absolute top-1 left-1 text-xs font-medium whitespace-nowrap text-foreground">
                      {date.getFullYear() !== new Date().getFullYear() && `${date.getFullYear()}/`}
                      {date.getMonth() + 1}月
                    </span>
                  )}
                  <span>{date.getDate()}</span>
                </div>
              );
            })}
          </div>

          {/* 土日・祝日と今日の線 */}
          <div className="pointer-events-none absolute inset-y-0" style={{ left: LEFT_WIDTH, top: HEADER_HEIGHT }}>
            {days.map((date, index) =>
              date.getDay() === 0 || date.getDay() === 6 || isHoliday(date) ? (
                <div
                  key={index}
                  className="absolute inset-y-0 bg-muted/70"
                  style={{ left: index * DAY_WIDTH, width: DAY_WIDTH }}
                />
              ) : null,
            )}
            <div
              className="absolute inset-y-0 w-0.5 bg-brand/60"
              style={{ left: dayIndex(todayText) * DAY_WIDTH + DAY_WIDTH / 2 }}
            />
          </div>

          {/* 行（上の欄で足したものは一番上の一番下に入る） */}
          {rows.map((row, position) => {
            const { task } = row;
            const isParent = row.children.length > 0;
            const done = task.status === "done";
            const overdue = !done && !!row.to && row.to < todayText && !isParent;
            const priority = priorityOf(task.priority);
            const barFrom = row.from || row.to;
            const barTo = row.to || row.from;
            const milestone = !isParent && !task.startDate && !!task.dueDate;
            return (
              <Fragment key={task.taskId}>
                <div
                  data-wbs-row={task.taskId}
                  tabIndex={0}
                  onKeyDown={(event) => handleKey(event, row, position)}
                  className="group relative flex items-center border-b border-border outline-none hover:bg-accent/50 focus-visible:bg-accent"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div
                    className="sticky left-0 z-10 flex h-full items-center gap-2 border-r border-border bg-background px-3 text-sm group-hover:bg-accent group-focus-visible:bg-accent"
                    style={{ width: LEFT_WIDTH }}
                  >
                    <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">{row.number}</span>
                    <span className="flex min-w-0 flex-1 items-center gap-1" style={{ paddingLeft: (row.depth - 1) * 20 }}>
                      {isParent ? (
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={collapsed.has(task.taskId) ? "開く" : "閉じる"}
                          onClick={() => toggle(task.taskId)}
                          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
                        >
                          {collapsed.has(task.taskId) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                      ) : (
                        <input
                          type="checkbox"
                          tabIndex={-1}
                          aria-label="完了"
                          checked={done}
                          onChange={() => onStatus(task, done ? "todo" : "done")}
                          className="mx-0.5 size-4 shrink-0 cursor-pointer accent-brand"
                        />
                      )}
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => onOpen(task)}
                        title={`${task.title}（押すと詳細）`}
                        className={twMerge(
                          "min-w-0 truncate text-left hover:underline",
                          isParent && "font-semibold",
                          done && "text-muted-foreground line-through",
                        )}
                      >
                        {task.title}
                      </button>
                      {task.priority === "high" && !done && (
                        <span className={twMerge("shrink-0 rounded px-1 text-[0.625rem]", priority.className)}>高</span>
                      )}
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label="子を足す"
                        title="子を足す（Ctrl+Enter）"
                        onClick={() => {
                          toggle(task.taskId, true);
                          setAddingUnder(task.taskId);
                        }}
                        className={twMerge(
                          "ml-auto hidden size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground",
                          row.depth < WBS_DEPTH_MAX && "group-hover:flex group-focus-visible:flex",
                        )}
                      >
                        <Plus size={14} />
                      </button>
                    </span>
                    <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {shortDate(isParent ? row.from : task.startDate)}
                    </span>
                    <span
                      className={twMerge(
                        "w-12 shrink-0 text-right text-xs tabular-nums",
                        overdue ? "font-medium text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {shortDate(isParent ? row.to : task.dueDate)}
                    </span>
                    <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {isParent ? `${row.progress}%` : done ? "済" : task.status === "doing" ? "進行中" : ""}
                    </span>
                  </div>

                  {/* ガントチャートの棒 */}
                  {barFrom &&
                    (milestone ? (
                      <div
                        className={twMerge(
                          "absolute z-0 size-3 rotate-45",
                          done ? "bg-muted-foreground/50" : overdue ? "bg-destructive" : "bg-brand",
                        )}
                        style={{ left: LEFT_WIDTH + dayIndex(barTo) * DAY_WIDTH + DAY_WIDTH / 2 - 6 }}
                        title={`${task.title}: 期限 ${shortDate(barTo)}`}
                      />
                    ) : (
                      <div
                        className={twMerge(
                          "absolute z-0 overflow-hidden rounded",
                          isParent ? "h-2 bg-foreground/25" : "h-4",
                          !isParent && (done ? "bg-muted-foreground/40" : overdue ? "bg-destructive/80" : "bg-brand/80"),
                        )}
                        style={{
                          left: LEFT_WIDTH + Math.min(dayIndex(barFrom), dayIndex(barTo)) * DAY_WIDTH + 2,
                          width: (Math.abs(dayIndex(barTo) - dayIndex(barFrom)) + 1) * DAY_WIDTH - 4,
                        }}
                        title={`${task.title}: ${shortDate(barFrom)}〜${shortDate(barTo)}${isParent ? `（${row.progress}%）` : ""}`}
                      >
                        {isParent && <div className="h-full bg-foreground/60" style={{ width: `${row.progress}%` }} />}
                      </div>
                    ))}
                </div>
                {addingUnder !== null &&
                  addingUnder !== "" &&
                  lastRowOfSubtree(rows, addingUnder) === task.taskId &&
                  addRow(addingUnder, depthOf(addingUnder) + 1)}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// その親の子孫のうち、表示している最後の行（子を足す欄をその下に出す）
function lastRowOfSubtree(rows: Row[], parentId: string) {
  const start = rows.findIndex((row) => row.task.taskId === parentId);
  if (start === -1) {
    return "";
  }
  const depth = rows[start].depth;
  let last = start;
  for (let index = start + 1; index < rows.length && rows[index].depth > depth; index += 1) {
    last = index;
  }
  return rows[last].task.taskId;
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-muted px-1 font-mono text-[0.6875rem]">{children}</kbd>;
}
