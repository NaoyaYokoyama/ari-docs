import {
  Bold,
  Code,
  Heading,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  type LucideIcon,
  Minus,
  SquareCode,
  Strikethrough,
  Table,
  TableProperties,
  TextQuote,
} from "lucide-react";
import { useRef } from "react";

import Hint, { useHintsEnabled } from "@/components/common/Hint";
import type { MarkdownCommandId } from "@/pages/content/markdown/commands";
import { SHORTCUT, type Shortcut, shortcutLabel } from "@/shortcut/shortcut";

// Note・Wiki の本文の書式のボタン（FN0404-BR01）。普通の本文と Vim のエディタで同じものを出す

// hint: 一言の説明（設定の「ボタンの説明を出す」。FN0404-BR01）
type Item = { id: MarkdownCommandId; label: string; hint: string; icon: LucideIcon; shortcut?: Shortcut };

const GROUPS: Item[][] = [
  [
    { id: "heading", label: "見出し", hint: "行を見出しにします（# ）。押すたびに 大 → 中 → 小 → なし", icon: Heading },
    { id: "bold", label: "太字", hint: "選んだ文字を太くします（**文字**）。もう一度押すと戻ります", icon: Bold, shortcut: SHORTCUT.MD_BOLD },
    { id: "italic", label: "斜体", hint: "選んだ文字を斜めにします（*文字*）", icon: Italic, shortcut: SHORTCUT.MD_ITALIC },
    { id: "strike", label: "取り消し線", hint: "選んだ文字に線を引きます（~~文字~~）。終わった項目などに", icon: Strikethrough, shortcut: SHORTCUT.MD_STRIKE },
  ],
  [
    { id: "link", label: "リンク", hint: "選んだ文字を URL へのリンクにします（[文字](URL)）。URL の所を書き換えてください", icon: Link, shortcut: SHORTCUT.MD_LINK },
    { id: "code", label: "コード", hint: "選んだ文字をコード・ファイル名などの書式にします（`文字`）", icon: Code, shortcut: SHORTCUT.MD_CODE },
    { id: "codeBlock", label: "コードブロック", hint: "選んだ行を、書いたとおりに表示するかたまりにします（```）。プログラム・ログなどに", icon: SquareCode },
    { id: "quote", label: "引用", hint: "選んだ行を引用にします（> ）。メールや資料から写した文に", icon: TextQuote },
    { id: "hr", label: "区切り線", hint: "横線を入れて、話の区切りを示します（---）", icon: Minus },
  ],
  [
    { id: "bulletList", label: "箇条書き", hint: "選んだ行の頭に「・」を付けます（- ）", icon: List },
    { id: "orderedList", label: "番号付きの箇条書き", hint: "選んだ行に 1. 2. 3. と番号を付けます。手順などに", icon: ListOrdered },
    { id: "taskList", label: "チェックリスト", hint: "選んだ行をやることの一覧にします（- [ ] ）。済んだら [x] に", icon: ListTodo },
  ],
  [
    { id: "table", label: "表を入れる", hint: "3 列の表のひな形を入れます。| で列を区切ります", icon: Table },
    { id: "formatTable", label: "表を整える", hint: "カーソルのある表の | の位置をそろえて、書いている所でも表に見えるようにします", icon: TableProperties, shortcut: SHORTCUT.MD_FORMAT_TABLE },
  ],
];

const BUTTON =
  "flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

type Props = {
  onCommand: (id: MarkdownCommandId) => void;
  onImages: (files: File[]) => void;
};

export default function MarkdownToolbar({ onCommand, onImages }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const hints = useHintsEnabled();
  return (
    <div
      role="toolbar"
      aria-label="書式"
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border px-3 py-1"
      // ボタンを押しても本文の選択を外さない
      onMouseDown={(event) => event.preventDefault()}
    >
      {GROUPS.map((group, index) => (
        <div key={index} className="flex items-center gap-0.5">
          {index > 0 && <span className="mx-1 h-4 w-px bg-border" aria-hidden />}
          {group.map((item) => {
            const title = item.shortcut ? `${item.label}（${shortcutLabel(item.shortcut)}）` : item.label;
            return (
              <Hint key={item.id} title={title} text={item.hint}>
                <button
                  type="button"
                  title={hints ? undefined : title}
                  aria-label={title}
                  onClick={() => onCommand(item.id)}
                  className={BUTTON}
                >
                  <item.icon size={16} />
                </button>
              </Hint>
            );
          })}
          {index === 1 && (
            <Hint title="画像" text="画像を選んで入れます。貼り付け（Ctrl+V）・ドロップでも入れられます。小さくしてから保存します">
              <button
                type="button"
                title={hints ? undefined : "画像（貼り付け・ドロップでも入れられます。縮小して保存します）"}
                aria-label="画像"
                onClick={() => fileRef.current?.click()}
                className={BUTTON}
              >
                <ImagePlus size={16} />
              </button>
            </Hint>
          )}
        </div>
      ))}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) {
            onImages(files);
          }
        }}
      />
    </div>
  );
}
