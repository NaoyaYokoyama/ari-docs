import { ArrowLeftRight, File, Folder, GitCompare } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { twMerge } from "tailwind-merge";

import { compareFiles, compareFolders } from "@/api/compare";
import Button from "@/components/common/Button";
import Spinner from "@/components/common/Spinner";
import { formatSize } from "@/lib/fileType";
import { errorMessage } from "@/lib/format";
import { compareUrl } from "@/pages/compare/compareBase";
import SheetCompare from "@/pages/compare/SheetCompare";
import TextCompare from "@/pages/compare/TextCompare";
import type { FileCompare, FolderCompare, FolderEntry } from "@/types/compare";

// 比べる画面（FN0304・SCR0302）。Folder で選んだ 2 つのファイル・フォルダの違いを出す。
// URL は /compare?mode=files|folders&left=<パス>&right=<パス>
export default function ComparePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const folders = params.get("mode") === "folders";
  const left = params.get("left") ?? "";
  const right = params.get("right") ?? "";
  const [file, setFile] = useState<FileCompare | null>(null);
  const [folder, setFolder] = useState<FolderCompare | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setFile(null);
    setFolder(null);
    setError("");
    const request = folders
      ? compareFolders(left, right).then((result) => alive && setFolder(result))
      : compareFiles(left, right).then((result) => alive && setFile(result));
    request.catch((e) => alive && setError(errorMessage(e, "比べられませんでした")));
    return () => {
      alive = false;
    };
  }, [folders, left, right]);

  const Icon = folders ? Folder : File;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <GitCompare size={20} className="text-brand" />
        <h1 className="text-lg font-semibold">比べる</h1>
        <span className="flex min-w-0 items-center gap-1.5 text-sm">
          <Icon size={15} className="shrink-0 text-muted-foreground" />
          <span className="truncate font-mono" title={left}>
            {left}
          </span>
          <span className="text-muted-foreground">と</span>
          <span className="truncate font-mono" title={right}>
            {right}
          </span>
        </span>
        <span className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => navigate(compareUrl(folders, right, left), { replace: true })}>
          <ArrowLeftRight size={15} />
          左右を入れ替える
        </Button>
        <Button size="sm" variant="secondary" onClick={() => navigate(-1)}>
          戻る
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : folders ? (
        folder ? (
          <FolderResult result={folder} left={left} right={right} />
        ) : (
          <Spinner label="比べています..." />
        )
      ) : file ? (
        <FileResult result={file} left={left} right={right} />
      ) : (
        <Spinner label="比べています..." />
      )}
    </div>
  );
}

function FileResult({ result, left, right }: { result: FileCompare; left: string; right: string }) {
  if (result.kind === "text") {
    return <TextCompare left={result.left} right={result.right} leftLabel={left} rightLabel={right} className="flex-1" />;
  }
  if (result.kind === "sheets") {
    return <SheetCompare sheets={result.sheets} leftLabel={left} rightLabel={right} />;
  }
  return (
    <div className="rounded-lg border border-border p-4 text-sm">
      <p className={twMerge("font-medium", result.same ? "text-place-green" : "text-warning")}>
        {result.same ? "中身はまったく同じです" : "中身が違います"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        この形式は中身を並べて比べられないため、同じかどうかだけを調べました（左 {formatSize(result.leftSize)}・右{" "}
        {formatSize(result.rightSize)}）
      </p>
    </div>
  );
}

const STATUS_LABEL: Record<FolderEntry["status"], string> = {
  same: "同じ",
  changed: "違う",
  onlyLeft: "左だけ",
  onlyRight: "右だけ",
};

const STATUS_CLASS: Record<FolderEntry["status"], string> = {
  same: "text-muted-foreground",
  changed: "bg-warning/15",
  onlyLeft: "bg-destructive/10",
  onlyRight: "bg-place-green/15",
};

function joinPath(base: string, path: string) {
  return base ? `${base}/${path}` : path;
}

// フォルダの比べた結果。違うファイルを押すと、そのファイルどうしを比べる
function FolderResult({ result, left, right }: { result: FolderCompare; left: string; right: string }) {
  const navigate = useNavigate();
  const [onlyDiff, setOnlyDiff] = useState(true);
  const counts = { same: 0, changed: 0, onlyLeft: 0, onlyRight: 0 };
  result.entries.forEach((entry) => {
    if (!entry.isDir || entry.status !== "same") {
      counts[entry.status]++;
    }
  });
  const entries = result.entries.filter((entry) => (onlyDiff ? entry.status !== "same" : true));
  const different = counts.changed + counts.onlyLeft + counts.onlyRight;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {different === 0 ? (
          <span className="font-medium text-place-green">中のファイルはすべて同じです</span>
        ) : (
          <span>
            違うものが <strong>{different}</strong> 件あります
            <span className="ml-2 text-xs text-muted-foreground">
              違う {counts.changed}・左だけ {counts.onlyLeft}・右だけ {counts.onlyRight}・同じ {counts.same}
            </span>
          </span>
        )}
        {result.truncated && <span className="text-xs text-warning">ファイルが多いので、5000 件までを比べています</span>}
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="accent-brand" />
          違うものだけ
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-muted text-left text-xs">
            <tr>
              <th className="px-3 py-1.5">名前</th>
              <th className="w-24 px-3 py-1.5">結果</th>
              <th className="w-28 px-3 py-1.5 text-right">左の大きさ</th>
              <th className="w-28 px-3 py-1.5 text-right">右の大きさ</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const canOpen = entry.status === "changed" && !entry.isDir && entry.leftSize !== null && entry.rightSize !== null;
              return (
                <tr key={entry.path} className={twMerge("border-t border-border/60", STATUS_CLASS[entry.status])}>
                  <td className="px-3 py-1">
                    <span className="flex items-center gap-2">
                      {entry.isDir ? (
                        <Folder size={15} className="shrink-0 text-muted-foreground" />
                      ) : (
                        <File size={15} className="shrink-0 text-muted-foreground" />
                      )}
                      {canOpen ? (
                        <button
                          type="button"
                          className="truncate text-left underline decoration-dotted underline-offset-2 hover:text-brand"
                          title="このファイルどうしを比べる"
                          onClick={() =>
                            navigate(compareUrl(false, joinPath(left, entry.path), joinPath(right, entry.path)))
                          }
                        >
                          {entry.path}
                        </button>
                      ) : (
                        <span className="truncate">{entry.path}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-1">{STATUS_LABEL[entry.status]}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{entry.leftSize !== null ? formatSize(entry.leftSize) : ""}</td>
                  <td className="px-3 py-1 text-right tabular-nums">
                    {entry.rightSize !== null ? formatSize(entry.rightSize) : ""}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                  違うものはありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
