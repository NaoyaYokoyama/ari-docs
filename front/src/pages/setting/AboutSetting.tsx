import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { Copy, Download, RotateCcw, Upload } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { getSystemInfo } from "@/api/system";
import { useApp } from "@/app/AppContext";
import { useDesktopStatus } from "@/app/DesktopContext";
import { exportSettings, importSettings, resetSettings } from "@/app/preferences";
import { useTheme } from "@/app/theme";
import Button from "@/components/common/Button";
import Spinner from "@/components/common/Spinner";
import { clientName } from "@/lib/clientName";
import { saveBlob } from "@/lib/download";
import { formatSize } from "@/lib/fileType";
import { errorMessage } from "@/lib/format";
import { SettingCard, SettingPanel, SettingRow } from "@/pages/setting/SettingPanel";
import type { SystemInfo } from "@/types/system";

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="w-48 shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 flex-1 break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const MODES: Record<string, string> = { local: "個人用（ローカル）", shared: "共有サーバー" };

// アプリの情報（FN0903）。困ったときに管理者・開発者へ伝える内容をまとめて写せる
export function AboutSetting() {
  const { showMessage } = useApp();
  const desktop = useDesktopStatus();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getSystemInfo()
      .then(setInfo)
      .catch((error) => {
        console.error(error);
        showMessage("error", errorMessage(error, "アプリの情報を読み込めませんでした"));
      });
    if (isTauri()) {
      getVersion().then(setAppVersion).catch(console.error);
    }
  }, [showMessage]);

  if (!info) {
    return (
      <SettingPanel title="情報">
        <Spinner />
      </SettingPanel>
    );
  }

  const mono = (value: string) => <span className="font-mono text-[0.8125rem]">{value}</span>;
  const general: [string, ReactNode][] = [
    ["使い方", MODES[info.mode] ?? info.mode],
    ...(desktop?.mode === "server" ? [["接続先", mono(desktop.serverUrl)] as [string, ReactNode]] : []),
    ["この端末", clientName()],
    ...(appVersion ? [["アプリのバージョン", appVersion] as [string, ReactNode]] : []),
    ["サーバーのバージョン", info.version],
    ["サーバーの OS", info.os],
    ["通信の暗号化（HTTPS）", info.https ? "あり" : "なし"],
    ["サーバーを起動した日時", info.startedAt],
  ];
  const counts: [string, ReactNode][] = [
    ...(info.mode === "shared" ? [["ユーザー", `${info.counts.users} 人`] as [string, ReactNode]] : []),
    [info.mode === "shared" ? "Note（全員の合計）" : "Note", `${info.counts.notes} 件`],
    ["Wiki", `${info.counts.wikis} 件`],
    ["ファイル・フォルダ", `${info.counts.nodes} 件`],
    ["中身を検索できるファイル", `${info.counts.indexedFiles} 件`],
    ["検索の単語", `${info.counts.keywords} 語`],
  ];
  const paths: [string, ReactNode][] = info.paths
    ? [
        ["ファイルの置き場所", mono(info.paths.folderRoot)],
        ["データの置き場所", mono(info.paths.dataDir)],
        ["DB", mono(info.paths.databasePath)],
        ["DB の大きさ", formatSize(info.paths.databaseBytes)],
      ]
    : [];

  // 問い合わせ用に、文字だけで写す
  const copy = async () => {
    const text = [...general, ...counts, ...paths]
      .map(([label, value]) => `${label}: ${typeof value === "string" ? value : textOf(value)}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(`ari-docs の情報\n${text}`);
      showMessage("info", "情報をコピーしました。問い合わせのときに貼り付けてください");
    } catch {
      showMessage("error", "コピーできませんでした");
    }
  };

  return (
    <SettingPanel
      title="情報"
      description="困ったときは、この画面の内容を管理者に伝えてください"
      plain
    >
      <SettingCard title="アプリ">
        <Rows rows={general} />
      </SettingCard>
      <SettingCard title="データの量">
        <Rows rows={counts} />
      </SettingCard>
      {paths.length > 0 && (
        <SettingCard
          title="置き場所"
          description={info.mode === "shared" ? "管理者だけに表示しています" : undefined}
        >
          <Rows rows={paths} />
        </SettingCard>
      )}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => void copy()}>
          <Copy size={16} />
          情報をコピー
        </Button>
      </div>
    </SettingPanel>
  );
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

// この PC の画面の設定の書き出し・読み込み・初期化（FN0701）
export function TransferSetting() {
  const { showMessage, showConfirm } = useApp();
  const { preference } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportFile = async () => {
    const blob = new Blob([exportSettings(preference)], { type: "application/json" });
    if (await saveBlob("ari-docs-settings.json", blob)) {
      showMessage("info", "設定を書き出しました");
    }
  };

  const importFile = async (file: File) => {
    try {
      importSettings(await file.text());
      showMessage("info", "設定を読み込みました");
    } catch (error) {
      showMessage("error", errorMessage(error, "設定を読み込めませんでした"));
    }
  };

  const reset = async () => {
    if (
      await showConfirm(
        "この PC の画面の設定（配色・文字の大きさ・操作など）を初めの状態に戻しますか？Note・Wiki・ファイルなどのデータは消えません",
      )
    ) {
      resetSettings();
      showMessage("info", "この PC の画面の設定を初めの状態に戻しました");
    }
  };

  return (
    <SettingPanel
      title="設定の書き出し・初期化"
      description="「表示」「操作」など、この PC に保存した設定を扱います。ユーザー名・パスワードやサーバーの設定は含みません"
    >
      <SettingRow
        label="書き出す"
        description="設定をファイル（JSON）に保存します。別の PC で読み込むと同じ設定になります"
      >
        <Button variant="secondary" size="sm" onClick={() => void exportFile()}>
          <Download size={16} />
          書き出す
        </Button>
      </SettingRow>
      <SettingRow label="読み込む" description="書き出したファイルを選ぶと、その設定に置き換えます">
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload size={16} />
          読み込む
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) {
              void importFile(file);
            }
          }}
        />
      </SettingRow>
      <SettingRow
        label="初めの状態に戻す"
        description="表示がおかしくなったときなどに。ログインしたままで、データも消えません"
      >
        <Button variant="secondary" size="sm" onClick={() => void reset()}>
          <RotateCcw size={16} />
          戻す
        </Button>
      </SettingRow>
    </SettingPanel>
  );
}
