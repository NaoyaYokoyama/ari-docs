import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { getFormats } from "@/api/search";
import { useApp } from "@/app/AppContext";
import Spinner from "@/components/common/Spinner";
import { formatSize } from "@/lib/fileType";
import { errorMessage } from "@/lib/format";
import { MAX_PREVIEW_BYTES, PREVIEW_FORMATS } from "@/lib/previewFormats";
import { SettingCard, SettingPanel } from "@/pages/setting/SettingPanel";
import type { FormatsResponse } from "@/types/search";

type Row = { name: string; extensions: string[]; note?: string };

// 対応するファイルの一覧（docs の 0030_対応するファイル）。
// 中身の検索はサーバーが決めた形式（API0208）、プレビューは画面の定義（previewFormats.ts）をそのまま出す
export default function SupportedFiles() {
  const { showMessage } = useApp();
  const [formats, setFormats] = useState<FormatsResponse | null>(null);

  useEffect(() => {
    getFormats()
      .then(setFormats)
      .catch((error) => {
        console.error(error);
        showMessage("error", errorMessage(error, "対応するファイルの一覧を取得できませんでした"));
      });
  }, [showMessage]);

  return (
    <SettingPanel
      title="対応するファイル"
      description="ファイル名・フォルダ名での検索は、すべてのファイルが対象です。ここでは、中身で検索できるファイルと、Folder でプレビュー（Space）できるファイルを示します"
      plain
    >
      <SettingCard
        title="中身で検索できるファイル"
        description={
          formats
            ? `${formatSize(formats.maxFileBytes)} を超えるファイルは対象外です。取り出した文字は ${formats.maxChars.toLocaleString()} 文字までを使います。保存してから検索できるようになるまで、1 分ほどかかります`
            : undefined
        }
      >
        {formats ? <FormatTable rows={searchRows(formats)} /> : <Spinner />}
      </SettingCard>

      {formats && <OcrCard formats={formats} />}

      <SettingCard
        title="プレビューできるファイル"
        description={`${formatSize(MAX_PREVIEW_BYTES)} を超えるファイルはプレビューしません。そのほかのファイルは「開く」（PC のアプリ）か「ダウンロード」を使います`}
      >
        <FormatTable rows={PREVIEW_FORMATS} />
      </SettingCard>

      <SettingCard title="対応していないもの">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>古い形式の Word・PowerPoint（.doc・.ppt）、一太郎（.jtd）、Visio の中身の検索</li>
          <li>古い形式の Excel（.xls）と OpenDocument の表計算の、図形・コメント・貼り付けた画像</li>
          <li>手書きの文字・とても小さい文字（文字認識で読めないことがあります）</li>
          <li>パスワードのかかった PDF</li>
          <li>Office に貼り付けた EMF・WMF 形式の図（Office の図形の写しなど）</li>
          <li>Excel・Word・PowerPoint のプレビュー（「開く」で PC のアプリで開きます）</li>
        </ul>
      </SettingCard>
    </SettingPanel>
  );
}

// 形式ごとに読むところ（文字認識を使えるときは貼り付けた画像なども。FN0202-BR03・BR14）
const READS: Record<string, { text: string; ocr?: string }> = {
  Excel: { text: "セル・シート名・図形・テキストボックス・コメント", ocr: "・貼り付けた画像" },
  Word: { text: "本文・表・ヘッダー・フッター・コメント", ocr: "・貼り付けた画像" },
  PowerPoint: { text: "スライド・ノート", ocr: "・貼り付けた画像" },
  PDF: { text: "文字", ocr: "・スキャンしたページ・貼り付けた画像" },
};

function searchRows(formats: FormatsResponse): Row[] {
  const rows = formats.groups.map((group) => {
    const reads = READS[group.name];
    return reads
      ? { ...group, note: reads.text + (formats.ocr.available && reads.ocr ? reads.ocr : "") }
      : group;
  });
  return formats.ocr.available
    ? [...rows, { name: "画像", extensions: formats.ocrImageExtensions, note: "文字認識で読む" }]
    : rows;
}

// 画像の中の文字（文字認識。FN0202-BR14）。アプリに組み込んだ PaddleOCR を使う（モデルは models フォルダ）
function OcrCard({ formats }: { formats: FormatsResponse }) {
  const { ocr } = formats;
  return (
    <SettingCard
      title="画像の中の文字（文字認識）"
      description="スキャンした PDF のページ（白黒の複合機の形式・文字を図形にしたものも）、PDF・Excel・Word・PowerPoint に貼り付けた画像、画像ファイルの文字を読んで検索できるようにします。1 ページ 1 秒ほどかかるので、ほかのファイルの後に裏で取り込みます"
    >
      {ocr.available ? (
        <p className="flex items-center gap-2 text-sm">
          <CircleCheck size={16} className="shrink-0 text-success" />
          使えます（{ocr.message}。アプリに組み込み）
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <CircleAlert size={16} className="shrink-0 text-warning" />
            使えません: {ocr.message}
          </p>
          <p className="text-xs text-muted-foreground">
            ari-docs と一緒に配っている models フォルダを置き（共有サーバーは exe の横、または config.toml の{" "}
            <code>ocr_models_dir</code>）、起動し直すと使えます
          </p>
        </div>
      )}
    </SettingCard>
  );
}

function FormatTable({ rows }: { rows: Row[] }) {
  return (
    <dl className="-my-2 divide-y divide-border">
      {rows.map((row) => (
        <div key={row.name} className="grid gap-1 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <dt className="text-sm font-medium">
            {row.name}
            {row.note && <span className="block text-xs font-normal text-muted-foreground">{row.note}</span>}
          </dt>
          <dd className="flex flex-wrap content-start items-start gap-1">
            {row.extensions.map((extension) => (
              <code
                key={extension}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
              >
                .{extension}
              </code>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
