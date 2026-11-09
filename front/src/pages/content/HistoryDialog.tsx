import { History, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import { getHistory, getVersion, type HistoryItem, type HistoryVersion } from "@/api/history";
import { useTheme } from "@/app/theme";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import Spinner from "@/components/common/Spinner";
import { errorMessage, formatDateTime } from "@/lib/format";
import ContentMarkdown from "@/pages/content/ContentMarkdown";

type Props = {
  kind: "note" | "wiki";
  // 開いている Note・Wiki の ID。null なら閉じている
  contentId: string | null;
  onClose: () => void;
  // 「この版にする」で、その版を編集中の内容にする（保存すると戻る）
  onLoad: (version: HistoryVersion) => void;
};

// 変更履歴（FN0402）。保存した版の一覧と中身を見て、前の版に戻せる
export default function HistoryDialog({ kind, contentId, onClose, onLoad }: Props) {
  const { resolved } = useTheme();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [version, setVersion] = useState<HistoryVersion | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!contentId) {
      return;
    }
    setItems(null);
    setVersion(null);
    setError("");
    getHistory(kind, contentId)
      .then((list) => {
        setItems(list);
        if (list[0]) {
          void getVersion(list[0].historyId).then(setVersion);
        }
      })
      .catch((e) => setError(errorMessage(e, "履歴を読み込めませんでした")));
  }, [kind, contentId]);

  const select = (historyId: number) => {
    getVersion(historyId)
      .then(setVersion)
      .catch((e) => setError(errorMessage(e, "履歴を読み込めませんでした")));
  };

  return (
    <Dialog
      open={contentId !== null}
      title={
        <span className="flex items-center gap-2">
          <History size={18} />
          変更履歴
        </span>
      }
      description="保存した版を新しい順に残しています（100 件まで）。「この版にする」で編集中の内容になり、保存すると戻ります"
      onClose={onClose}
      className="max-w-4xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            閉じる
          </Button>
          <Button
            disabled={!version}
            onClick={() => {
              if (version) {
                onLoad(version);
              }
            }}
          >
            <RotateCcw size={16} />
            この版にする
          </Button>
        </>
      }
    >
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだ履歴はありません。保存すると版が残ります</p>
      ) : (
        <div className="flex h-[60vh] gap-3">
          <ul className="w-56 shrink-0 overflow-y-auto rounded-lg border border-border">
            {items.map((item, index) => (
              <li key={item.historyId}>
                <button
                  type="button"
                  onClick={() => select(item.historyId)}
                  className={twMerge(
                    "w-full border-b border-border/60 px-3 py-2 text-left text-sm hover:bg-accent",
                    version?.historyId === item.historyId && "bg-accent",
                  )}
                >
                  <span className="block font-medium tabular-nums">
                    {formatDateTime(item.savedAt)}
                    {index === 0 && <span className="ml-1.5 text-[0.6875rem] font-normal text-brand">最新</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.updatedBy}・{item.length} 文字
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 flex-1 overflow-y-auto rounded-lg border border-border p-4" data-color-mode={resolved}>
            {version ? (
              <>
                <h3 className="mb-3 text-lg font-semibold">{version.title}</h3>
                <ContentMarkdown source={version.content} />
              </>
            ) : (
              <Spinner />
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
