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
