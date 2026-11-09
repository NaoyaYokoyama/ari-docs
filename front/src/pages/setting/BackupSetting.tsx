import { DatabaseBackup, Download, RotateCcw, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import {
  createBackup,
  deleteBackup,
  downloadBackup,
  getBackups,
  getBackupSettings,
  restoreBackup,
  updateBackupSettings,
} from "@/api/backup";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import IconButton from "@/components/common/IconButton";
import Input from "@/components/common/Input";
import Spinner from "@/components/common/Spinner";
import { saveBlob } from "@/lib/download";
import { formatSize } from "@/lib/fileType";
import { errorMessage, formatDateTime } from "@/lib/format";
import { Field, SettingPanel } from "@/pages/setting/SettingPanel";
import type { BackupListResponse, BackupSettings } from "@/types/backup";

const INTERVALS = [
  { value: "off", label: "しない" },
  { value: "daily", label: "毎日" },
  { value: "weekly", label: "毎週（月曜）" },
  { value: "monthly", label: "毎月（1 日）" },
];

const KINDS: Record<string, string> = {
  auto: "定期",
  manual: "手動",
  before_restore: "復元の前",
};

function Select({ id, value, onChange, children }: { id: string; value: string | number; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
    >
      {children}
    </select>
  );
}

// バックアップ（FN0901）。ローカルモード、または共有モードの管理者だけ
export default function BackupSetting() {
  const { showMessage, showConfirm } = useApp();
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [list, setList] = useState<BackupListResponse | null>(null);
  const [working, setWorking] = useState("");

  const load = useCallback(() => {
    getBackupSettings().then(setSettings).catch((error) => {
      console.error(error);
      showMessage("error", errorMessage(error, "バックアップの設定を読み込めませんでした"));
    });
    getBackups().then(setList).catch(console.error);
  }, [showMessage]);

  useEffect(load, [load]);

  const run = async (label: string, action: () => Promise<{ message: string }>, reload = true) => {
    setWorking(label);
    try {
      showMessage("info", (await action()).message);
    } catch (error) {
      showMessage("error", errorMessage(error, `${label}に失敗しました`));
    } finally {
      setWorking("");
      if (reload) {
        load();
      }
    }
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (settings) {
      void run("設定の保存", () => updateBackupSettings(settings));
    }
  };

  const restore = async (backupId: string, createdAt: string) => {
    const confirmed = await showConfirm(
      `${formatDateTime(createdAt)} の状態に戻しますか？ファイル・Note・Wiki・ユーザーなどが、この時点のものに置き換わります（戻す前に、今の状態を自動でバックアップします）`,
    );
    if (!confirmed) {
      return;
    }
    setWorking("復元");
    try {
      const response = await restoreBackup(backupId);
      sessionStorage.setItem("message", response.message);
      window.location.reload();
    } catch (error) {
      showMessage("error", errorMessage(error, "復元に失敗しました"));
      setWorking("");
      load();
    }
  };

  const download = async (backupId: string, fileName: string) => {
    setWorking("ダウンロード");
    try {
      if (await saveBlob(fileName, await downloadBackup(backupId))) {
        showMessage("info", `「${fileName}」をダウンロードしました`);
      }
    } catch (error) {
      showMessage("error", errorMessage(error, "ダウンロードに失敗しました"));
    } finally {
      setWorking("");
    }
  };

  const remove = async (backupId: string, fileName: string) => {
    if (await showConfirm(`バックアップ「${fileName}」を削除しますか？元には戻せません`)) {
      void run("削除", () => deleteBackup(backupId));
    }
  };

  const update = (patch: Partial<BackupSettings>) =>
    setSettings((current) => (current ? { ...current, ...patch } : current));

  return (
    <div className="space-y-8">
      <SettingPanel
        title="バックアップ"
        description="ファイル（folder/）と DB（Note・Wiki・ユーザー・お気に入りなど）をまとめて ZIP に保存します。決めた間隔で自動で取り、保存期間を過ぎた定期のバックアップは自動で消します（手動のものは残します）"
      >
        {!settings ? (
          <Spinner />
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="自動のバックアップ" htmlFor="backup-interval">
                <Select id="backup-interval" value={settings.interval} onChange={(interval) => update({ interval })}>
                  {INTERVALS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="時刻" htmlFor="backup-hour">
                <Select id="backup-hour" value={settings.hour} onChange={(hour) => update({ hour: Number(hour) })}>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {hour} 時ごろ
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="保存期間（日）" htmlFor="backup-retention">
                <Input
                  id="backup-retention"
                  type="number"
                  min={1}
                  max={3650}
                  value={settings.retentionDays}
                  onChange={(e) => update({ retentionDays: Number(e.target.value) })}
                  className="w-full"
                />
              </Field>
              <Field label="ゴミ箱の保存期間（日）" htmlFor="trash-retention">
                <Input
                  id="trash-retention"
                  type="number"
                  min={1}
                  max={3650}
                  value={settings.trashRetentionDays}
                  onChange={(e) => update({ trashRetentionDays: Number(e.target.value) })}
                  className="w-full"
                />
              </Field>
            </div>
            <Field label="保存先のフォルダ（空なら既定の場所）" htmlFor="backup-dir">
              <Input
                id="backup-dir"
                value={settings.dir}
                onChange={(e) => update({ dir: e.target.value })}
                placeholder={list?.defaultDir ?? ""}
                className="w-full font-mono text-[0.8125rem]"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              壊れたときに備え、できれば別のドライブ・別の PC の共有フォルダなどを保存先にしてください。アプリ（サーバー）が動いている間だけ自動で取ります。
            </p>
            <div className="flex justify-end">
              <Button type="submit" disabled={working !== ""}>
                設定を保存
              </Button>
            </div>
          </form>
        )}
      </SettingPanel>

      <SettingPanel title="バックアップの一覧" description="ダウンロード・復元・削除ができます。復元すると、その時点の状態に戻ります">
        {!list ? (
          <Spinner />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {working || list.busy ? `${working || "バックアップ・復元"}を実行中です...` : `${list.backups.length} 件`}
              </span>
              <Button
                size="sm"
                disabled={working !== "" || list.busy}
                onClick={() => void run("バックアップ", createBackup)}
              >
                <DatabaseBackup size={15} />
                今すぐバックアップ
              </Button>
            </div>
            {list.backups.length === 0 ? (
              <p className="text-sm text-muted-foreground">バックアップはまだありません</p>
            ) : (
              <ul className="divide-y divide-border">
                {list.backups.map((item) => (
                  <li key={item.backupId} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium tabular-nums">
                        {formatDateTime(item.createdAt)}
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] font-normal text-muted-foreground">
                          {KINDS[item.kind] ?? item.kind}
                        </span>
                        {!item.exists && (
                          <span className="text-[0.6875rem] font-normal text-destructive">ファイルが見つかりません</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={item.fileName}>
                        {formatSize(item.size)}・{item.createdBy === "system" ? "自動" : item.createdBy}・{item.fileName}
                      </p>
                    </div>
                    <IconButton
                      label="ダウンロード"
                      disabled={!item.exists || working !== ""}
                      onClick={() => void download(item.backupId, item.fileName)}
                    >
                      <Download size={16} />
                    </IconButton>
                    <IconButton
                      label="この時点に戻す（復元）"
                      disabled={!item.exists || working !== "" || list.busy}
                      onClick={() => void restore(item.backupId, item.createdAt)}
                    >
                      <RotateCcw size={16} />
                    </IconButton>
                    <IconButton
                      label="削除"
                      disabled={working !== "" || list.busy}
                      onClick={() => void remove(item.backupId, item.fileName)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SettingPanel>
    </div>
  );
}
