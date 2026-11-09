import { LoaderCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  createDictionaryWord,
  deleteDictionaryWord,
  getDictionary,
  getIndexStatus,
} from "@/api/search";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import IconButton from "@/components/common/IconButton";
import Input from "@/components/common/Input";
import Spinner from "@/components/common/Spinner";
import { errorMessage, formatDateTime } from "@/lib/format";
import { SettingPanel } from "@/pages/setting/SettingPanel";
import type { DictionaryResponse, IndexStatus } from "@/types/search";

// ファイルの中身の検索の辞書（業界用語・社内の用語など）と取り込み状況（FN0202）
export default function SearchDictionary() {
  const { showMessage, showConfirm } = useApp();
  const [dictionary, setDictionary] = useState<DictionaryResponse | null>(null);
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [word, setWord] = useState("");
  const [saving, setSaving] = useState(false);
  const trimmed = word.trim();

  const load = useCallback(() => {
    getDictionary()
      .then(setDictionary)
      .catch((error) => {
        console.error(error);
        showMessage("error", errorMessage(error, "検索の辞書の取得に失敗しました"));
      });
    getIndexStatus().then(setStatus).catch(console.error);
  }, [showMessage]);

  useEffect(load, [load]);

  // 文字認識している間は、進み具合を 5 秒ごとに更新する
  const reading = !!status?.ocrProgress;
  useEffect(() => {
    if (!reading) {
      return;
    }
    const timer = window.setInterval(() => {
      getIndexStatus().then(setStatus).catch(console.error);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [reading]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed) {
      return;
    }
    setSaving(true);
    try {
      const response = await createDictionaryWord(trimmed);
      showMessage("info", response.message);
      setWord("");
      load();
    } catch (error) {
      showMessage("error", errorMessage(error, "単語の登録に失敗しました"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (target: string) => {
    const confirmed = await showConfirm(
      `「${target}」を辞書から削除しますか？すべてのファイルを順に取り込み直します`,
    );
    if (!confirmed) {
      return;
    }
    try {
      const response = await deleteDictionaryWord(target);
      showMessage("info", response.message);
      load();
    } catch (error) {
      showMessage("error", errorMessage(error, "単語の削除に失敗しました"));
    }
  };

  return (
    <div className="space-y-8">
      <SettingPanel
        title="検索の辞書"
        description="ファイルの中身は、辞書で単語に区切って検索します。業界用語・社内の用語・製品名などが細かく区切られて見つけにくいときは、ここに登録してください。登録・削除すると、すべてのファイルを順に取り込み直します"
      >
        {!dictionary ? (
          <Spinner />
        ) : (
          <>
            {dictionary.canEdit ? (
              <form onSubmit={add} className="mb-4 flex gap-2">
                <Input
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder="例: 工程管理表、ARI連携基盤"
                  aria-label="登録する単語"
                  className="flex-1"
                />
                <Button type="submit" disabled={saving || !trimmed}>
                  <Plus size={16} />
                  登録
                </Button>
              </form>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">
                辞書の登録・削除は管理者が行います。追加してほしい単語は管理者に伝えてください。
              </p>
            )}
            {dictionary.words.length === 0 ? (
              <p className="text-sm text-muted-foreground">登録した単語はありません</p>
            ) : (
              <ul className="divide-y divide-border">
                {dictionary.words.map((item) => (
                  <li key={item.word} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.word}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.createdBy}・{formatDateTime(item.createdAt)}
                    </span>
                    {dictionary.canEdit && (
                      <IconButton label="削除" onClick={() => void remove(item.word)}>
                        <Trash2 size={16} />
                      </IconButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SettingPanel>

      <SettingPanel
        title="ファイルの取り込み状況"
        description="置いた・更新したファイルは、1 分ごとのバッチで取り込みます。検索に出るまで数分かかることがあります"
      >
        {!status ? (
          <Spinner />
        ) : (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              <Stat label="取り込み済み" value={status.indexed} />
              <Stat label="取り込み直し待ち" value={status.outdated + (status.lastRun?.pending ?? 0)} />
              <Stat label="単語の種類" value={status.keywords} />
              <Stat label="読めなかった" value={status.failed} />
              <Stat label="大きすぎて対象外" value={status.tooLarge} />
            </dl>
            {status.ocrProgress && (
              <p className="flex items-center gap-2 text-xs">
                <LoaderCircle size={14} className="shrink-0 animate-spin text-muted-foreground" />
                <span className="min-w-0 truncate">
                  文字認識中: {status.ocrProgress.path}（{status.ocrProgress.done} / {status.ocrProgress.total}{" "}
                  {status.ocrProgress.unit}）
                </span>
              </p>
            )}
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {status.lastRun
                  ? `最後の取り込み: ${formatDateTime(status.lastRun.finishedAt)}（${status.lastRun.processed} 件）`
                  : "起動してからまだ取り込んでいません"}
              </span>
              <Button size="sm" variant="secondary" onClick={load}>
                <RefreshCw size={14} />
                更新
              </Button>
            </div>
          </div>
        )}
      </SettingPanel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}
