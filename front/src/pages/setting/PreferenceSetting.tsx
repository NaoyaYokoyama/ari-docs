import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

import { useApp } from "@/app/AppContext";
import {
  DEFAULT_PREFERENCES,
  type EditorMode,
  FONT_SIZES,
  getEditorMode,
  type Preferences,
  REDUCE_MOTIONS,
  setEditorMode,
  setPreference,
  START_PAGES,
  usePreferences,
} from "@/app/preferences";
import { type ThemePreference, useTheme } from "@/app/theme";
import {
  ResetButton,
  Segmented,
  SettingCard,
  SettingPanel,
  SettingRow,
  Toggle,
} from "@/pages/setting/SettingPanel";

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "ライト", icon: Sun },
  { value: "dark", label: "ダーク", icon: Moon },
  { value: "system", label: "OS に合わせる", icon: Monitor },
];

const EDITOR_MODES: { value: EditorMode; label: string }[] = [
  { value: "preview", label: "プレビュー" },
  { value: "live", label: "分割" },
  { value: "edit", label: "編集" },
];

const PC_ONLY = "この PC だけに保存します（ほかの PC には影響しません）";

function isDefault(preferences: Preferences, keys: (keyof Preferences)[]) {
  return keys.every((key) => preferences[key] === DEFAULT_PREFERENCES[key]);
}

function resetKeys(keys: (keyof Preferences)[]) {
  for (const key of keys) {
    setPreference(key, DEFAULT_PREFERENCES[key]);
  }
}

// 表示（配色・文字の大きさ・動き。FN0701）
export function AppearanceSetting() {
  const { preference, setPreference: setTheme } = useTheme();
  const preferences = usePreferences();
  const keys: (keyof Preferences)[] = ["fontSize", "reduceMotion"];
  return (
    <SettingPanel title="表示" description={PC_ONLY} plain>
      <SettingCard title="配色">
        <div role="radiogroup" aria-label="配色" className="grid grid-cols-3 gap-3">
          {THEMES.map((theme) => {
            const Icon = theme.icon;
            const checked = preference === theme.value;
            return (
              <button
                key={theme.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => setTheme(theme.value)}
                className={twMerge(
                  "flex flex-col items-center gap-2 rounded-lg border px-3 py-4 text-sm transition-colors",
                  checked
                    ? "border-brand bg-brand/5 font-medium"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                <Icon size={20} className={checked ? "text-brand" : undefined} />
                {theme.label}
              </button>
            );
          })}
        </div>
      </SettingCard>

      <SettingCard>
        <SettingRow
          label="文字の大きさ"
          description="画面全体の文字とボタンの大きさを変えます。Note・Wiki の本文も大きくなります"
        >
          <Segmented
            label="文字の大きさ"
            value={preferences.fontSize}
            options={FONT_SIZES}
            onChange={(value) => setPreference("fontSize", value)}
          />
        </SettingRow>
        <SettingRow
          label="画面の動きを減らす"
          description="ダイアログを開くときなどの動きを止めます。動きで酔いやすい方や、動作の遅い PC に。「OS に合わせる」は Windows の「アニメーション効果」などの設定に従います"
        >
          <Segmented
            label="画面の動きを減らす"
            value={preferences.reduceMotion}
            options={REDUCE_MOTIONS}
            onChange={(value) => setPreference("reduceMotion", value)}
          />
        </SettingRow>
      </SettingCard>

      <div className="flex justify-end">
        <ResetButton visible={!isDefault(preferences, keys)} onClick={() => resetKeys(keys)} />
      </div>
    </SettingPanel>
  );
}

// 操作（起動したときの画面・Note・Wiki の表示・Folder の動き。FN0701）
export function BehaviorSetting() {
  const preferences = usePreferences();
  const { user } = useApp();
  // エディタの表示は Note・Wiki の画面でも切り替えるため、開いたときの値を出す
  const [editorMode, setMode] = useState(getEditorMode);
  const keys: (keyof Preferences)[] = ["startPage", "confirmDelete", "showHidden", "folderPreviewPane", "buttonHints"];
  return (
    <SettingPanel title="操作" description={PC_ONLY} plain>
      <SettingCard title="全体">
        <SettingRow
          label="起動したときに開く画面"
          description="「前回の画面」は、最後に開いていた画面（Home・Folder・Note・Wiki・Docs・設定）を開きます。URL で画面を指定して開いたときは、その画面を開きます。Docs を使わない設定のときは、Docs の代わりに Home を開きます"
          htmlFor="start-page"
        >
          <select
            id="start-page"
            value={preferences.startPage}
            onChange={(e) => setPreference("startPage", e.target.value as Preferences["startPage"])}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          >
            {START_PAGES.filter(
              (page) => page.value !== "docs" || user?.docsEnabled || preferences.startPage === "docs",
            ).map((page) => (
              <option key={page.value} value={page.value}>
                {page.label}
              </option>
            ))}
          </select>
        </SettingRow>
      </SettingCard>

      <SettingCard title="Note・Wiki">
        <SettingRow
          label="開いたときの表示"
          description="Note・Wiki の画面で切り替えたときも、最後に選んだものを覚えます"
        >
          <Segmented
            label="開いたときの表示"
            value={editorMode}
            options={EDITOR_MODES}
            onChange={(value) => {
              setMode(value);
              setEditorMode(value);
            }}
          />
        </SettingRow>
        <SettingRow
          label="ボタンの説明を出す"
          description="書式のボタン・表示の切り替え（編集・分割・プレビュー）などにマウスを乗せたとき・キーで選んだときに、何をするボタンかを一言で出します。慣れて邪魔になったらオフに"
          htmlFor="button-hints"
        >
          <Toggle
            id="button-hints"
            label="ボタンの説明を出す"
            checked={preferences.buttonHints}
            onChange={(value) => setPreference("buttonHints", value)}
          />
        </SettingRow>
      </SettingCard>

      <SettingCard title="Folder">
        <SettingRow
          label="削除の前に確かめる"
          description="削除したものはゴミ箱に移り、あとで元に戻せます。うっかり消すのが心配なときはオンに"
          htmlFor="confirm-delete"
        >
          <Toggle
            id="confirm-delete"
            label="削除の前に確かめる"
            checked={preferences.confirmDelete}
            onChange={(value) => setPreference("confirmDelete", value)}
          />
        </SettingRow>
        <SettingRow
          label="隠しファイルを表示する"
          description="「.」で始まる名前のファイル・フォルダ（.git など）を一覧に出します"
          htmlFor="show-hidden"
        >
          <Toggle
            id="show-hidden"
            label="隠しファイルを表示する"
            checked={preferences.showHidden}
            onChange={(value) => setPreference("showHidden", value)}
          />
        </SettingRow>
        <SettingRow
          label="右にプレビューを出す"
          description="Folder を開いたときに、一覧の右に選んだファイルの中身を出します。Folder の画面の「プレビュー」のボタン（Alt+P）でも出し入れできます（そのときだけ）。画面の幅が狭いときは出しません"
          htmlFor="folder-preview-pane"
        >
          <Toggle
            id="folder-preview-pane"
            label="右にプレビューを出す"
            checked={preferences.folderPreviewPane}
            onChange={(value) => setPreference("folderPreviewPane", value)}
          />
        </SettingRow>
      </SettingCard>

      <div className="flex justify-end">
        <ResetButton visible={!isDefault(preferences, keys)} onClick={() => resetKeys(keys)} />
      </div>
    </SettingPanel>
  );
}
