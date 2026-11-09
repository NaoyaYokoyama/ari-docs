// Markdown の表を整える（FN0404-BR03）。| の位置をそろえ、見た目でも表と分かるようにする。
// 日本語（全角）の文字は半角 2 文字分の幅として数える

type Align = "left" | "center" | "right" | "none";

// 全角で表示する文字か（East Asian Width の W・F をおおまかに）
function isWide(code: number) {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) ||
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

export function displayWidth(text: string) {
  let width = 0;
  for (const char of text) {
    width += isWide(char.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return width;
}

function isTableLine(line: string) {
  return line.trimStart().startsWith("|");
}

// 行をセルに分ける。\| とコード（`…`）の中の | では分けない。各セルの元の行の中での始まりも返す
function splitCells(line: string) {
  const cells: { text: string; start: number }[] = [];
  let current = "";
  let start = 0;
  let inCode = false;
  const body = line.trimEnd();
  const lead = body.length - body.trimStart().length;
  for (let i = lead; i < body.length; i++) {
    const char = body[i];
    if (char === "\\" && i + 1 < body.length) {
      current += char + body[i + 1];
      i++;
      continue;
    }
    if (char === "`") {
      inCode = !inCode;
    }
    if (char === "|" && !inCode) {
      if (i > lead) {
        cells.push({ text: current, start });
      }
      current = "";
      start = i + 1;
      continue;
    }
    current += char;
  }
  // 最後の | の後ろに文字があれば、それもセル（| で閉じていない行）
  if (current.trim() !== "") {
    cells.push({ text: current, start });
  }
  return cells;
}

const SEPARATOR_CELL = /^\s*:?-+:?\s*$/;

function alignOf(cell: string): Align {
  const text = cell.trim();
  const left = text.startsWith(":");
  const right = text.endsWith(":");
  return left && right ? "center" : right ? "right" : left ? "left" : "none";
}

function pad(text: string, width: number, align: Align) {
  const space = width - displayWidth(text);
  if (align === "right") {
    return " ".repeat(space) + text;
  }
  if (align === "center") {
    const left = Math.floor(space / 2);
    return " ".repeat(left) + text + " ".repeat(space - left);
  }
  return text + " ".repeat(space);
}

function separator(width: number, align: Align) {
  switch (align) {
    case "center":
      return `:${"-".repeat(width - 2)}:`;
    case "right":
      return `${"-".repeat(width - 1)}:`;
    case "left":
      return `:${"-".repeat(width - 1)}`;
    default:
      return "-".repeat(width);
  }
}

// position（文字の位置）を含む表を整える。表の外なら null。
// from〜to を text に置き換え、caret は整えたあとのカーソルの位置（同じセルの同じ文字の所）
export function formatTableAt(source: string, position: number) {
  const lines = source.split("\n");
  // position のある行
  let offset = 0;
  let row = 0;
  while (row < lines.length - 1 && offset + lines[row].length < position) {
    offset += lines[row].length + 1;
    row++;
  }
  if (!isTableLine(lines[row] ?? "")) {
    return null;
  }
  let first = row;
  while (first > 0 && isTableLine(lines[first - 1])) {
    first--;
  }
  let last = row;
  while (last < lines.length - 1 && isTableLine(lines[last + 1])) {
    last++;
  }
  const from = lines.slice(0, first).reduce((sum, line) => sum + line.length + 1, 0);
  const to = from + lines.slice(first, last + 1).join("\n").length;

  // カーソルのあるセルと、セルの中の文字の位置（前後の空白を除いた文字の中で）
  const caretLine = lines[row];
  const caretColumn = position - offset;
  const caretCells = splitCells(caretLine);
  let caretCell = caretCells.findLastIndex((cell) => cell.start <= caretColumn);
  if (caretCell < 0) {
    caretCell = 0;
  }
  const caretRaw = caretCells[caretCell];
  const caretInCell = caretRaw
    ? Math.max(0, Math.min(caretColumn - caretRaw.start - (caretRaw.text.length - caretRaw.text.trimStart().length), caretRaw.text.trim().length))
    : 0;

  let rows = lines.slice(first, last + 1).map((line) => splitCells(line).map((cell) => cell.text.trim()));
  let caretRow = row - first;
  // 2 行目が区切り（| --- |）でなければ、1 行目を見出しとして区切りを足す
  const hasSeparator = rows.length > 1 && rows[1].length > 0 && rows[1].every((cell) => SEPARATOR_CELL.test(cell));
  if (!hasSeparator) {
    rows = [rows[0], rows[0].map(() => "---"), ...rows.slice(1)];
    if (caretRow >= 1) {
      caretRow++;
    }
  }
  const columns = Math.max(...rows.map((cells) => cells.length));
  rows = rows.map((cells) => [...cells, ...Array<string>(columns - cells.length).fill("")]);
  const aligns = rows[1].map(alignOf);
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(3, ...rows.filter((_, index) => index !== 1).map((cells) => displayWidth(cells[column]))),
  );

  const formatted = rows.map((cells, index) =>
    index === 1
      ? `| ${cells.map((_, column) => separator(widths[column], aligns[column])).join(" | ")} |`
      : `| ${cells.map((cell, column) => pad(cell, widths[column], aligns[column])).join(" | ")} |`,
  );

  // 整えたあとのカーソル: 同じ行の同じセルの、同じ文字の所
  const lineStart = formatted.slice(0, caretRow).reduce((sum, line) => sum + line.length + 1, 0);
  const cells = rows[caretRow];
  let column = 2;
  for (let index = 0; index < Math.min(caretCell, columns - 1); index++) {
    column += pad(cells[index], widths[index], aligns[index]).length + 3;
  }
  const cell = cells[Math.min(caretCell, columns - 1)];
  const padded = pad(cell, widths[Math.min(caretCell, columns - 1)], aligns[Math.min(caretCell, columns - 1)]);
  const leading = padded.length - padded.trimStart().length;
  const caret = from + lineStart + column + (cell === "" ? 0 : leading + Math.min(caretInCell, cell.length));

  return { from, to, text: formatted.join("\n"), caret };
}
