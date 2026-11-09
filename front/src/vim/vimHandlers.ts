import { useEffect, useRef } from "react";

import type { VimActionId } from "@/vim/actions";

// 画面ごとの Vim の操作（FN0702）。例: Folder では j で一覧の次の行へ動く。
// 登録が無い操作は VimLayer の既定の動き（スクロールなど）になる。後から登録したものを優先する。
// false を返すと「今は使わない」として、次の登録・既定の動きに回す（一覧にフォーカスがないときなど）
export type VimHandlers = Partial<Record<VimActionId, (count: number) => boolean | void>>;

type Entry = { handlers: { current: VimHandlers }; enabled: { current: boolean } };

const entries: Entry[] = [];

// 登録した操作を動かす。動かしたら true
export function runVimHandler(id: VimActionId, count: number) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    const handler = entry.enabled.current ? entry.handlers.current[id] : undefined;
    if (handler && handler(count) !== false) {
      return true;
    }
  }
  return false;
}

// handlers は毎回最新のものを使う。enabled が false の間は使わない（ダイアログを開いている間など）
export function useVimHandlers(handlers: VimHandlers, enabled = true) {
  const handlersRef = useRef(handlers);
  const enabledRef = useRef(enabled);
  handlersRef.current = handlers;
  enabledRef.current = enabled;

  useEffect(() => {
    const entry: Entry = { handlers: handlersRef, enabled: enabledRef };
    entries.push(entry);
    return () => {
      entries.splice(entries.indexOf(entry), 1);
    };
  }, []);
}
