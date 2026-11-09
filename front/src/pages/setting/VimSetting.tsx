import { RotateCcw } from "lucide-react";
import { type ComponentProps, Fragment, useEffect, useState } from "react";

import IconButton from "@/components/common/IconButton";
import Input from "@/components/common/Input";
import Kbd from "@/components/common/Kbd";
import { ResetButton, SettingCard, SettingPanel, SettingRow, Toggle } from "@/pages/setting/SettingPanel";
import { DEFAULT_VIM_KEYS, VIM_ACTION_GROUPS, VIM_ACTIONS, type VimActionId } from "@/vim/actions";
import { displayToken, parseBinding } from "@/vim/keys";
import {
  DEFAULT_VIM_SETTINGS,
  replaceVimSettings,
  SCROLL_STEP_RANGE,
  setVimKey,
  setVimSettings,
  uniqueChars,
  useVimSettings,
} from "@/vim/vimSettings";

// vimrc の行で使える命令（@replit/codemirror-vim が受け付けるもの）
const VIMRC_COMMANDS = new Set([
  "map", "nmap", "vmap", "xmap", "imap", "omap",
  "noremap", "nnoremap", "vnoremap", "xnoremap", "inoremap", "onoremap",
  "unmap", "nunmap", "vunmap", "iunmap", "ounmap",
  "mapclear", "nmapclear", "vmapclear", "imapclear", "omapclear",
  "set", "se", "let",
]);

const VIMRC_EXAMPLE = `" 例（" で始まる行はメモ）
nnoremap j gj
nnoremap k gk
set ignorecase
set smartcase`;

// 打っている途中は入力のまま持ち、使える値になったら保存する（10 未満・1 文字などで止めないように）。
// 離れたときに使えない値なら、保存している値に戻す
function DraftInput({
  value,
  onCommit,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  // 使える値なら保存して true
  onCommit: (text: string) => boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      {...props}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onCommit(e.target.value);
      }}
      onBlur={() => setDraft(value)}
    />
  );
}

function sequenceLabel(tokens: string[]) {
  return tokens.map(displayToken).join(tokens.some((token) => token.length > 1) ? " " : "");
}

// キーが重なっているところを、操作ごとに文にする
function findConflicts(keys: Record<VimActionId, string>) {
  const all = VIM_ACTIONS.flatMap((action) =>
    parseBinding(keys[action.id]).sequences.map((tokens) => ({ id: action.id, label: action.label, tokens })),
  );
  const messages = Object.fromEntries(VIM_ACTIONS.map((action) => [action.id, [] as string[]])) as Record<
    VimActionId,
    string[]
  >;
  for (const a of all) {
    for (const b of all) {
      if (a === b) {
        continue;
      }
      const same = a.tokens.length === b.tokens.length && a.tokens.every((token, index) => b.tokens[index] === token);
      const prefix = a.tokens.length < b.tokens.length && a.tokens.every((token, index) => b.tokens[index] === token);
      if (same && a.id !== b.id) {
        messages[a.id].push(`「${b.label}」と同じキー（${sequenceLabel(a.tokens)}）です。先に並んでいる方が動きます`);
      } else if (prefix) {
        messages[a.id].push(
          `「${b.label}」（${sequenceLabel(b.tokens)}）の始まりと同じです。押したあと 1 秒待ってから動きます`,
        );
      }
    }
  }
  return messages;
}

// Vim モード（FN0702）。この PC だけに保存する
export default function VimSetting() {
  const settings = useVimSettings();
  const conflicts = findConflicts(settings.keys);
  const vimrcWarnings = settings.vimrc
    .split("\n")
    .map((line, index) => ({ line: line.trim().replace(/^:/, ""), number: index + 1 }))
    .filter(({ line }) => line && !line.startsWith('"') && !VIMRC_COMMANDS.has(line.split(/\s+/)[0]));
  const isDefault = JSON.stringify(settings) === JSON.stringify(DEFAULT_VIM_SETTINGS);

  return (
    <SettingPanel
      title="Vim モード"
      description="Vim・Vimium と同じ感覚で、キーボードだけで操作します。この PC だけに保存します"
      plain
    >
      <SettingCard>
        <SettingRow
          label="Vim モードを使う"
          description={
            <>
              入力欄の外で <Kbd>j</Kbd> <Kbd>k</Kbd> でスクロール、<Kbd>f</Kbd> で押すところを文字で選ぶ、
              <Kbd>/</Kbd> で検索欄へ、など。入力欄の中では普通に文字を打てます（<Kbd>Esc</Kbd> の代わりに入力欄の外をクリック）。
              <Kbd>?</Kbd> の一覧にも出ます
            </>
          }
          htmlFor="vim-enabled"
        >
          <Toggle
            id="vim-enabled"
            label="Vim モードを使う"
            checked={settings.enabled}
            onChange={(enabled) => setVimSettings({ enabled })}
          />
        </SettingRow>
      </SettingCard>

      <SettingCard
        title="画面の操作のキー"
        description={
          <>
            Vim の書き方で入れます（<Kbd>G</Kbd> は Shift+G、<code>&lt;C-d&gt;</code> は Ctrl+D、
            <code>&lt;Space&gt;</code> は Space）。1 つの操作に複数割り当てるときは「,」で区切り、空にすると割り当てなし。
            数字を先に打つと回数になります（<Kbd>5</Kbd> <Kbd>j</Kbd> で 5 回）
          </>
        }
      >
        {VIM_ACTION_GROUPS.map((group) => (
          <Fragment key={group}>
            <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-muted-foreground first:mt-0">{group}</h3>
            {VIM_ACTIONS.filter((action) => action.group === group).map((action) => {
              const { errors } = parseBinding(settings.keys[action.id]);
              const changed = settings.keys[action.id] !== DEFAULT_VIM_KEYS[action.id];
              return (
                <SettingRow
                  key={action.id}
                  label={action.label}
                  description={
                    <>
                      {action.description}
                      {errors.length > 0 && (
                        <span className="block text-destructive">
                          読めないキー: {errors.join("、")}（この部分は使いません）
                        </span>
                      )}
                      {conflicts[action.id].map((message) => (
                        <span key={message} className="block text-warning">
                          {message}
                        </span>
                      ))}
                    </>
                  }
                  htmlFor={`vim-key-${action.id}`}
                >
                  <span className="flex items-center gap-1">
                    <Input
                      id={`vim-key-${action.id}`}
                      value={settings.keys[action.id]}
                      onChange={(e) => setVimKey(action.id, e.target.value)}
                      placeholder="割り当てなし"
                      spellCheck={false}
                      autoComplete="off"
                      className="h-8 w-36 font-mono text-sm"
                    />
                    <IconButton
                      label={`既定（${DEFAULT_VIM_KEYS[action.id]}）に戻す`}
                      onClick={() => setVimKey(action.id, DEFAULT_VIM_KEYS[action.id])}
                      className={changed ? undefined : "invisible"}
                    >
                      <RotateCcw size={14} />
                    </IconButton>
                  </span>
                </SettingRow>
              );
            })}
          </Fragment>
        ))}
      </SettingCard>

      <SettingCard title="スクロールとヒント">
        <SettingRow
          label="1 回でスクロールする量"
          description={`下へ・上へ（j・k）で動く量です。文字の大きさの設定に合わせて変わります（${SCROLL_STEP_RANGE.min}〜${SCROLL_STEP_RANGE.max}、初期値 ${DEFAULT_VIM_SETTINGS.scrollStep}）`}
          htmlFor="vim-scroll-step"
        >
          <span className="flex items-center gap-2 text-sm">
            <DraftInput
              id="vim-scroll-step"
              type="number"
              min={SCROLL_STEP_RANGE.min}
              max={SCROLL_STEP_RANGE.max}
              value={String(settings.scrollStep)}
              onCommit={(text) => {
                const value = Number(text);
                if (!(value >= SCROLL_STEP_RANGE.min && value <= SCROLL_STEP_RANGE.max)) {
                  return false;
                }
                setVimSettings({ scrollStep: Math.round(value) });
                return true;
              }}
              className="h-8 w-24 text-right"
            />
            px
          </span>
        </SettingRow>
        <SettingRow
          label="ヒントの文字"
          description={`f を押したときに、押せるところに出す文字です。左から順に使います（2 文字以上。初期値は Vimium と同じ ${DEFAULT_VIM_SETTINGS.hintChars}）`}
          htmlFor="vim-hint-chars"
        >
          <DraftInput
            id="vim-hint-chars"
            value={settings.hintChars}
            onCommit={(text) => {
              const chars = uniqueChars(text.toLowerCase());
              if (chars.length < 2) {
                return false;
              }
              setVimSettings({ hintChars: chars });
              return true;
            }}
            spellCheck={false}
            autoComplete="off"
            className="h-8 w-48 font-mono text-sm"
          />
        </SettingRow>
      </SettingCard>

      <SettingCard
        title="Note・Wiki の本文"
        description="本文も Vim（ノーマル・挿入・ビジュアルモード、レジスタ、. での繰り返しなど）で編集します。表示が「プレビュー」のときは使いません"
      >
        <SettingRow
          label="本文も Vim で編集する"
          description={
            <>
              <code>:w</code> で保存、<code>:q</code> で一覧へ、<code>:wq</code>・<code>:x</code> で保存して一覧へ。
              日本語を入力するときは、ノーマルモードに戻る前に IME をオフにしてください（Vim と同じ）
            </>
          }
          htmlFor="vim-editor"
        >
          <Toggle
            id="vim-editor"
            label="本文も Vim で編集する"
            checked={settings.editor}
            onChange={(editor) => setVimSettings({ editor })}
          />
        </SettingRow>
        <SettingRow
          label="挿入モードを抜けるキー"
          description="Esc の代わりに押すキーです（jj・jk など）。空なら Esc だけ"
          htmlFor="vim-insert-escape"
        >
          <Input
            id="vim-insert-escape"
            value={settings.insertEscape}
            onChange={(e) => setVimSettings({ insertEscape: e.target.value.trim() })}
            placeholder="例: jk"
            spellCheck={false}
            autoComplete="off"
            className="h-8 w-24 font-mono text-sm"
          />
        </SettingRow>
        <div className="pt-3">
          <label htmlFor="vim-vimrc" className="block text-sm font-medium">
            追加の設定（vimrc）
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            vimrc と同じ書き方で、1 行に 1 つ。使えるのは map・nmap・vmap・imap と noremap の仲間、unmap、set です
          </p>
          <textarea
            id="vim-vimrc"
            value={settings.vimrc}
            onChange={(e) => setVimSettings({ vimrc: e.target.value })}
            placeholder={VIMRC_EXAMPLE}
            rows={6}
            spellCheck={false}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          {vimrcWarnings.map(({ line, number }) => (
            <p key={number} className="text-xs text-warning">
              {number} 行目「{line}」は使えない命令かもしれません
            </p>
          ))}
        </div>
      </SettingCard>

      <div className="flex justify-end">
        <ResetButton visible={!isDefault} onClick={() => replaceVimSettings(DEFAULT_VIM_SETTINGS)} />
      </div>
    </SettingPanel>
  );
}
