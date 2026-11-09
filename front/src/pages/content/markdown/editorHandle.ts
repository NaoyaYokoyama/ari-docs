// 書式の操作（commands.ts）を、本文のエディタに当てるための窓口。
// 普通の本文（textarea）と Vim のエディタ（CodeMirror。VimEditor.tsx が作る）で同じ操作を使う
import type { Change, Selection } from "@/pages/content/markdown/commands";

export type MarkdownEditorHandle = {
  read: () => Selection;
  apply: (change: Change) => void;
  // Ctrl+B などの書式のキーを受けるか（Vim のエディタはノーマルモードの <C-b> などと重なるので、挿入モードのときだけ）
  acceptsShortcuts: () => boolean;
};

// textarea。元に戻す（Ctrl+Z）で戻せるよう、ブラウザの入力（insertText）として書き換える
export function textareaHandle(textarea: HTMLTextAreaElement): MarkdownEditorHandle {
  return {
    read: () => ({ text: textarea.value, from: textarea.selectionStart, to: textarea.selectionEnd }),
    apply: (change) => {
      textarea.focus();
      textarea.setSelectionRange(change.from, change.to);
      const done =
        change.insert === ""
          ? change.from === change.to || document.execCommand("delete")
          : document.execCommand("insertText", false, change.insert);
      if (!done) {
        // insertText が使えないとき（元に戻すの履歴には残らない）
        const value = textarea.value.slice(0, change.from) + change.insert + textarea.value.slice(change.to);
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
      textarea.setSelectionRange(change.selectFrom, change.selectTo);
    },
    acceptsShortcuts: () => true,
  };
}
