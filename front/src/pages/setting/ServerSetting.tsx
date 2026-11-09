import { useEffect, useState } from "react";

import { getServerSettings, updateServerSettings } from "@/api/system";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Spinner from "@/components/common/Spinner";
import { errorMessage } from "@/lib/format";
import { SettingCard, SettingPanel, SettingRow, Toggle } from "@/pages/setting/SettingPanel";
import type { ServerSettings } from "@/types/system";

const DEFAULTS: ServerSettings = {
  sessionDays: 30,
  maxFailures: 5,
  lockMinutes: 15,
  historyKeep: 100,
  docsEnabled: false,
};

// 数で指定する設定（入力欄に出す）
type NumberKey = Exclude<keyof ServerSettings, "docsEnabled">;
type NumberForm = Record<NumberKey, string>;

type Item = {
  key: NumberKey;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
  // 共有モードだけ（ローカルモードはログインしない）
  sharedOnly?: boolean;
};

const LOGIN_ITEMS: Item[] = [
  {
    key: "sessionDays",
    label: "ログインしたままでいられる日数",
    description: "最後に使ってからこの日数がたつと、もう一度ログインが必要になります。短いほど安全です",
    unit: "日",
    min: 1,
    max: 365,
    sharedOnly: true,
  },
  {
    key: "maxFailures",
    label: "ロックするまでの失敗の回数",
    description: "パスワードを続けてこの回数まちがえると、しばらくログインできなくなります",
    unit: "回",
    min: 3,
    max: 20,
    sharedOnly: true,
  },
  {
    key: "lockMinutes",
    label: "ロックする時間",
    description: "ロックしてからログインできるようになるまでの時間です",
    unit: "分",
    min: 1,
    max: 1440,
    sharedOnly: true,
  },
];

const STORAGE_ITEMS: Item[] = [
  {
    key: "historyKeep",
    label: "変更履歴に残す数",
    description: "Note・Wiki 1 つにつき残す版の数です。超えると古い版から消えます。減らすと次に保存したときに消えます",
    unit: "件",
    min: 1,
    max: 1000,
  },
];

// ログインと保存の設定（FN0902）。全員に効くため、共有モードでは管理者だけ
export default function ServerSetting() {
  const { user, setUser, showMessage } = useApp();
  const shared = user?.mode === "shared";
  const [saved, setSaved] = useState<ServerSettings | null>(null);
  const [form, setForm] = useState<NumberForm | null>(null);
  const [docsEnabled, setDocsEnabled] = useState(false);

  useEffect(() => {
    getServerSettings()
      .then((settings) => {
        setSaved(settings);
        setForm(toForm(settings));
        setDocsEnabled(settings.docsEnabled);
      })
      .catch((error) => {
        console.error(error);
        showMessage("error", errorMessage(error, "サーバーの設定を読み込めませんでした"));
      });
  }, [showMessage]);

  if (!saved || !form) {
    return (
      <SettingPanel title="サーバーの設定">
        <Spinner />
      </SettingPanel>
    );
  }

  const values = {
    ...(Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, Number(value)]),
    ) as Record<NumberKey, number>),
    docsEnabled,
  } satisfies ServerSettings;
  const items = [...LOGIN_ITEMS, ...STORAGE_ITEMS];
  const invalid = items.find((item) => {
    const value = values[item.key];
    return !Number.isInteger(value) || value < item.min || value > item.max;
  });
  const changed =
    items.some((item) => values[item.key] !== saved[item.key]) || docsEnabled !== saved.docsEnabled;
  const isDefault =
    items.every((item) => values[item.key] === DEFAULTS[item.key]) && docsEnabled === DEFAULTS.docsEnabled;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await updateServerSettings(values);
      setSaved(values);
      // ヘッダーのメニュー・Alt+数字にすぐ反映する（ほかの人・PC には次に開いたときに反映される）
      setUser((current) => (current ? { ...current, docsEnabled: values.docsEnabled } : current));
      showMessage("info", response.message);
    } catch (error) {
      showMessage("error", errorMessage(error, "サーバーの設定を保存できませんでした"));
    }
  };

  const row = (item: Item) => (
    <SettingRow
      key={item.key}
      label={item.label}
      description={`${item.description}（${item.min}〜${item.max} ${item.unit}、初期値 ${DEFAULTS[item.key]} ${item.unit}）`}
      htmlFor={`server-${item.key}`}
    >
      <span className="flex items-center gap-2 text-sm">
        <Input
          id={`server-${item.key}`}
          type="number"
          inputMode="numeric"
          min={item.min}
          max={item.max}
          value={form[item.key]}
          onChange={(e) => setForm({ ...form, [item.key]: e.target.value })}
          className="w-24 text-right"
        />
        {item.unit}
      </span>
    </SettingRow>
  );

  return (
    <SettingPanel
      title="サーバーの設定"
      description={
        shared
          ? "全員に効く設定です。管理者だけが変えられます"
          : "この PC の ari-docs のデータに効く設定です"
      }
      plain
    >
      <form onSubmit={submit} className="space-y-6">
        {shared && <SettingCard title="ログイン">{LOGIN_ITEMS.map(row)}</SettingCard>}
        <SettingCard title="保存">{STORAGE_ITEMS.map(row)}</SettingCard>
        <SettingCard title="機能">
          <SettingRow
            label="Docs（Markdown ビューア）を使う"
            description="設計書などの Markdown を見る画面です。オンにするとヘッダーの Wiki と Setting の間に出て、Docs が Alt+5、Setting が Alt+6 になります（初期値 オフ）"
            htmlFor="server-docsEnabled"
          >
            <Toggle
              id="server-docsEnabled"
              checked={docsEnabled}
              onChange={setDocsEnabled}
              label="Docs（Markdown ビューア）を使う"
            />
          </SettingRow>
        </SettingCard>
        {invalid && (
          <p className="text-xs text-destructive">
            「{invalid.label}」は {invalid.min}〜{invalid.max} {invalid.unit}で指定してください
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={isDefault}
            onClick={() => {
              setForm(toForm(DEFAULTS));
              setDocsEnabled(DEFAULTS.docsEnabled);
            }}
          >
            初期値に戻す
          </Button>
          <Button type="submit" disabled={!changed || !!invalid}>
            保存
          </Button>
        </div>
      </form>
    </SettingPanel>
  );
}

function toForm(settings: ServerSettings): NumberForm {
  return {
    sessionDays: String(settings.sessionDays),
    maxFailures: String(settings.maxFailures),
    lockMinutes: String(settings.lockMinutes),
    historyKeep: String(settings.historyKeep),
  };
}
