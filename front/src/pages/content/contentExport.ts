import { getBlob } from "@/api/client";
import { CONTENT_IMAGE_PREFIX } from "@/api/contentImage";
import { saveBlob } from "@/lib/download";

// Note・Wiki の書き出し（FN0401-BR18）

// ファイル名に使えない文字を _ にする（Windows でも保存できるように）
export function exportFileName(title: string, extension: string) {
  const base =
    [...title]
      .map((c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? "_" : c))
      .join("")
      .trim() || "無題";
  return `${base}.${extension}`;
}

function toDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// 貼り付けた画像（/api/content-image/…。ログインが要る）を、ファイルの中に埋め込む（ari-docs の外で開いても画像が出るように）。
// 読めなかった画像はそのまま残す
export async function embedImages(markdown: string) {
  const pattern = new RegExp(`${CONTENT_IMAGE_PREFIX.replace(/\//g, "\\/")}[A-Za-z0-9_-]+`, "g");
  const sources = [...new Set(markdown.match(pattern) ?? [])];
  const urls = new Map<string, string>();
  await Promise.all(
    sources.map(async (src) => {
      try {
        urls.set(src, await toDataUrl(await getBlob(src)));
      } catch {
        // 読めなければ元のまま
      }
    }),
  );
  return markdown.replace(pattern, (src) => urls.get(src) ?? src);
}

// Markdown のファイルで保存する。タイトルを見出しにして本文の前に置く。キャンセルしたら false
export async function saveAsMarkdown(title: string, content: string) {
  const body = await embedImages(content);
  const text = `# ${title}\n\n${body.trim()}\n`;
  return saveBlob(exportFileName(title, "md"), new Blob([text], { type: "text/markdown;charset=utf-8" }));
}

// HTML のファイルの見た目（ファイルの中に入れる。ほかの PC・ブラウザでもそのまま見られるように）
const HTML_STYLE = `
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#1f2328;font-family:"Segoe UI","Yu Gothic UI","Meiryo","Hiragino Sans","Noto Sans JP",sans-serif;font-size:15px;line-height:1.7}
main{max-width:860px;margin:0 auto;padding:32px 24px}
.title{margin:0 0 4px;padding:0;border:0;font-size:26px}
.meta{margin:0 0 24px;padding-bottom:8px;border-bottom:1px solid #d0d7de;color:#59636e;font-size:12px}
h1,h2,h3,h4,h5,h6{margin:24px 0 12px;line-height:1.3}
h1,h2{padding-bottom:6px;border-bottom:1px solid #d0d7de}
h1{font-size:24px}h2{font-size:20px}h3{font-size:17px}
p,ul,ol,table,pre,blockquote,details{margin:0 0 14px}
ul,ol{padding-left:2em}
li.task-list-item{list-style:none}
li.task-list-item input{margin:0 .4em 0 -1.4em}
a{color:#0969da}
img{max-width:100%}
hr{border:0;border-top:1px solid #d0d7de;margin:20px 0}
table{border-collapse:collapse}
th,td{border:1px solid #d0d7de;padding:6px 12px}
th{background:#f6f8fa}
code{font-family:Consolas,"BIZ UDGothic","MS Gothic",monospace;font-size:.9em;background:#eff1f3;padding:.1em .35em;border-radius:4px}
pre{background:#f6f8fa;padding:12px 16px;border-radius:6px;overflow:auto;white-space:pre-wrap;word-break:break-all}
pre code{background:none;padding:0}
blockquote{margin-left:0;padding:0 1em;color:#59636e;border-left:4px solid #d0d7de}
.markdown-alert{padding:4px 16px;border-left:4px solid #d0d7de}
.markdown-alert-title{display:flex;align-items:center;gap:6px;font-weight:600}
.markdown-alert svg{fill:currentColor}
.markdown-alert-note{border-color:#0969da}.markdown-alert-note .markdown-alert-title{color:#0969da}
.markdown-alert-tip{border-color:#1a7f37}.markdown-alert-tip .markdown-alert-title{color:#1a7f37}
.markdown-alert-important{border-color:#8250df}.markdown-alert-important .markdown-alert-title{color:#8250df}
.markdown-alert-warning{border-color:#9a6700}.markdown-alert-warning .markdown-alert-title{color:#9a6700}
.markdown-alert-caution{border-color:#d1242f}.markdown-alert-caution .markdown-alert-title{color:#d1242f}
.token.comment,.token.prolog{color:#59636e}
.token.keyword,.token.boolean,.token.important{color:#cf222e}
.token.string,.token.char,.token.regex{color:#0a3069}
.token.number,.token.operator,.token.property,.token.attr-name,.token.constant{color:#0550ae}
.token.function,.token.class-name{color:#8250df}
.token.builtin,.token.tag,.token.selector{color:#116329}
.diagram{text-align:center;margin:0 0 14px}
.diagram svg{max-width:100%;height:auto}
@media print{main{padding:0;max-width:none}@page{margin:15mm}pre,table,img,svg,.markdown-alert{break-inside:avoid}}
`;

function escapeHtml(text: string) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

// 描いた本文（ExportView）から、1 つで完結する HTML を作る。画像はファイルの中に埋め込む。
// print なら開いたときに印刷の画面を出す（ブラウザで印刷・PDF に保存する）
export async function buildHtml(title: string, meta: string, rendered: HTMLElement, print: boolean) {
  const body = (rendered.querySelector(".wmde-markdown") ?? rendered).cloneNode(true) as HTMLElement;
  // 画面のためのもの（コードのコピーのボタン・見出しのリンク）を除く
  body.querySelectorAll(".copied, a.anchor").forEach((element) => element.remove());
  // 図（mermaid）は真ん中に置く
  body.querySelectorAll("svg[id^=mermaid]").forEach((svg) => svg.parentElement?.setAttribute("class", "diagram"));
  await Promise.all(
    [...body.querySelectorAll("img")].map(async (img) => {
      img.removeAttribute("loading");
      const src = img.getAttribute("src") ?? "";
      if (src.startsWith("blob:")) {
        try {
          img.setAttribute("src", await toDataUrl(await (await fetch(src)).blob()));
        } catch {
          img.removeAttribute("src");
        }
      }
    }),
  );
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${HTML_STYLE}</style>
</head>
<body>
<main>
<h1 class="title">${escapeHtml(title)}</h1>
<p class="meta">${escapeHtml(meta)}</p>
${body.innerHTML}
</main>${print ? "\n<script>window.addEventListener(\"load\", () => setTimeout(() => window.print(), 300));</script>" : ""}
</body>
</html>
`;
}

export function htmlBlob(html: string) {
  return new Blob([html], { type: "text/html;charset=utf-8" });
}
