import { Fragment } from "react";

import Dialog from "@/components/common/Dialog";
import Kbd from "@/components/common/Kbd";
import { VIM_ACTIONS } from "@/vim/actions";
import { displayToken, parseBinding } from "@/vim/keys";
import { useVimSettings,type VimSettings } from "@/vim/vimSettings";

import { type NavigationItem, SHORTCUT, shortcutKeys } from "./shortcut";
import { useNavigation } from "./useNavigation";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Row = { keys: string[]; description: string };

// 画面移動の Alt+数字は Docs を使う設定かで変わる
const baseGroups = (navigation: NavigationItem[]): { title: string; rows: Row[] }[] => [
  {
    title: "共通",
    rows: [
      ...navigation.map(({ shortcut }) => ({
        keys: shortcutKeys(shortcut),
        description: shortcut.description,
      })),
      { keys: shortcutKeys(SHORTCUT.QUICK_OPEN), description: SHORTCUT.QUICK_OPEN.description },
      { keys: ["?"], description: SHORTCUT.HELP.description },
    ],
  },
  {
    title: "Note・Wiki",
    rows: [
      { keys: shortcutKeys(SHORTCUT.CREATE), description: "新規作成" },
      { keys: shortcutKeys(SHORTCUT.SAVE), description: "保存" },
      { keys: ["F2"], description: "タイトルを編集" },
      { keys: ["Delete"], description: "削除（入力中以外）" },
      { keys: ["J / K"], description: "一覧で上下に移動（一覧にフォーカス中）" },
      { keys: ["Enter"], description: "一覧で選んだものを開く" },
      { keys: ["Alt", "H/J/K/L"], description: "一覧・タイトル・本文の間を移動" },
    ],
  },
  {
    title: "Folder",
    rows: [
      { keys: shortcutKeys(SHORTCUT.CREATE), description: "新しいフォルダ" },
      { keys: ["Enter"], description: "開く" },
      { keys: ["Space"], description: "プレビュー（ファイル）" },
      { keys: ["↑ / ↓"], description: "選ぶ（Shift で範囲を広げる）" },
      { keys: ["Ctrl", "A"], description: "すべて選択" },
      { keys: ["Ctrl", "C"], description: "コピー" },
      { keys: ["Ctrl", "X"], description: "切り取り" },
      { keys: ["Ctrl", "V"], description: "貼り付け" },
      { keys: ["F2"], description: "名前の変更" },
      { keys: ["Delete"], description: "削除" },
      { keys: ["Ctrl", "F"], description: "このフォルダ内を絞り込む" },
      { keys: ["Backspace"], description: "一つ上のフォルダへ（Alt+↑ も可）" },
      { keys: ["Esc"], description: "選択を外す" },
    ],
  },
  ...(navigation.some((item) => item.page === "docs")
    ? [{ title: "Docs", rows: [{ keys: ["/"], description: "ファイル名・ID で検索" }] }]
    : []),
];

// Vim モードのキー（設定で変えたものを出す。FN0702）
function vimGroups(vim: VimSettings): { title: string; rows: Row[] }[] {
  const rows = VIM_ACTIONS.flatMap((action) => {
    const sequences = parseBinding(vim.keys[action.id]).sequences;
    if (sequences.length === 0) {
      return [];
    }
    const keys = sequences.map((tokens) =>
      tokens.map(displayToken).join(tokens.some((token) => token.length > 1) ? " " : ""),
    );
    const description = action.group === "Folder の操作" ? `Folder の一覧で${action.label}` : action.label;
    return [{ keys: [keys.join(" / ")], description }];
  });
  const editor: Row[] = vim.editor
    ? [
        { keys: [":w"], description: "本文を保存（Vim のエディタ）" },
        { keys: [":q"], description: "本文から一覧へ" },
        { keys: [":wq"], description: "保存して一覧へ（:x も同じ）" },
        { keys: [":e 名前"], description: "名前を入れて探して開く（Vim のエディタ）" },
      ]
    : [];
  return [{ title: "Vim モード（入力欄の外）", rows: [...rows, ...editor] }];
}

// ショートカットの一覧（? のダイアログと設定画面で使う）。query で説明・キーを絞り込む
export function ShortcutList({ query = "" }: { query?: string }) {
  const vim = useVimSettings();
  const navigation = useNavigation();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = [...(vim.enabled ? vimGroups(vim) : []), ...baseGroups(navigation)].map((group) => ({
    ...group,
    rows: group.rows.filter((row) => {
      const text = `${group.title} ${row.description} ${row.keys.join(" ")}`.toLowerCase();
      return words.every((word) => text.includes(word));
    }),
  })).filter((group) => group.rows.length > 0);
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">一致するショートカットはありません</p>;
  }
  return (
    <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
              {group.title}
            </h3>
            <dl className="divide-y divide-border rounded-lg border border-border">
              {group.rows.map((row) => (
                <div
                  key={row.description}
                  className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
                >
                  <dt>{row.description}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {row.keys.map((key, index) => (
                      <Fragment key={key}>
                        {index > 0 && (
                          <span className="text-xs text-muted-foreground">+</span>
                        )}
                        <Kbd>{key}</Kbd>
                      </Fragment>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
    </div>
  );
}

// ショートカットの一覧（? で開く）
export default function ShortcutHelp({ open, onClose }: Props) {
  return (
    <Dialog
      open={open}
      title="キーボードショートカット"
      onClose={onClose}
      className="max-w-lg"
    >
      <div className="max-h-[65vh] overflow-y-auto pr-1">
        <ShortcutList />
      </div>
    </Dialog>
  );
}
