import { useEffect, useRef } from "react";

import { isShortcut, isTyping, type Shortcut } from "./shortcut";

type Binding = {
  shortcut: Shortcut;
  handler: () => void;
  // 入力欄・エディタで打っている最中も効かせる（Ctrl+S など）
  whileTyping?: boolean;
  // false のときは効かせない（ダイアログを開いている間など）
  enabled?: boolean;
};

// 画面ごとのショートカット。handler は毎回最新のものを使う
export function usePageShortcuts(bindings: Binding[]) {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const binding of bindingsRef.current) {
        if (binding.enabled === false || !isShortcut(e, binding.shortcut)) {
          continue;
        }
        if (!binding.whileTyping && isTyping(e)) {
          continue;
        }
        e.preventDefault();
        binding.handler();
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
