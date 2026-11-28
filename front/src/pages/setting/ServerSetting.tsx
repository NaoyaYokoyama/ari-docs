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
  uploadMaxMb: 1024,
  fileLockMaxDays: 7,
  fileVersionKeep: 10,
  wikiEditLock: true,
  imageCompress: true,
  imageQuality: 85,
  imageMaxSide: 1920,
};

// オン・オフで決める設定
type FlagKey = "docsEnabled" | "wikiEditLock" | "imageCompress";
type Flags = Record<FlagKey, boolean>;
const FLAG_KEYS: FlagKey[] = ["docsEnabled", "wikiEditLock", "imageCompress"];

// 数で指定する設定（入力欄に出す）
type NumberKey = Exclude<keyof ServerSettings, FlagKey>;
type NumberForm = Record<NumberKey, string>;

// これより下げると劣化が目立つ（注意を出す。FN0902-BR09）
const IMAGE_QUALITY_WARN = 70;
const IMAGE_SIDE_WARN = 1280;

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
  {
    key: "uploadMaxMb",
    label: "アップロードの上限",
    description: "Folder で 1 回にアップロードできる合計の大きさです",
    unit: "MB",
    min: 1,
    max: 10240,
  },
  {
    key: "fileVersionKeep",
    label: "ファイルの以前の版を残す数",
    description: "ari-docs でファイルを上書きしたとき、前の中身を 1 つのファイルにつきこの数まで残します（Folder の右クリックの「以前の版」）。0 なら残しません。残した分だけサーバーのディスクを使います",
    unit: "件",
    min: 0,
    max: 100,
  },
  {
    key: "fileLockMaxDays",
    label: "ファイルのロックの期限の上限",
    description: "Folder でファイルをロックするとき、期限にできるのはこの日数後までです。期限が来ると自動で外れます。管理者はいつでも外せます",
    unit: "日",
    min: 1,
    max: 365,
    sharedOnly: true,
  },
];

const IMAGE_ITEMS: Item[] = [
  {
    key: "imageQuality",
    label: "画質",
    description: "縮めるときの画質です。下げるほど小さくなりますが、文字や線がにじみます",
    unit: "%",
    min: 10,
    max: 100,
  },
  {
    key: "imageMaxSide",
    label: "長い辺の上限",
    description: "これより大きな画像は、この大きさまで縮めます",
    unit: "画素",
    min: 800,
    max: 4096,
  },
];

// ログインと保存の設定（FN0902）。全員に効くため、共有モードでは管理者だけ
export default function ServerSetting() {
  const { user, setUser, showMessage } = useApp();
  const shared = user?.mode === "shared";
  const [saved, setSaved] = useState<ServerSettings | null>(null);
  const [form, setForm] = useState<NumberForm | null>(null);
  const [flags, setFlags] = useState<Flags>(pickFlags(DEFAULTS));

  useEffect(() => {
    getServerSettings()
      .then((settings) => {
        setSaved(settings);
        setForm(toForm(settings));
        setFlags(pickFlags(settings));
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
    ...flags,
  } satisfies ServerSettings;
  const items = [...LOGIN_ITEMS, ...STORAGE_ITEMS, ...IMAGE_ITEMS];
  const invalid = items.find((item) => {
    const value = values[item.key];
    return !Number.isInteger(value) || value < item.min || value > item.max;
  });
  const changed =
    items.some((item) => values[item.key] !== saved[item.key]) || FLAG_KEYS.some((key) => flags[key] !== saved[key]);
  const isDefault =
    items.every((item) => values[item.key] === DEFAULTS[item.key]) &&
    FLAG_KEYS.every((key) => flags[key] === DEFAULTS[key]);
  const flagRow = (key: FlagKey, label: string, description: string) => (
    <SettingRow key={key} label={label} description={description} htmlFor={`server-${key}`}>
      <Toggle
        id={`server-${key}`}
        checked={flags[key]}
        onChange={(checked) => setFlags({ ...flags, [key]: checked })}
        label={label}
      />
    </SettingRow>
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await updateServerSettings(values);
      setSaved(values);
      // ヘッダーのメニュー・Alt+数字にすぐ反映する（ほかの人・PC には次に開いたときに反映される）
      setUser((current) =>
        current
          ? {
              ...current,
              docsEnabled: values.docsEnabled,
              fileLockMaxDays: values.fileLockMaxDays,
              imageCompress: values.imageCompress,
              imageQuality: values.imageQuality,
              imageMaxSide: values.imageMaxSide,
            }
          : current,
      );
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
        {/* 単位の幅をそろえ、入力欄の右端を行ごとにそろえる */}
        <span className="w-8">{item.unit}</span>
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
        <SettingCard title="保存">
          {STORAGE_ITEMS.filter((item) => shared || !item.sharedOnly).map(row)}
          {values.uploadMaxMb > DEFAULTS.uploadMaxMb && (
            <div className="mt-2 rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
              <p>初期値（1024 MB）より大きくすると、次のことに気を付けてください。</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                <li>大きなファイルは送るのに時間がかかり、その間ネットワークが混みます</li>
                <li>届いたファイルはサーバーのディスクを使い、バックアップ（ZIP）も大きく・遅くなります</li>
                <li>送っている間は、サーバーのデータのフォルダにも同じ大きさの一時ファイルを作ります</li>
                <li>Excel・Word・PDF などの中身の検索は、100 MB を超えるファイルを読みません</li>
              </ul>
            </div>
          )}
        </SettingCard>
        <SettingCard title="画像">
          {flagRow(
            "imageCompress",
            "画像を縮める",
            "Note・Wiki に貼る画像を、下の画質・大きさに縮めて保存します。共有サーバーでは Docs の画像も縮めて送ります（元のファイルは変えません。初期値 オン）",
          )}
          {flags.imageCompress && IMAGE_ITEMS.map(row)}
          {flags.imageCompress &&
            (values.imageQuality < IMAGE_QUALITY_WARN || values.imageMaxSide < IMAGE_SIDE_WARN) && (
              <p role="status" className="mt-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                {values.imageQuality < IMAGE_QUALITY_WARN &&
                  `画質を ${IMAGE_QUALITY_WARN}% より下げると、文字や線がにじむなど劣化が目立ちます。`}
                {values.imageMaxSide < IMAGE_SIDE_WARN &&
                  `長い辺を ${IMAGE_SIDE_WARN} 画素より小さくすると、画面の写しなどの細かい文字が読めなくなることがあります。`}
                すでに貼った画像は変わりません。
              </p>
            )}
        </SettingCard>
        <SettingCard title="機能">
          {shared &&
            flagRow(
              "wikiEditLock",
              "Wiki を書いている間はロックする",
              "だれかが Wiki を書き始めたら、保存するまで（止まって 10 分たつまで）ほかの人は読むだけにします。オフにすると、ほかの人も書け、保存のときに上書きするかを確かめます（初期値 オン）",
            )}
          {flagRow(
            "docsEnabled",
            "Docs（Markdown ビューア）を使う",
            "設計書などの Markdown を見る画面です。オンにするとヘッダーの Task と Setting の間に出て、Docs が Alt+6、Setting が Alt+7 になります（初期値 オフ）",
          )}
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
              setFlags(pickFlags(DEFAULTS));
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
    uploadMaxMb: String(settings.uploadMaxMb),
    fileLockMaxDays: String(settings.fileLockMaxDays ?? 7),
    fileVersionKeep: String(settings.fileVersionKeep ?? 10),
    imageQuality: String(settings.imageQuality ?? DEFAULTS.imageQuality),
    imageMaxSide: String(settings.imageMaxSide ?? DEFAULTS.imageMaxSide),
  };
}

function pickFlags(settings: ServerSettings): Flags {
  return {
    docsEnabled: settings.docsEnabled,
    wikiEditLock: settings.wikiEditLock ?? DEFAULTS.wikiEditLock,
    imageCompress: settings.imageCompress ?? DEFAULTS.imageCompress,
  };
}
