import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { useApp } from "@/app/AppContext";
import { useGuardedNavigate } from "@/app/useGuardedNavigate";
import { isTyping, QUICK_OPEN_EVENT } from "@/shortcut/shortcut";
import { useNavigation } from "@/shortcut/useNavigation";
import { PANE_ACTIONS, VIM_ACTIONS, type VimActionId } from "@/vim/actions";
import { activateHint, collectHints, type HintTarget } from "@/vim/hints";
import { displayToken, eventToken, parseBinding } from "@/vim/keys";
import { focusPane, moveInPane } from "@/vim/panes";
import { rememberClick, scrollHalfPage, scrollStep, scrollToEdge } from "@/vim/scroll";
import { runVimHandler } from "@/vim/vimHandlers";
import { useVimSettings, type VimSettings } from "@/vim/vimSettings";

// Vim モード（FN0702）。入力欄の外で押したキーを、設定のキー割り当てに合わせて操作にする（Vimium と同じ考え方）
export default function VimLayer() {
  const settings = useVimSettings();
  return settings.enabled ? <ActiveVimLayer settings={settings} /> : null;
}

type Binding = { tokens: string[]; id: VimActionId };

// 押したキーの並びが、割り当ての先頭と同じか
function startsWith(tokens: string[], prefix: string[]) {
  return prefix.every((token, index) => tokens[index] === token);
}

// 画面・領域の移動はダイアログを開いている間は効かせない
const PAGE_ACTIONS = new Set<VimActionId>([
  ...VIM_ACTIONS.filter((action) => action.group === "画面").map((action) => action.id),
  ...PANE_ACTIONS,
]);

const GO_PATHS: Partial<Record<VimActionId, string>> = {
  goHome: "/",
  goFolder: "/folder",
  goNote: "/note",
  goWiki: "/wiki",
  goDocs: "/docs",
  goSetting: "/setting",
};

function visible(element: Element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// 入力欄に移る。selector に合うものが無ければ、画面の最初の入力欄
function focusInput(selector: string) {
  const marked = [...document.querySelectorAll<HTMLElement>(selector)].find(visible);
  const input =
    marked ??
    [
      ...document.querySelectorAll<HTMLElement>(
        "main input:not([type=checkbox]):not([type=radio]):not([type=button]):not([disabled]), main textarea:not([disabled]), input[type=search]",
      ),
    ].find(visible);
  if (!input) {
    return false;
  }
  input.focus();
  if (input instanceof HTMLInputElement) {
    input.select();
  }
  return true;
}

function ActiveVimLayer({ settings }: { settings: VimSettings }) {
  const navigate = useGuardedNavigate();
  const location = useLocation();
  const { isDirty, setIsDirty, showConfirm, showMessage } = useApp();
  // 押しかけのキー（g など）と回数（5j の 5）。画面の右下に出す
  const [pending, setPending] = useState("");
  const [hints, setHints] = useState<{ targets: HintTarget[]; open: boolean; typed: string } | null>(null);
  const state = useRef({ buffer: [] as string[], count: "", timer: 0, repeat: false });

  const bindings = useMemo<Binding[]>(
    () =>
      VIM_ACTIONS.flatMap((action) =>
        parseBinding(settings.keys[action.id]).sequences.map((tokens) => ({ tokens, id: action.id })),
      ),
    [settings.keys],
  );

  // 最新の値を、登録したままのキーの処理から使う
  const navigation = useNavigation();
  const latest = useRef({ settings, bindings, navigate, location, isDirty, setIsDirty, showConfirm, showMessage, navigation });
  latest.current = { settings, bindings, navigate, location, isDirty, setIsDirty, showConfirm, showMessage, navigation };

  useEffect(() => {
    const reset = () => {
      const current = state.current;
      window.clearTimeout(current.timer);
      current.buffer = [];
      current.count = "";
      setPending("");
    };

    const showPending = () => {
      const current = state.current;
      setPending(current.count + current.buffer.map(displayToken).join(""));
    };

    // 未保存の変更があれば確かめてから、ブラウザの戻る・進む
    const go = async (delta: number) => {
      const { isDirty: dirty, setIsDirty: setDirty, showConfirm: confirm } = latest.current;
      if (dirty) {
        if (!(await confirm("未保存の変更があります。破棄して移動しますか？"))) {
          return;
        }
        setDirty(false);
      }
      window.history.go(delta);
    };

    const run = (id: VimActionId, count: number) => {
      const { settings: current, navigate: guardedNavigate, location: here, showMessage: message, navigation: pages } =
        latest.current;
      // 画面が登録した動き → サイドバーの行の移動 → 既定の動き（スクロールなど）の順
      if (runVimHandler(id, count) || moveInPane(id, count)) {
        return;
      }
      const repeat = state.current.repeat;
      const step = current.scrollStep;
      switch (id) {
        case "down":
          return scrollStep("y", step, count, repeat);
        case "up":
          return scrollStep("y", -step, count, repeat);
        case "left":
          return scrollStep("x", -step, count, repeat);
        case "right":
          return scrollStep("x", step, count, repeat);
        case "halfDown":
          return scrollHalfPage(1, count, repeat);
        case "halfUp":
          return scrollHalfPage(-1, count, repeat);
        case "top":
          return scrollToEdge("top");
        case "bottom":
          return scrollToEdge("bottom");
        case "paneLeft":
          focusPane("sidebar");
          return;
        case "paneRight":
          focusPane("main");
          return;
        case "hint":
        case "hintOpen": {
          const targets = collectHints(current.hintChars.toLowerCase());
          if (targets.length === 0) {
            message("info", "押せるところがありません");
            return;
          }
          setHints({ targets, open: id === "hintOpen", typed: "" });
          return;
        }
        case "search":
          if (!focusInput("[data-vim-filter]")) {
            message("info", "この画面には検索・絞り込みの欄がありません");
          }
          return;
        case "insert": {
          // 本文（data-vim-insert）があれば、そこに書き始める（Vim のエディタは自分で挿入モードにする）
          const editor = [...document.querySelectorAll<HTMLElement>("[data-vim-insert]")].find(visible);
          if (editor) {
            const event = new CustomEvent("vim-insert", { cancelable: true });
            if (editor.dispatchEvent(event)) {
              editor.querySelector<HTMLElement>("textarea, [contenteditable='true']")?.focus();
            }
            return;
          }
          if (!focusInput("[data-vim-filter]")) {
            message("info", "この画面には入力欄がありません");
          }
          return;
        }
        case "quickOpen":
          window.dispatchEvent(new CustomEvent(QUICK_OPEN_EVENT, { detail: "" }));
          return;
        case "back":
          return void go(-count);
        case "forward":
          return void go(count);
        case "nextPage":
        case "prevPage": {
          const paths = pages.map((item) => item.path);
          const index = paths.findIndex((path) =>
            path === "/" ? here.pathname === "/" : here.pathname.startsWith(path),
          );
          const delta = (id === "nextPage" ? 1 : -1) * count;
          const next = paths[(((index === -1 ? 0 : index) + delta) % paths.length + paths.length) % paths.length];
          return void guardedNavigate(next);
        }
        default: {
          const path = GO_PATHS[id];
          if (path === "/docs" && !pages.some((item) => item.path === path)) {
            message("info", "Docs は使わない設定です（設定の「サーバーの設定」で変えられます）");
            return;
          }
          if (path !== undefined) {
            // Alt+1 と違い、Home の検索欄にはフォーカスしない（j・k をそのまま使えるように。検索は /）
            void guardedNavigate(path);
          }
        }
      }
    };

    // 入力欄（本文の Vim のエディタは除く）で Esc を押したら入力欄から出て、Vim のキーを使えるようにする。
    // 画面の部品の Esc（絞り込みを消すなど）を先に動かすため、少し後で外す。ダイアログの中は Esc で閉じるので触らない
    const handleEscape = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.key === "Escape" &&
        !event.isComposing &&
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) &&
        !target.closest('[role="dialog"]')
      ) {
        window.setTimeout(() => {
          if (document.activeElement === target) {
            target.blur();
          }
        });
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      handleEscape(event);
      // 画面の部品（Note の一覧の j・k など）が先に使ったキーは使わない
      if (event.defaultPrevented) {
        return;
      }
      const token = eventToken(event);
      if (!token) {
        return;
      }
      const { bindings: list } = latest.current;
      const current = state.current;
      // 入力中は使わない。ただし Ctrl・Alt 付きの領域の移動（<C-h> など）は文字を打つキーと重ならないので、
      // 入力欄（タイトルなど）からも使えるようにする（本文の Vim のエディタは自分で受け持つ）
      if (isTyping(event)) {
        const pane = list.find(
          (binding) =>
            binding.tokens.length === 1 &&
            binding.tokens[0] === token &&
            /^<[CA]-/.test(token) &&
            (PANE_ACTIONS as readonly string[]).includes(binding.id),
        );
        const target = event.target;
        if (pane && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
          event.preventDefault();
          reset();
          run(pane.id, 1);
        }
        return;
      }
      const dialogOpen = document.querySelector('[role="dialog"]') !== null;
      const usable = dialogOpen ? list.filter((binding) => !PAGE_ACTIONS.has(binding.id)) : list;

      // 回数（5j の 5）。割り当てに使っている数字は回数にしない
      if (
        current.buffer.length === 0 &&
        /^[0-9]$/.test(token) &&
        !(token === "0" && current.count === "") &&
        !usable.some((binding) => binding.tokens[0] === token)
      ) {
        event.preventDefault();
        current.count = (current.count + token).slice(0, 4);
        showPending();
        return;
      }

      const buffer = [...current.buffer, token];
      const exact = usable.find(
        (binding) => binding.tokens.length === buffer.length && startsWith(binding.tokens, buffer),
      );
      const longer = usable.some(
        (binding) => binding.tokens.length > buffer.length && startsWith(binding.tokens, buffer),
      );
      if (!exact && !longer) {
        // 割り当てに無い並び。押しかけ（g など）があれば捨てて、このキーだけでもう一度見る
        const hadPending = current.buffer.length > 0 || current.count !== "";
        reset();
        if (hadPending) {
          handleKeyDown(event);
        }
        return;
      }

      event.preventDefault();
      const count = Math.max(1, Number(current.count) || 1);
      current.repeat = event.repeat;
      if (exact && !longer) {
        reset();
        run(exact.id, count);
        return;
      }
      // 続きがあるかもしれない（g のあとの g・t など）。Vim と同じく少し待ち、来なければ短い方を使う
      current.buffer = buffer;
      showPending();
      window.clearTimeout(current.timer);
      current.timer = window.setTimeout(
        () => {
          reset();
          if (exact) {
            run(exact.id, count);
          }
        },
        exact ? 1000 : 1500,
      );
    };

    // 本文の Vim のエディタ（ノーマルモード）で領域の移動のキーを押したとき（VimEditor が送る）
    const handlePane = (event: Event) => {
      const id = (event as CustomEvent<VimActionId>).detail;
      if ((PANE_ACTIONS as readonly string[]).includes(id)) {
        run(id, 1);
      }
    };

    // 領域の枠を出すため（global.css の html.vim-mode）
    document.documentElement.classList.add("vim-mode");
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", rememberClick, true);
    window.addEventListener("vim-pane", handlePane);
    return () => {
      reset();
      document.documentElement.classList.remove("vim-mode");
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", rememberClick, true);
      window.removeEventListener("vim-pane", handlePane);
    };
  }, []);

  // ヒントを出している間は、すべてのキーをヒントに使う（画面の部品より先に受け取る）
  useEffect(() => {
    if (!hints) {
      return;
    }
    const chars = settings.hintChars.toLowerCase();
    const close = () => setHints(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
        return;
      }
      if (event.key === "Backspace") {
        setHints({ ...hints, typed: hints.typed.slice(0, -1) });
        return;
      }
      const char = event.key.length === 1 ? event.key.toLowerCase() : "";
      if (!char || !chars.includes(char)) {
        close();
        return;
      }
      const typed = hints.typed + char;
      const matches = hints.targets.filter((target) => target.label.startsWith(typed));
      if (matches.length === 0) {
        close();
        return;
      }
      if (matches.length === 1 && matches[0].label === typed) {
        close();
        activateHint(matches[0].element, hints.open);
        return;
      }
      setHints({ ...hints, typed });
    };
    // 画面が動いたらヒントの位置がずれるのでやめる
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("mousedown", close, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", close);
    };
  }, [hints, settings.hintChars]);

  return (
    <>
      {hints && (
        <div className="pointer-events-none fixed inset-0 z-[1000]" aria-hidden>
          {hints.targets
            .filter((target) => target.label.startsWith(hints.typed))
            .map((target) => (
              <span
                key={target.label}
                style={{ left: target.x, top: target.y }}
                className="absolute rounded border border-brand-foreground/40 bg-brand px-1 py-px font-mono text-[0.6875rem] leading-tight font-bold text-brand-foreground shadow-md"
              >
                <span className="opacity-40">{hints.typed.toUpperCase()}</span>
                {target.label.slice(hints.typed.length).toUpperCase()}
              </span>
            ))}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md">
            {hints.open ? "開くところ" : "押すところ"}の文字を打ってください（Esc でやめる）
          </div>
        </div>
      )}
      {pending && (
        <div className="pointer-events-none fixed right-3 bottom-3 z-[1000] rounded-md border border-border bg-popover px-2 py-1 font-mono text-sm text-popover-foreground shadow-md">
          {pending}
        </div>
      )}
    </>
  );
}
