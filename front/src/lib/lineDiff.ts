// 行ごとの差分（変更履歴の「前の版との違い」FN0402-BR07、比べる FN0304）。Myers の方法で、変えた行の少ない並びを求める。
// 違いがとても多いときは（計算とメモリを抑えるため）前の版をすべて消し、新しい版をすべて足した形にする

export type DiffLine = { kind: "same" | "add" | "remove"; text: string };

// これより多く違うときは、細かく求めない
const MAX_EDITS = 1000;

export function diffLines(before: string, after: string): DiffLine[] {
  return diffSequence(before.split("\n"), after.split("\n"));
}

// 並び（行・文字）の差分。same は両方にある、remove は前にだけ、add は後にだけ
export function diffSequence(a: string[], b: string[], maxEdits = MAX_EDITS): DiffLine[] {
  // 先頭と末尾の同じものは先に除く（ふつうの変更はここで小さくなる）
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const same = (text: string): DiffLine => ({ kind: "same", text });
  return [
    ...a.slice(0, start).map(same),
    ...middle(a.slice(start, endA), b.slice(start, endB), maxEdits),
    ...a.slice(endA).map(same),
  ];
}

function middle(a: string[], b: string[], maxEdits: number): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const all = (): DiffLine[] => [
    ...a.map((text): DiffLine => ({ kind: "remove", text })),
    ...b.map((text): DiffLine => ({ kind: "add", text })),
  ];
  if (n === 0 || m === 0) {
    return all();
  }
  const limit = Math.min(n + m, maxEdits);
  const offset = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= limit; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset]);
      let x = down ? v[k + 1 + offset] : v[k - 1 + offset] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[k + offset] = x;
      if (x >= n && y >= m) {
        return backtrack(trace, a, b, offset);
      }
    }
  }
  return all();
}

// 求めた道筋を (n, m) から (0, 0) へたどって、行の並びにする
function backtrack(trace: Int32Array[], a: string[], b: string[], offset: number): DiffLine[] {
  const lines: DiffLine[] = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    const down = k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset]);
    const prevK = down ? k + 1 : k - 1;
    const prevX = v[prevK + offset];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      lines.push({ kind: "same", text: a[x - 1] });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) {
        lines.push({ kind: "add", text: b[prevY] });
      } else {
        lines.push({ kind: "remove", text: a[prevX] });
      }
    }
    x = prevX;
    y = prevY;
  }
  return lines.reverse();
}

// 1 行の中の文字の違い。左（前）と右（後）それぞれを、変わった文字とそのままの文字の切れ目に分ける。
// 長すぎる行・違いが多すぎる行は、行ごと変わったものとする
export type CharPart = { text: string; changed: boolean };

const MAX_LINE_CHARS = 2000;

export function diffChars(before: string, after: string): { left: CharPart[]; right: CharPart[] } {
  const a = Array.from(before);
  const b = Array.from(after);
  if (a.length > MAX_LINE_CHARS || b.length > MAX_LINE_CHARS) {
    return { left: [{ text: before, changed: true }], right: [{ text: after, changed: true }] };
  }
  const left: CharPart[] = [];
  const right: CharPart[] = [];
  const push = (parts: CharPart[], text: string, changed: boolean) => {
    const last = parts[parts.length - 1];
    if (last && last.changed === changed) {
      last.text += text;
    } else {
      parts.push({ text, changed });
    }
  };
  for (const part of diffSequence(a, b, 200)) {
    if (part.kind !== "add") {
      push(left, part.text, part.kind === "remove");
    }
    if (part.kind !== "remove") {
      push(right, part.text, part.kind === "add");
    }
  }
  return { left, right };
}

// 左右に並べる行。消した行と足した行が続くところは、同じ数だけ組にして「変わった行」にする（WinMerge と同じ見せ方）
export type SideRow =
  | { kind: "same"; leftNo: number; rightNo: number; text: string }
  | { kind: "changed"; leftNo: number; rightNo: number; left: string; right: string }
  | { kind: "removed"; leftNo: number; left: string }
  | { kind: "added"; rightNo: number; right: string };

export function sideBySide(before: string, after: string): SideRow[] {
  const lines = diffLines(before, after);
  const rows: SideRow[] = [];
  let leftNo = 0;
  let rightNo = 0;
  let index = 0;
  while (index < lines.length) {
    if (lines[index].kind === "same") {
      leftNo++;
      rightNo++;
      rows.push({ kind: "same", leftNo, rightNo, text: lines[index].text });
      index++;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    while (index < lines.length && lines[index].kind !== "same") {
      (lines[index].kind === "remove" ? removed : added).push(lines[index].text);
      index++;
    }
    for (let pair = 0; pair < Math.max(removed.length, added.length); pair++) {
      if (pair < removed.length && pair < added.length) {
        leftNo++;
        rightNo++;
        rows.push({ kind: "changed", leftNo, rightNo, left: removed[pair], right: added[pair] });
      } else if (pair < removed.length) {
        leftNo++;
        rows.push({ kind: "removed", leftNo, left: removed[pair] });
      } else {
        rightNo++;
        rows.push({ kind: "added", rightNo, right: added[pair] });
      }
    }
  }
  return rows;
}
