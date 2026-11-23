// 比べる（FN0304。API0317・API0318）

export type RowCompare = {
  // same / changed（同じ行で値が違う）/ removed（左にだけある）/ added（右にだけある）
  kind: "same" | "changed" | "removed" | "added";
  leftRow: number | null;
  rightRow: number | null;
  left: string[] | null;
  right: string[] | null;
  // 値の違う列（0 から）
  changed: number[];
  // 数式の違うセル（FN0304-BR07。値が同じでも数式が違えば changed）
  formulas: FormulaChange[];
};

export type FormulaChange = {
  column: number;
  // 先頭に = を付けた数式（数式でないセルは空）
  left: string;
  right: string;
};

export type SheetCompare = {
  name: string;
  status: "same" | "changed" | "onlyLeft" | "onlyRight";
  columns: number;
  rows: RowCompare[];
  truncated: boolean;
};

export type FileCompare =
  | { kind: "text"; left: string; right: string }
  | { kind: "sheets"; sheets: SheetCompare[] }
  | { kind: "binary"; same: boolean; leftSize: number; rightSize: number };

export type FolderEntry = {
  path: string;
  status: "same" | "changed" | "onlyLeft" | "onlyRight";
  isDir: boolean;
  leftSize: number | null;
  rightSize: number | null;
};

export type FolderCompare = {
  entries: FolderEntry[];
  truncated: boolean;
};
