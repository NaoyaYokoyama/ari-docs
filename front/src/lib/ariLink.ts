// ari-docs の中のリンク（FN0004）。ファイル・フォルダ・Wiki・Note の場所を、ほかの人へ文字で渡して、
// 探して開く（Ctrl+P）に貼るか、Note・Wiki の本文のリンクを押すと、同じ ari-docs の中でそこへ移る。
// PC の絶対パスではなく、folder/ からの相対パス・Wiki と Note の ID で指す（共有サーバーなら誰の PC でも同じ）
//
//   ari://folder/{パス}   フォルダ（中を開く）
//   ari://file/{パス}     ファイル（入っているフォルダを開いて選ぶ）
//   ari://wiki/{wikiId}
//   ari://note/{noteId}   （本人しか開けない）
//
// パスは読めるように日本語はそのまま書き、空白・括弧など、チャットや Markdown のリンクで切れる文字だけを %xx にする

export type AriLink =
  | { kind: "folder" | "file"; path: string }
  | { kind: "wiki" | "note"; id: string };

export const ARI_LINK_PREFIX = "ari://";

// %xx にする文字（% 自身・空白・Markdown のリンクや URL の区切りになるもの）
const ESCAPE = /[%\s()[\]<>#?"'`\\]/g;

// encodeURIComponent は ( ) ' を %xx にしないので、ASCII の文字は自分で変える（全角の空白などは encodeURIComponent）
function escapeChar(char: string) {
  const code = char.charCodeAt(0);
  return code < 0x80 ? `%${code.toString(16).toUpperCase().padStart(2, "0")}` : encodeURIComponent(char);
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((segment) => segment.replace(ESCAPE, escapeChar))
    .join("/");
}

export function toAriLink(link: AriLink) {
  if ("path" in link) {
    return `${ARI_LINK_PREFIX}${link.kind}/${encodePath(link.path)}`;
  }
  return `${ARI_LINK_PREFIX}${link.kind}/${link.id}`;
}

// 1 つのリンクだけが書かれていれば、その中身。前後の空白・<> は除く
export function parseAriLink(text: string): AriLink | null {
  const value = text.trim().replace(/^<(.*)>$/, "$1");
  const match = /^ari:\/\/(folder|file|wiki|note)\/(.*)$/i.exec(value);
  if (!match || /\s/.test(match[2])) {
    return null;
  }
  const kind = match[1].toLowerCase() as AriLink["kind"];
  let rest: string;
  try {
    rest = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (kind === "folder" || kind === "file") {
    // 前後の / を除く。.. ・絶対パスはサーバーでも 400 にするが、ここでも開かない
    const path = rest.replace(/^\/+|\/+$/g, "");
    if (path.split("/").some((segment) => segment === "..") || (kind === "file" && !path)) {
      return null;
    }
    return { kind, path };
  }
  const id = rest.replace(/\/+$/, "");
  return /^[A-Za-z0-9_-]+$/.test(id) ? { kind, id } : null;
}

// 画面の中で見せる名前（ノードは最後の名前、Wiki・Note は種類）
export function ariLinkLabel(link: AriLink) {
  if ("path" in link) {
    return link.path.split("/").pop() || "folder";
  }
  return link.kind === "wiki" ? "Wiki" : "Note";
}

// そこへ移るときの画面と state（react-router の navigate に渡す）
export function ariLinkTarget(link: AriLink): { path: string; state: Record<string, unknown> } {
  switch (link.kind) {
    case "wiki":
      return { path: "/wiki", state: { wikiId: link.id } };
    case "note":
      return { path: "/note", state: { noteId: link.id } };
    case "folder":
      return { path: "/folder", state: { nodePath: link.path, nodeAction: "open" } };
    case "file":
      // ファイルは OS のアプリで開かず、入っているフォルダで選ぶ（右のプレビューで中身が見える）
      return { path: "/folder", state: { nodePath: link.path, nodeAction: "select" } };
  }
}
