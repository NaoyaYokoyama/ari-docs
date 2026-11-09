import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { type CodeMirror, type CodeMirrorV, getCM, Vim, vim } from "@replit/codemirror-vim";
import { useEffect, useRef } from "react";

import type { MarkdownEditorHandle } from "@/pages/content/markdown/editorHandle";
import { QUICK_OPEN_EVENT } from "@/shortcut/shortcut";
import { PANE_ACTIONS } from "@/vim/actions";
import { parseBinding } from "@/vim/keys";
import type { VimSettings } from "@/vim/vimSettings";

// Note・Wiki の本文を Vim で編集するエディタ（FN0702-BR07）。Vim モードで「本文も Vim で編集する」のときに使う
type Props = {
  value: string;
  onChange: (value: string) => void;
  // :w
  onSave: () => void;
  // :q（本文から一覧へ移る）
  onQuit: () => void;
  colorMode: "light" | "dark";
  settings: Pick<VimSettings, "keys" | "insertEscape" | "vimrc">;
  // 作ったらすぐ挿入モードにする（プレビューで i を押したとき）
  autoInsert?: boolean;
  onAutoInsert?: () => void;
  // 書式のボタン・Ctrl+B など・画像の貼り付けで本文を書き換えるための窓口（FN0404）
  onHandle?: (handle: MarkdownEditorHandle | null) => void;
};

type Handlers = { current: Pick<Props, "onSave" | "onQuit"> };

// :w などはすべてのエディタで共通に登録するため、どのエディタの操作かをここで引く
const editors = new WeakMap<EditorView, Handlers>();
let exDefined = false;

// getCM の CodeMirror と、Vim の関数が受け取る CodeMirrorV は同じもの（型の定義が分かれているだけ）
function asVim(cm: CodeMirror) {
  return cm as unknown as CodeMirrorV;
}

function handlersOf(cm: CodeMirrorV) {
  return editors.get(cm.cm6 as EditorView)?.current;
}

function defineEx() {
  if (exDefined) {
    return;
  }
  exDefined = true;
  Vim.defineEx("write", "w", (cm) => handlersOf(cm)?.onSave());
  Vim.defineEx("quit", "q", (cm) => handlersOf(cm)?.onQuit());
  const saveAndQuit = (cm: CodeMirrorV) => {
    const handlers = handlersOf(cm);
    handlers?.onSave();
    handlers?.onQuit();
  };
  Vim.defineEx("wq", "wq", saveAndQuit);
  Vim.defineEx("xit", "x", saveAndQuit);
  // :e 議事録 で、探して開く（FN0003）に「議事録」を入れて開く（Vim の :edit と同じ感覚でほかの Note・ファイルへ）
  Vim.defineEx("edit", "e", (_cm, params) => {
    window.dispatchEvent(new CustomEvent(QUICK_OPEN_EVENT, { detail: params.argString.trim() }));
  });
  // 領域の移動（<C-h> など）。画面全体の Vim モード（VimLayer）に任せる
  Vim.defineAction("ariPane", (_cm, args) => {
    window.dispatchEvent(new CustomEvent("vim-pane", { detail: (args as unknown as { id: string }).id }));
  });
}

// 挿入モードを抜けるキーと vimrc を当てる。割り当ては全部のエディタで共通なので、毎回消してから当て直す
function applyVimrc(cm: CodeMirror, settings: Props["settings"]) {
  Vim.mapclear();
  // ノーマルモードでも領域の移動のキーを使えるように（vimrc の行で上書きできるよう先に当てる）
  for (const id of PANE_ACTIONS) {
    for (const tokens of parseBinding(settings.keys[id]).sequences) {
      Vim.mapCommand(tokens.join(""), "action", "ariPane", { id }, { context: "normal" });
    }
  }
  if (settings.insertEscape) {
    Vim.handleEx(asVim(cm), `inoremap ${settings.insertEscape} <Esc>`);
  }
  for (const line of settings.vimrc.split("\n")) {
    const command = line.trim().replace(/^:/, "");
    if (!command || command.startsWith('"')) {
      continue;
    }
    try {
      Vim.handleEx(asVim(cm), command);
    } catch (error) {
      console.warn("vimrc の行を読めませんでした", command, error);
    }
  }
}

const MONO = 'ui-monospace, SFMono-Regular, "Cascadia Code", Menlo, Consolas, "Noto Sans Mono CJK JP", monospace';

// 色は画面の変数を使い、配色（ライト・ダーク）に合わせる
const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: "700", fontSize: "1.35em" },
  { tag: tags.heading2, fontWeight: "700", fontSize: "1.2em" },
  { tag: tags.heading3, fontWeight: "700", fontSize: "1.1em" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--brand)" },
  { tag: tags.monospace, fontFamily: MONO, color: "var(--destructive)" },
  { tag: tags.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.meta], color: "var(--muted-foreground)" },
]);

function theme(dark: boolean) {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: "1rem",
        color: "var(--foreground)",
        backgroundColor: "var(--background)",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": { fontFamily: MONO, lineHeight: "1.6" },
      ".cm-content": { padding: "1rem 0", caretColor: "var(--foreground)" },
      ".cm-line": { padding: "0 1.25rem" },
      ".cm-activeLine": { backgroundColor: "color-mix(in oklch, var(--accent) 70%, transparent)" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: "color-mix(in oklch, var(--brand) 30%, transparent) !important",
      },
      // ノーマルモードの太いカーソル
      ".cm-fat-cursor": {
        background: "var(--brand) !important",
        color: "var(--brand-foreground) !important",
      },
      "&:not(.cm-focused) .cm-fat-cursor": {
        background: "transparent !important",
        outline: "1px solid var(--brand)",
        color: "inherit !important",
      },
      // 下の帯（-- INSERT -- と : のコマンド）
      ".cm-panels": {
        backgroundColor: "var(--muted)",
        color: "var(--foreground)",
      },
      ".cm-panels-bottom": { borderTop: "1px solid var(--border)" },
      ".cm-vim-panel": { fontFamily: MONO, padding: "0.125rem 0.75rem", minHeight: "1.5rem" },
      ".cm-vim-panel input": { color: "var(--foreground)", fontFamily: MONO },
    },
    { dark },
  );
}

export default function VimEditor({
  value,
  onChange,
  onSave,
  onQuit,
  colorMode,
  settings,
  autoInsert,
  onAutoInsert,
  onHandle,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeRef = useRef(new Compartment());
  const handlers = useRef({ onSave, onQuit });
  handlers.current = { onSave, onQuit };
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  // 作るのは 1 回だけ（Note・Wiki を切り替えたときは key で作り直す。元に戻すの履歴を混ぜないため）
  useEffect(() => {
    defineEx();
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          // vim はほかのキーの割り当てより先に置く（@replit/codemirror-vim の決まり）
          vim({ status: true }),
          history(),
          drawSelection(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          themeRef.current.of(theme(colorMode === "dark")),
          EditorView.contentAttributes.of({ "aria-label": "本文（Vim）" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              changeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    editors.set(view, handlers);
    onHandle?.({
      read: () => {
        const { from, to } = view.state.selection.main;
        return { text: view.state.doc.toString(), from, to };
      },
      apply: (change) => {
        view.dispatch({
          changes: { from: change.from, to: change.to, insert: change.insert },
          selection: { anchor: change.selectFrom, head: change.selectTo },
          scrollIntoView: true,
          userEvent: "input",
        });
        view.focus();
      },
      // ノーマルモードの <C-b>（1 ページ上へ）などと重ならないよう、挿入モードのときだけ
      acceptsShortcuts: () => {
        const cm = getCM(view);
        return !!(cm?.state.vim as { insertMode?: boolean } | undefined)?.insertMode;
      },
    });
    const cm = getCM(view);
    if (cm) {
      applyVimrc(cm, settings);
      if (autoInsert) {
        view.focus();
        Vim.handleKey(asVim(cm), "i", "user");
        onAutoInsert?.();
      }
    }
    return () => {
      viewRef.current = null;
      onHandle?.(null);
      view.destroy();
    };
  }, []);

  // 外から本文が変わったとき（変更履歴の版を読み込んだときなど）。元に戻すで戻せる
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeRef.current.reconfigure(theme(colorMode === "dark")) });
  }, [colorMode]);

  useEffect(() => {
    const cm = viewRef.current && getCM(viewRef.current);
    if (cm) {
      applyVimrc(cm, settings);
    }
  }, [settings.keys, settings.insertEscape, settings.vimrc]);

  // 画面全体の Vim モードの i（書き始める）で、本文に移って挿入モードにする
  useEffect(() => {
    const host = hostRef.current?.closest<HTMLElement>("[data-vim-insert]");
    const handleInsert = (event: Event) => {
      const view = viewRef.current;
      const cm = view && getCM(view);
      if (!view || !cm) {
        return;
      }
      event.preventDefault();
      view.focus();
      Vim.handleKey(asVim(cm), "i", "user");
    };
    host?.addEventListener("vim-insert", handleInsert);
    return () => host?.removeEventListener("vim-insert", handleInsert);
  }, []);

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" />;
}
