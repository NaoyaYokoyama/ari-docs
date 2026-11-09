// Markdown の書式の操作（FN0404）。本文・選んでいる範囲から、置き換える範囲と新しい選択を求める。
// エディタ（textarea・Vim のエディタ）には依存しない（editorHandle.ts で当てる）
import { formatTableAt } from "@/pages/content/markdown/table";

export type Selection = { text: string; from: number; to: number };

// text の from〜to を insert に置き換え、置き換えたあとの selectFrom〜selectTo を選ぶ
export type Change = { from: number; to: number; insert: string; selectFrom: number; selectTo: number };

export type MarkdownCommandId =
  | "heading"
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "link"
  | "quote"
  | "codeBlock"
  | "hr"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "table"
  | "formatTable";

// 文字を記号で囲む（太字など）。囲んであれば外す。選んでいなければ見本の文字を入れて選ぶ
function toggleWrap({ text, from, to }: Selection, marker: string, placeholder: string): Change {
  const m = marker.length;
  const before = text.slice(from - m, from);
  const after = text.slice(to, to + m);
  // 斜体（*）を、太字（**）の * と取り違えない
  const single = (index: number) => m > 1 || text[index] !== marker;
  if (before === marker && after === marker && single(from - m - 1) && single(to + m)) {
    return { from: from - m, to: to + m, insert: text.slice(from, to), selectFrom: from - m, selectTo: to - m };
  }
  const selected = text.slice(from, to);
  if (selected.length > 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(m, -m);
    return { from, to, insert: inner, selectFrom: from, selectTo: from + inner.length };
  }
  const inner = selected || placeholder;
  return {
    from,
    to,
    insert: marker + inner + marker,
    selectFrom: from + m,
    selectTo: from + m + inner.length,
  };
}

function link({ text, from, to }: Selection): Change {
  const selected = text.slice(from, to);
  if (/^https?:\/\/\S+$/.test(selected)) {
    // URL を選んでいたら、表示する文字を入れてもらう
    return { from, to, insert: `[リンク](${selected})`, selectFrom: from + 1, selectTo: from + 4 };
  }
  const label = selected || "リンク";
  const insert = `[${label}](https://)`;
  const urlStart = from + label.length + 3;
  return { from, to, insert, selectFrom: urlStart, selectTo: urlStart + "https://".length };
}

// 選んでいる行の範囲（行の頭から行の終わりまで）
function lineRange({ text, from, to }: Selection) {
  const start = text.lastIndexOf("\n", from - 1) + 1;
  // 次の行の頭まで選んでいるときは、その行を含めない
  const end0 = to > from && text[to - 1] === "\n" ? to - 1 : to;
  const newline = text.indexOf("\n", end0);
  const end = newline === -1 ? text.length : newline;
  return { start, end };
}

const LIST_PREFIX = /^(\s*)(?:[-*+] \[[ xX]\] |[-*+] |\d+[.)] )/;

// 行の頭に記号を付ける（引用・箇条書き）。すべての行に付いていれば外す
function toggleLinePrefix(selection: Selection, kind: "quote" | "bullet" | "ordered" | "task"): Change {
  const { start, end } = lineRange(selection);
  const lines = selection.text.slice(start, end).split("\n");
  const patterns = {
    quote: /^(\s*)> ?/,
    bullet: /^(\s*)[-*+] (?!\[[ xX]\] )/,
    ordered: /^(\s*)\d+[.)] /,
    task: /^(\s*)[-*+] \[[ xX]\] /,
  };
  const pattern = patterns[kind];
  const target = lines.filter((line) => line.trim() !== "" || lines.length === 1);
  const remove = target.length > 0 && target.every((line) => pattern.test(line));
  let number = 0;
  const next = lines.map((line) => {
    if (remove) {
      return line.replace(pattern, "$1");
    }
    if (line.trim() === "" && lines.length > 1) {
      return line;
    }
    if (kind === "quote") {
      return `> ${line}`;
    }
    // ほかの箇条書きの記号は付け替える
    const [, indent = ""] = /^(\s*)/.exec(line) ?? [];
    const body = line.replace(LIST_PREFIX, "").replace(/^\s*/, "");
    number += 1;
    const mark = kind === "bullet" ? "- " : kind === "task" ? "- [ ] " : `${number}. `;
    return indent + mark + body;
  });
  const insert = next.join("\n");
  // 1 行だけで何も選んでいないときは、カーソルを行の終わりへ（続けて書けるように）
  const caret = selection.from === selection.to && lines.length === 1;
  return {
    from: start,
    to: end,
    insert,
    selectFrom: caret ? start + insert.length : start,
    selectTo: start + insert.length,
  };
}

// 見出し: 押すたびに # → ## → ### → なし
function cycleHeading(selection: Selection): Change {
  const { start, end } = lineRange({ ...selection, to: selection.from });
  const line = selection.text.slice(start, end);
  const [, hashes = ""] = /^(#{1,6}) /.exec(line) ?? [];
  const body = line.replace(/^#{1,6} /, "");
  const level = hashes.length >= 3 ? 0 : hashes.length + 1;
  const insert = (level ? `${"#".repeat(level)} ` : "") + body;
  return { from: start, to: end, insert, selectFrom: start + insert.length, selectTo: start + insert.length };
}

// 前後に空の行を置いて、ひとかたまりで入れる（コードブロック・区切り線・表）
function insertBlock({ text, from, to }: Selection, block: string, select: [number, number]): Change {
  const before = text.slice(0, from);
  const after = text.slice(to);
  const lead = before === "" ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after === "" || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const insert = lead + block + trail;
  const base = from + lead.length;
  return { from, to, insert, selectFrom: base + select[0], selectTo: base + select[1] };
}

function codeBlock(selection: Selection): Change {
  const selected = selection.text.slice(selection.from, selection.to);
  const body = selected.replace(/\n$/, "");
  const block = "```\n" + body + "\n```";
  return insertBlock(selection, block, [4, 4 + body.length]);
}

const TABLE_TEMPLATE = ["| 見出し1 | 見出し2 | 見出し3 |", "| --- | --- | --- |", "|  |  |  |", "|  |  |  |"].join("\n");

function insertTable(selection: Selection): Change {
  const block = formatTableAt(TABLE_TEMPLATE, 0)?.text ?? TABLE_TEMPLATE;
  return insertBlock(selection, block, [2, 2 + "見出し1".length]);
}

function formatTable(selection: Selection): Change | null {
  const result = formatTableAt(selection.text, selection.from);
  if (!result) {
    return null;
  }
  return {
    from: result.from,
    to: result.to,
    insert: result.text,
    selectFrom: result.caret,
    selectTo: result.caret,
  };
}

// 書式を当てる。当てられないとき（表の外で「表を整える」など）は null
export function runMarkdownCommand(id: MarkdownCommandId, selection: Selection): Change | null {
  switch (id) {
    case "heading":
      return cycleHeading(selection);
    case "bold":
      return toggleWrap(selection, "**", "太字");
    case "italic":
      return toggleWrap(selection, "*", "斜体");
    case "strike":
      return toggleWrap(selection, "~~", "取り消し");
    case "code":
      return toggleWrap(selection, "`", "コード");
    case "link":
      return link(selection);
    case "quote":
      return toggleLinePrefix(selection, "quote");
    case "bulletList":
      return toggleLinePrefix(selection, "bullet");
    case "orderedList":
      return toggleLinePrefix(selection, "ordered");
    case "taskList":
      return toggleLinePrefix(selection, "task");
    case "codeBlock":
      return codeBlock(selection);
    case "hr":
      return insertBlock(selection, "---", [3, 3]);
    case "table":
      return insertTable(selection);
    case "formatTable":
      return formatTable(selection);
  }
}

// 画像（![説明](URL)）を入れる。行の途中なら前で改行する
export function insertImages(selection: Selection, images: { alt: string; url: string }[]): Change {
  const { text, from, to } = selection;
  const lines = images.map((image) => `![${image.alt.replace(/[[\]]/g, "")}](${image.url})`).join("\n");
  // 行の途中なら改行する。表のすぐ下なら空の行を挟む（続けて書くと表の行になってしまうため）
  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  const atLineStart = from === lineStart;
  const previousLine = atLineStart
    ? text.slice(text.lastIndexOf("\n", lineStart - 2) + 1, Math.max(0, lineStart - 1))
    : text.slice(lineStart, from);
  const afterTable = from > 0 && previousLine.trimStart().startsWith("|");
  const lead = (atLineStart ? "" : "\n") + (afterTable ? "\n" : "");
  const insert = lead + lines;
  return { from, to, insert, selectFrom: from + insert.length, selectTo: from + insert.length };
}
