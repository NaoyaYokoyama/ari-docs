import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import {
  Copy,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Server,
  Upload,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  applyServerUpdate,
  getServerUpdate,
  type ServerUpdateStatus,
  uploadServerUpdate,
  waitForServer,
} from "@/api/serverUpdate";
import { getSystemInfo } from "@/api/system";
import { useApp } from "@/app/AppContext";
import { checkUpdate, useInstallUpdate, useUpdateState } from "@/app/appUpdate";
import { useDesktop } from "@/app/DesktopContext";
import {
  exportSettings,
  importSettings,
  resetSettings,
  setPreference,
  usePreferences,
} from "@/app/preferences";
import { useTheme } from "@/app/theme";
import Button from "@/components/common/Button";
import Spinner from "@/components/common/Spinner";
import { clientName } from "@/lib/clientName";
import { saveBlob } from "@/lib/download";
import { formatSize } from "@/lib/fileType";
import { errorMessage } from "@/lib/format";
import { SettingCard, SettingPanel, SettingRow, Toggle } from "@/pages/setting/SettingPanel";
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
  const { showMessage, user } = useApp();
  const desktop = useDesktop();
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
    ...(desktop
      ? [["場所", desktop.place.url ? <>{desktop.place.name}（{mono(desktop.place.url)}）</> : desktop.place.name] as [string, ReactNode]]
      : []),
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
        ["エラーのログ", mono(info.paths.logDir ? `${info.paths.logDir}（error.log。1 MB×5 個まで）` : "-")],
        ["DB の大きさ", formatSize(info.paths.databaseBytes)],
        ["Note・Wiki の画像", `${info.paths.images} 枚（${formatSize(info.paths.imageBytes)}。DB の中）`],
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
      {desktop && <UpdateCard serverUrl={desktop.place.local ? "" : desktop.place.url} />}
      {info.mode === "shared" && user?.isAdmin && <ServerUpdateCard />}
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

// アプリの更新（FN0904）。共有サーバーならそのサーバー、自分の PC なら GitHub を、押したときに調べる
function UpdateCard({ serverUrl }: { serverUrl: string }) {
  const state = useUpdateState();
  const { updateCheck } = usePreferences();
  const install = useInstallUpdate();
  const busy = state.kind === "checking" || state.kind === "installing";

  const status = (() => {
    switch (state.kind) {
      case "checking":
        return "確認しています…";
      case "latest":
        return "今の版が最新です";
      case "available":
        return `新しい版（${state.version}）があります`;
      case "installing":
        return `新しい版を取ってきています${state.percent !== null ? `（${state.percent}%）` : ""}`;
      case "error":
        return state.message;
      default:
        return "";
    }
  })();

  return (
    <SettingCard
      title="更新"
      description={
        serverUrl
          ? "接続している共有サーバーに置かれた新しい版を調べます"
          : "GitHub で新しい版を調べます（押したとき・起動したときに調べる設定のときだけインターネットにつなぎます）"
      }
    >
      <div className="mb-3 flex items-center gap-3 text-sm">
        <label htmlFor="update-check" className="min-w-0 flex-1">
          新しい版を自動で調べる
          <span className="block text-xs text-muted-foreground">
            オフにすると、自分の PC・共有サーバーのどちらでも自分からは調べません（「更新を確認」は押せます）
          </span>
        </label>
        <Toggle
          id="update-check"
          label="新しい版を自動で調べる"
          checked={serverUrl ? updateCheck !== "off" : updateCheck === "on"}
          onChange={(value) => setPreference("updateCheck", value ? "on" : "off")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`min-w-0 flex-1 ${state.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
          role="status"
        >
          {status}
        </span>
        {state.kind === "available" ? (
          <Button size="sm" onClick={() => void install()}>
            <Download size={16} />
            更新して再起動
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void checkUpdate(serverUrl)}
          >
            <RefreshCw size={16} />
            更新を確認
          </Button>
        )}
      </div>
      {state.kind === "available" && state.notes && (
        <details className="mt-3 text-sm" open>
          <summary className="cursor-pointer text-xs text-muted-foreground">変更点</summary>
          <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-muted p-3 font-sans text-[0.8125rem] whitespace-pre-wrap">
            {state.notes}
          </pre>
        </details>
      )}
    </SettingCard>
  );
}

// サーバーの更新（FN0904-BR14〜BR19）。共有モードの管理者だけ。GitHub の新しい版か、上げたファイルで入れ替える
function ServerUpdateCard() {
  const { showConfirm, showMessage } = useApp();
  const [status, setStatus] = useState<ServerUpdateStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  // checking: GitHub に聞いている、updating: 取ってきて入れ替えている、restarting: 起動し直すのを待っている
  const [phase, setPhase] = useState<"idle" | "checking" | "updating" | "restarting">("idle");
  const [file, setFile] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);

  const load = (refresh: boolean) => {
    setPhase("checking");
    getServerUpdate(refresh)
      .then((next) => {
        setStatus(next);
        setLoadError("");
      })
      .catch((error) => setLoadError(errorMessage(error, "サーバーの更新を確認できませんでした")))
      .finally(() => setPhase("idle"));
  };

  useEffect(() => {
    load(false);
  }, []);

  const run = async (version: string | null, start: () => Promise<unknown>) => {
    const target = version ? `サーバーを ${version} に更新しますか？` : "選んだファイルでサーバーを更新しますか？";
    if (
      !status ||
      !(await showConfirm(
        `${target}入れ替えて起動し直す間（数十秒ほど）、使っている人の操作が切れます。前の版の DB の写しを残します`,
      ))
    ) {
      return;
    }
    setPhase("updating");
    try {
      await start();
    } catch (error) {
      setPhase("idle");
      showMessage("error", errorMessage(error, "サーバーを更新できませんでした"));
      return;
    }
    setPhase("restarting");
    const next = await waitForServer(status.currentVersion);
    if (!next) {
      setPhase("idle");
      showMessage(
        "error",
        "サーバーが起動し直しません。サーバーの PC で起動しているか、エラーのログを確かめてください",
      );
      return;
    }
    showMessage("info", `サーバーを ${next} に更新しました。画面を読み込み直します`);
    // 読み込み直すと、アプリもサーバーと同じ版に更新するお知らせが出る（FN0904-BR02）
    setTimeout(() => window.location.reload(), 1500);
  };

  const busy = phase !== "idle";
  const latest = status?.latest;
  const statusText = (() => {
    if (phase === "updating") {
      return "新しい版を取ってきて入れ替えています…";
    }
    if (phase === "restarting") {
      return "サーバーを起動し直しています…";
    }
    if (phase === "checking") {
      return "確認しています…";
    }
    if (loadError) {
      return loadError;
    }
    if (!status) {
      return "";
    }
    if (status.unsupported) {
      return status.unsupported;
    }
    if (status.checkError) {
      return status.checkError;
    }
    return latest ? `新しい版（${latest.version}）があります` : "サーバーは最新の版です";
  })();

  return (
    <SettingCard
      title="サーバーの更新"
      description={`今のサーバーの版: ${status?.currentVersion ?? "-"}。GitHub の新しい版を取ってきて入れ替え、サーバーを起動し直します。管理者だけに表示しています`}
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`min-w-0 flex-1 ${!busy && (loadError || status?.checkError) ? "text-destructive" : "text-muted-foreground"}`}
          role="status"
        >
          {busy && phase !== "checking" && (
            <LoaderCircle size={14} className="mr-2 inline-block animate-spin align-[-2px]" />
          )}
          {statusText}
        </span>
        {latest && !status?.unsupported ? (
          <Button size="sm" disabled={busy} onClick={() => void run(latest.version, applyServerUpdate)}>
            <Server size={16} />
            サーバーを更新
          </Button>
        ) : (
          !status?.unsupported && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => load(true)}>
              <RefreshCw size={16} />
              もう一度調べる
            </Button>
          )
        )}
      </div>
      {latest?.notes && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">変更点</summary>
          <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-muted p-3 font-sans text-[0.8125rem] whitespace-pre-wrap">
            {latest.notes}
          </pre>
        </details>
      )}
      {status && !status.unsupported && (
        <details className="mt-3 text-sm" open={!!status.checkError}>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            ファイルから更新（サーバーがインターネットにつながらないとき）
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            GitHub Releases の「ari-docs-server_＜版＞_linux-x86_64.tar.gz」とその「.sig」を、この PC に落としてから選んでください
          </p>
          <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs">
            <label htmlFor="server-update-file" className="text-muted-foreground">
              サーバー一式（.tar.gz）
            </label>
            <input
              id="server-update-file"
              type="file"
              accept=".gz,.tar.gz,application/gzip"
              disabled={busy}
              className="min-w-0"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <label htmlFor="server-update-signature" className="text-muted-foreground">
              署名（.sig）
            </label>
            <input
              id="server-update-signature"
              type="file"
              accept=".sig"
              disabled={busy}
              className="min-w-0"
              onChange={(e) => setSignature(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !file || !signature}
              onClick={() => file && signature && void run(null, () => uploadServerUpdate(file, signature))}
            >
              <Upload size={16} />
              上げて更新
            </Button>
          </div>
        </details>
      )}
    </SettingCard>
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
