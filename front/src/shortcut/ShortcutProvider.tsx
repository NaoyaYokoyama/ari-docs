import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useGuardedNavigate } from "@/app/useGuardedNavigate";
import QuickOpen from "@/quickOpen/QuickOpen";
import ShortcutHelp from "@/shortcut/ShortcutHelp";
import { VIM_ACTIONS } from "@/vim/actions";
import { eventToken, parseBinding } from "@/vim/keys";
import { getVimSettings } from "@/vim/vimSettings";

import { isShortcut, isTyping, QUICK_OPEN_EVENT, SHORTCUT } from "./shortcut";
import { useNavigation } from "./useNavigation";

export type FocusDirection =
  | "left"
  | "down"
  | "up"
  | "right";

type FocusHandler = (
  direction: FocusDirection,
) => void;

type ShortcutContextType = {
  setFocusHandler: (
    handler: FocusHandler | null,
  ) => void;
  openHelp: () => void;
  // 探して開く（FN0003）。query は最初に入れておく文字
  openQuickOpen: (query?: string) => void;
};

// Vim モードで同じキーを使っているか（Vim の割り当て・本文の vimrc を優先する）
function usedByVim(event: KeyboardEvent) {
  const settings = getVimSettings();
  const token = eventToken(event);
  if (!settings.enabled || !token) {
    return false;
  }
  if (
    VIM_ACTIONS.some((action) =>
      parseBinding(settings.keys[action.id]).sequences.some((tokens) => tokens[0] === token),
    )
  ) {
    return true;
  }
  const inEditor = event.target instanceof Element && event.target.closest(".cm-editor") !== null;
  return inEditor && settings.vimrc.toLowerCase().includes(token.toLowerCase());
}

export const ShortcutContext =
  createContext<ShortcutContextType | null>(
    null,
  );

const FOCUS: [typeof SHORTCUT.FOCUS_LEFT, FocusDirection][] = [
  [SHORTCUT.FOCUS_LEFT, "left"],
  [SHORTCUT.FOCUS_DOWN, "down"],
  [SHORTCUT.FOCUS_UP, "up"],
  [SHORTCUT.FOCUS_RIGHT, "right"],
];

export default function ShortcutProvider({
  children,
}: PropsWithChildren) {
  const navigate = useGuardedNavigate();
  const navigation = useNavigation();
  const [helpOpen, setHelpOpen] = useState(false);
  // 探して開くを開いているときは、最初に入れておく文字（閉じているときは null）
  const [quickOpen, setQuickOpen] = useState<string | null>(null);

  const focusHandlerRef =
    useRef<FocusHandler | null>(null);

  const setFocusHandler = useCallback(
    (handler: FocusHandler | null) => {
      focusHandlerRef.current = handler;
    },
    [],
  );

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const openQuickOpen = useCallback((query = "") => setQuickOpen(query), []);
  const closeQuickOpen = useCallback(() => setQuickOpen(null), []);

  // 探して開く: 入力欄・本文の中からも開けるよう、画面の部品より先に受け取る（Markdown エディタなどに渡さない）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isShortcut(e, SHORTCUT.QUICK_OPEN) || e.isComposing || usedByVim(e)) {
        return;
      }
      // ほかのダイアログ（確認など）を開いている間は開かない。開いている間は中の Ctrl+P（前へ）に使う
      if (document.querySelector('[role="dialog"]')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setQuickOpen("");
    };
    const handleRequest = (event: Event) => {
      if (!document.querySelector('[role="dialog"]')) {
        setQuickOpen(String((event as CustomEvent<string>).detail ?? ""));
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener(QUICK_OPEN_EVENT, handleRequest);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener(QUICK_OPEN_EVENT, handleRequest);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (
      e: KeyboardEvent,
    ) => {
      // 画面移動
      for (const item of navigation) {
        if (isShortcut(e, item.shortcut)) {
          e.preventDefault();
          void navigate(
            item.path,
            item.shortcut.focus
              ? { state: { focus: item.shortcut.focus } }
              : undefined,
          );
          return;
        }
      }

      if (isShortcut(e, SHORTCUT.HELP) && !isTyping(e)) {
        e.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }

      // フォーカス移動
      for (const [shortcut, direction] of FOCUS) {
        if (isShortcut(e, shortcut)) {
          e.preventDefault();
          focusHandlerRef.current?.(direction);
          return;
        }
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [navigate, navigation]);

  return (
    <ShortcutContext.Provider
      value={{
        setFocusHandler,
        openHelp,
        openQuickOpen,
      }}
    >
      {children}
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      {quickOpen !== null && (
        <QuickOpen initialQuery={quickOpen} onClose={closeQuickOpen} onHelp={openHelp} />
      )}
    </ShortcutContext.Provider>
  );
}
