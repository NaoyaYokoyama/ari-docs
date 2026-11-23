import { History, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";

import { getHistory, getVersion, type HistoryItem, type HistoryVersion } from "@/api/history";
import { useTheme } from "@/app/theme";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import Spinner from "@/components/common/Spinner";
import { errorMessage, formatDateTime } from "@/lib/format";
import TextCompare from "@/pages/compare/TextCompare";
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
  // 右に出すもの: 版の中身 / ひとつ前の版との違い（FN0402-BR07）
  const [view, setView] = useState<"content" | "diff">("content");
  const [previous, setPrevious] = useState<HistoryVersion | null>(null);

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

  // 選んだ版のひとつ前（古い方）の版。違いを出すときだけ読む
  const previousId = useMemo(() => {
    const index = items?.findIndex((item) => item.historyId === version?.historyId) ?? -1;
    return index >= 0 ? (items?.[index + 1]?.historyId ?? null) : null;
  }, [items, version]);
  useEffect(() => {
    setPrevious(null);
    if (view !== "diff" || previousId === null) {
      return;
    }
    let alive = true;
    getVersion(previousId)
      .then((loaded) => alive && setPrevious(loaded))
      .catch((e) => alive && setError(errorMessage(e, "履歴を読み込めませんでした")));
    return () => {
      alive = false;
    };
  }, [view, previousId]);

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
      className="max-w-6xl"
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
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div role="radiogroup" aria-label="表示" className="flex gap-1 self-end rounded-md border border-border p-0.5 text-xs">
              {(
                [
                  ["content", "中身"],
                  ["diff", "前の版との違い"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={view === value}
                  onClick={() => setView(value)}
                  className={twMerge(
                    "rounded px-2.5 py-1 text-muted-foreground hover:text-foreground",
                    view === value && "bg-accent font-medium text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              className={twMerge(
                "min-h-0 flex-1 rounded-lg border border-border p-4",
                view === "content" ? "overflow-y-auto" : "flex flex-col",
              )}
              data-color-mode={resolved}
            >
              {!version ? (
                <Spinner />
              ) : view === "content" ? (
                <>
                  <h3 className="mb-3 text-lg font-semibold">{version.title}</h3>
                  <ContentMarkdown source={version.content} />
                </>
              ) : previousId === null ? (
                <p className="text-sm text-muted-foreground">これがいちばん古い版です（比べる前の版がありません）</p>
              ) : !previous ? (
                <Spinner />
              ) : (
                <VersionDiff before={previous} after={version} />
              )}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ひとつ前の版との違い。左に前の版、右に選んだ版を並べ、変わった文字に色を付ける（比べる画面と同じ。FN0304）
function VersionDiff({ before, after }: { before: HistoryVersion; after: HistoryVersion }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 text-sm">
      {before.title !== after.title && (
        <p>
          タイトル: <del className="text-destructive">{before.title}</del> →{" "}
          <ins className="text-place-green no-underline">{after.title}</ins>
        </p>
      )}
      <TextCompare
        left={before.content}
        right={after.content}
        leftLabel={`${formatDateTime(before.savedAt)} の版（前）`}
        rightLabel={`${formatDateTime(after.savedAt)} の版`}
        className="flex-1"
      />
    </div>
  );
}
