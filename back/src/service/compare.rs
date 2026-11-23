// 比べる（docs の FN0304）。WinMerge のように、2 つのファイル・フォルダの違いを、非エンジニアにもわかる形で返す。
// - Excel など: シートごとに行をそろえ、変わったセルの場所を返す（画面は表で並べて色を付ける）
// - Word・PowerPoint・PDF・テキスト: 文字を取り出して返す（行・文字の違いは画面で出す。front の lib/lineDiff.ts）
// - そのほか（画像など）: 同じか違うかと大きさだけ
// - フォルダ: 中のファイルを、同じ・違う・片方だけに分ける
use calamine::{Reader, open_workbook_auto};
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use crate::search::extract;

// 表の大きさの上限（画面に出せる量に抑える）。超えた分は出さず truncated にする
pub const MAX_ROWS: usize = 3000;
pub const MAX_COLUMNS: usize = 100;
const MAX_CELL_CHARS: usize = 200;
// フォルダの中のファイルの数の上限
pub const MAX_ENTRIES: usize = 5000;
// これより違いが多い表は、細かく行をそろえない（計算を抑えるため）
const MAX_EDITS: usize = 2000;

#[derive(Serialize, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileCompare {
    // 文字のファイル（Word・PowerPoint・PDF・テキスト）
    #[serde(rename_all = "camelCase")]
    Text { left: String, right: String },
    // 表計算（Excel など）
    #[serde(rename_all = "camelCase")]
    Sheets { sheets: Vec<SheetCompare> },
    // そのほか。中身が同じか
    #[serde(rename_all = "camelCase")]
    Binary {
        same: bool,
        left_size: u64,
        right_size: u64,
    },
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SheetCompare {
    pub name: String,
    // same（同じ）/ changed（違う）/ onlyLeft・onlyRight（片方にだけあるシート）
    pub status: &'static str,
    // 一番多い列の数（画面の列の見出し A, B, … に使う）
    pub columns: usize,
    pub rows: Vec<RowCompare>,
    // 上限を超えて、出していない行・列がある
    pub truncated: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RowCompare {
    // same / changed（同じ行で値が違う）/ removed（左にだけある）/ added（右にだけある）
    pub kind: &'static str,
    // 1 から数えた行番号（無い側は null）
    pub left_row: Option<usize>,
    pub right_row: Option<usize>,
    pub left: Option<Vec<String>>,
    pub right: Option<Vec<String>>,
    // 値の違う列（0 から）。changed のときだけ
    pub changed: Vec<usize>,
    // 数式の違うセル（FN0304-BR07。値が同じでも数式が変わっていれば changed にする）
    pub formulas: Vec<FormulaChange>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FormulaChange {
    // 0 から数えた列
    pub column: usize,
    // 先頭に = を付けた数式（数式でないセルは空）
    pub left: String,
    pub right: String,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    // 比べたフォルダからの相対パス（/ 区切り）
    pub path: String,
    // same / changed / onlyLeft / onlyRight
    pub status: &'static str,
    pub is_dir: bool,
    pub left_size: Option<u64>,
    pub right_size: Option<u64>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderCompare {
    pub entries: Vec<FolderEntry>,
    pub truncated: bool,
}

// 2 つのファイルを比べる
pub fn compare_files(left: &Path, right: &Path) -> Result<FileCompare, String> {
    if extract::is_spreadsheet(left) && extract::is_spreadsheet(right) {
        return Ok(FileCompare::Sheets {
            sheets: compare_workbooks(left, right)?,
        });
    }
    if let (Some(left_text), Some(right_text)) = (
        extract::extract_for_compare(left)?,
        extract::extract_for_compare(right)?,
    ) {
        return Ok(FileCompare::Text {
            left: left_text,
            right: right_text,
        });
    }
    let size = |path: &Path| fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
    Ok(FileCompare::Binary {
        same: same_content(left, right).map_err(|e| e.to_string())?,
        left_size: size(left),
        right_size: size(right),
    })
}

type Grid = Vec<Vec<String>>;

// 1 つのシートの値と数式（数式は値と同じ行・列の位置。数式の無いセルは空）
struct SheetData {
    values: Grid,
    formulas: Grid,
    truncated: bool,
}

// ブックのシートを名前で組にして比べる。並びは左のシートの順、右にだけあるものは後ろ
fn compare_workbooks(left: &Path, right: &Path) -> Result<Vec<SheetCompare>, String> {
    let left = read_workbook(left)?;
    let right = read_workbook(right)?;
    let mut sheets = Vec::new();
    for (name, left_sheet) in &left {
        match right.iter().find(|(other, _)| other == name) {
            Some((_, right_sheet)) => {
                let mut rows = compare_rows(&left_sheet.values, &right_sheet.values);
                compare_formulas(&mut rows, &left_sheet.formulas, &right_sheet.formulas);
                let same = rows.iter().all(|row| row.kind == "same");
                sheets.push(sheet(
                    name,
                    if same { "same" } else { "changed" },
                    rows,
                    left_sheet.truncated || right_sheet.truncated,
                ));
            }
            None => sheets.push(sheet(
                name,
                "onlyLeft",
                one_side(&left_sheet.values, true),
                left_sheet.truncated,
            )),
        }
    }
    for (name, right_sheet) in &right {
        if !left.iter().any(|(other, _)| other == name) {
            sheets.push(sheet(
                name,
                "onlyRight",
                one_side(&right_sheet.values, false),
                right_sheet.truncated,
            ));
        }
    }
    Ok(sheets)
}

fn sheet(name: &str, status: &'static str, rows: Vec<RowCompare>, truncated: bool) -> SheetCompare {
    let columns = rows
        .iter()
        .flat_map(|row| [row.left.as_ref(), row.right.as_ref()])
        .flatten()
        .map(Vec::len)
        .max()
        .unwrap_or(0);
    SheetCompare {
        name: name.to_string(),
        status,
        columns,
        rows,
        truncated,
    }
}

// シートの名前と、セルの文字・数式（行の後ろの空のセルは除く）。上限を超えたら切って truncated
fn read_workbook(path: &Path) -> Result<Vec<(String, SheetData)>, String> {
    let mut workbook =
        open_workbook_auto(path).map_err(|e| format!("{} を読めません: {e}", file_name(path)))?;
    let mut sheets = Vec::new();
    for name in workbook.sheet_names() {
        let (values, truncated) = match workbook.worksheet_range(&name) {
            Ok(range) => to_grid(&range, |cell| cell.to_string()),
            Err(_) => (Vec::new(), false),
        };
        // 数式を読めない形式・シートは、値だけで比べる
        let formulas = match workbook.worksheet_formula(&name) {
            Ok(range) => {
                to_grid(&range, |formula: &String| {
                    if formula.is_empty() || formula.starts_with('=') {
                        formula.clone()
                    } else {
                        format!("={formula}")
                    }
                })
                .0
            }
            Err(_) => Vec::new(),
        };
        sheets.push((
            name,
            SheetData {
                values,
                formulas,
                truncated,
            },
        ));
    }
    Ok(sheets)
}

// 表の始まりが A1 でないとき（上・左が空）も、行番号・列をシートのとおりにする。上限を超えたら切って true
fn to_grid<T>(range: &calamine::Range<T>, text: impl Fn(&T) -> String) -> (Grid, bool)
where
    T: calamine::CellType,
{
    let (top, left) = range
        .start()
        .map(|(row, col)| (row as usize, col as usize))
        .unwrap_or((0, 0));
    let mut truncated = false;
    let mut grid: Grid = vec![Vec::new(); top.min(MAX_ROWS)];
    for row in range.rows() {
        if grid.len() >= MAX_ROWS {
            truncated = true;
            break;
        }
        let mut cells: Vec<String> = vec![String::new(); left.min(MAX_COLUMNS)];
        for cell in row {
            if cells.len() >= MAX_COLUMNS {
                truncated = true;
                break;
            }
            let mut value = text(cell);
            if let Some((index, _)) = value.char_indices().nth(MAX_CELL_CHARS) {
                value.truncate(index);
                value.push('…');
            }
            cells.push(value);
        }
        while cells.last().is_some_and(String::is_empty) {
            cells.pop();
        }
        grid.push(cells);
    }
    while grid.last().is_some_and(Vec::is_empty) {
        grid.pop();
    }
    (grid, truncated)
}

// そろえた行の組（same・changed）で、数式の違うセルを足す。値が同じでも数式が違えば changed にする（FN0304-BR07）
fn compare_formulas(rows: &mut [RowCompare], left: &Grid, right: &Grid) {
    let empty: Vec<String> = Vec::new();
    let blank = String::new();
    for row in rows.iter_mut() {
        let (Some(l), Some(r)) = (row.left_row, row.right_row) else {
            continue;
        };
        let left_row = left.get(l - 1).unwrap_or(&empty);
        let right_row = right.get(r - 1).unwrap_or(&empty);
        for column in 0..left_row.len().max(right_row.len()) {
            let before = left_row.get(column).unwrap_or(&blank);
            let after = right_row.get(column).unwrap_or(&blank);
            if before != after {
                row.formulas.push(FormulaChange {
                    column,
                    left: before.clone(),
                    right: after.clone(),
                });
            }
        }
        if !row.formulas.is_empty() {
            row.kind = "changed";
        }
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn one_side(grid: &Grid, left: bool) -> Vec<RowCompare> {
    grid.iter()
        .enumerate()
        .map(|(index, cells)| RowCompare {
            kind: if left { "removed" } else { "added" },
            left_row: left.then_some(index + 1),
            right_row: (!left).then_some(index + 1),
            left: left.then(|| cells.clone()),
            right: (!left).then(|| cells.clone()),
            changed: Vec::new(),
            formulas: Vec::new(),
        })
        .collect()
}

// 行をそろえて比べる。同じ行は same、消えた行・足した行が続くところは、同じ数だけ組にして changed（セルの違い）にする
// （1 行のどこかを書き換えたときに「消して足した」ではなく「この行のこのセルが変わった」と見せるため）
fn compare_rows(left: &Grid, right: &Grid) -> Vec<RowCompare> {
    let ops = diff(left, right);
    let mut rows = Vec::new();
    let mut index = 0;
    while index < ops.len() {
        match ops[index] {
            Op::Same(l, r) => {
                rows.push(RowCompare {
                    kind: "same",
                    left_row: Some(l + 1),
                    right_row: Some(r + 1),
                    left: Some(left[l].clone()),
                    right: Some(right[r].clone()),
                    changed: Vec::new(),
                    formulas: Vec::new(),
                });
                index += 1;
            }
            _ => {
                let mut removed = Vec::new();
                let mut added = Vec::new();
                while index < ops.len() {
                    match ops[index] {
                        Op::Remove(l) => removed.push(l),
                        Op::Add(r) => added.push(r),
                        Op::Same(..) => break,
                    }
                    index += 1;
                }
                for pair in 0..removed.len().max(added.len()) {
                    rows.push(match (removed.get(pair), added.get(pair)) {
                        (Some(&l), Some(&r)) => RowCompare {
                            kind: "changed",
                            left_row: Some(l + 1),
                            right_row: Some(r + 1),
                            changed: changed_cells(&left[l], &right[r]),
                            left: Some(left[l].clone()),
                            right: Some(right[r].clone()),
                            formulas: Vec::new(),
                        },
                        (Some(&l), None) => RowCompare {
                            kind: "removed",
                            left_row: Some(l + 1),
                            right_row: None,
                            left: Some(left[l].clone()),
                            right: None,
                            changed: Vec::new(),
                            formulas: Vec::new(),
                        },
                        (None, Some(&r)) => RowCompare {
                            kind: "added",
                            left_row: None,
                            right_row: Some(r + 1),
                            left: None,
                            right: Some(right[r].clone()),
                            changed: Vec::new(),
                            formulas: Vec::new(),
                        },
                        (None, None) => unreachable!(),
                    });
                }
            }
        }
    }
    rows
}

fn changed_cells(left: &[String], right: &[String]) -> Vec<usize> {
    let empty = String::new();
    (0..left.len().max(right.len()))
        .filter(|&index| left.get(index).unwrap_or(&empty) != right.get(index).unwrap_or(&empty))
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Op {
    Same(usize, usize),
    Remove(usize),
    Add(usize),
}

// 違いの少ない並び（Myers の方法）。違いが MAX_EDITS を超えたら、そろえずに左を全部消して右を全部足す
fn diff<T: PartialEq>(a: &[T], b: &[T]) -> Vec<Op> {
    // 先頭と末尾の同じものは先に除く
    let mut start = 0;
    while start < a.len() && start < b.len() && a[start] == b[start] {
        start += 1;
    }
    let (mut end_a, mut end_b) = (a.len(), b.len());
    while end_a > start && end_b > start && a[end_a - 1] == b[end_b - 1] {
        end_a -= 1;
        end_b -= 1;
    }
    let mut ops: Vec<Op> = (0..start).map(|i| Op::Same(i, i)).collect();
    ops.extend(
        middle(&a[start..end_a], &b[start..end_b])
            .into_iter()
            .map(|op| match op {
                Op::Same(x, y) => Op::Same(x + start, y + start),
                Op::Remove(x) => Op::Remove(x + start),
                Op::Add(y) => Op::Add(y + start),
            }),
    );
    ops.extend((0..a.len() - end_a).map(|i| Op::Same(end_a + i, end_b + i)));
    ops
}

fn middle<T: PartialEq>(a: &[T], b: &[T]) -> Vec<Op> {
    let (n, m) = (a.len() as isize, b.len() as isize);
    let all = || {
        (0..a.len())
            .map(Op::Remove)
            .chain((0..b.len()).map(Op::Add))
            .collect::<Vec<_>>()
    };
    if n == 0 || m == 0 {
        return all();
    }
    let limit = ((n + m) as usize).min(MAX_EDITS) as isize;
    let offset = limit + 1;
    let mut v = vec![0isize; (2 * limit + 3) as usize];
    let mut trace: Vec<Vec<isize>> = Vec::new();
    for d in 0..=limit {
        trace.push(v.clone());
        let mut k = -d;
        while k <= d {
            let down =
                k == -d || (k != d && v[(k - 1 + offset) as usize] < v[(k + 1 + offset) as usize]);
            let mut x = if down {
                v[(k + 1 + offset) as usize]
            } else {
                v[(k - 1 + offset) as usize] + 1
            };
            let mut y = x - k;
            while x < n && y < m && a[x as usize] == b[y as usize] {
                x += 1;
                y += 1;
            }
            v[(k + offset) as usize] = x;
            if x >= n && y >= m {
                return backtrack(&trace, n, m, offset);
            }
            k += 2;
        }
    }
    all()
}

fn backtrack(trace: &[Vec<isize>], n: isize, m: isize, offset: isize) -> Vec<Op> {
    let mut ops = Vec::new();
    let (mut x, mut y) = (n, m);
    for d in (0..trace.len()).rev() {
        let v = &trace[d];
        let d = d as isize;
        let k = x - y;
        let down =
            k == -d || (k != d && v[(k - 1 + offset) as usize] < v[(k + 1 + offset) as usize]);
        let prev_k = if down { k + 1 } else { k - 1 };
        let prev_x = v[(prev_k + offset) as usize];
        let prev_y = prev_x - prev_k;
        while x > prev_x && y > prev_y {
            ops.push(Op::Same((x - 1) as usize, (y - 1) as usize));
            x -= 1;
            y -= 1;
        }
        if d > 0 {
            if x == prev_x {
                ops.push(Op::Add(prev_y as usize));
            } else {
                ops.push(Op::Remove(prev_x as usize));
            }
        }
        x = prev_x;
        y = prev_y;
    }
    ops.reverse();
    ops
}

// 中身が同じか（大きさが違えば読まない）。少しずつ読んで比べ、違うところがあればそこでやめる
fn same_content(left: &Path, right: &Path) -> io::Result<bool> {
    if fs::metadata(left)?.len() != fs::metadata(right)?.len() {
        return Ok(false);
    }
    let (mut a, mut b) = (fs::File::open(left)?, fs::File::open(right)?);
    let (mut buf_a, mut buf_b) = (vec![0u8; 64 * 1024], vec![0u8; 64 * 1024]);
    loop {
        let read = read_full(&mut a, &mut buf_a)?;
        if read != read_full(&mut b, &mut buf_b)? || buf_a[..read] != buf_b[..read] {
            return Ok(false);
        }
        if read == 0 {
            return Ok(true);
        }
    }
}

// buffer がいっぱいになるか、終わりまで読む
fn read_full(file: &mut fs::File, buffer: &mut [u8]) -> io::Result<usize> {
    let mut total = 0;
    while total < buffer.len() {
        let read = file.read(&mut buffer[total..])?;
        if read == 0 {
            break;
        }
        total += read;
    }
    Ok(total)
}

// 2 つのフォルダを比べる。中のファイル・フォルダを相対パスで組にし、パスの順に返す
pub fn compare_folders(left: &Path, right: &Path) -> io::Result<FolderCompare> {
    let mut truncated = false;
    let left_items = walk(left, &mut truncated)?;
    let right_items = walk(right, &mut truncated)?;
    let mut paths: Vec<&String> = left_items.keys().chain(right_items.keys()).collect();
    paths.sort();
    paths.dedup();
    let mut entries = Vec::new();
    for path in paths {
        let entry = match (left_items.get(path), right_items.get(path)) {
            (Some(l), Some(r)) if l.is_dir && r.is_dir => FolderEntry {
                path: path.clone(),
                status: "same",
                is_dir: true,
                left_size: None,
                right_size: None,
            },
            (Some(l), Some(r)) if !l.is_dir && !r.is_dir => FolderEntry {
                path: path.clone(),
                status: if same_content(&l.full, &r.full)? {
                    "same"
                } else {
                    "changed"
                },
                is_dir: false,
                left_size: Some(l.size),
                right_size: Some(r.size),
            },
            // 片方はフォルダ、片方はファイル
            (Some(l), Some(r)) => FolderEntry {
                path: path.clone(),
                status: "changed",
                is_dir: l.is_dir && r.is_dir,
                left_size: (!l.is_dir).then_some(l.size),
                right_size: (!r.is_dir).then_some(r.size),
            },
            (Some(l), None) => FolderEntry {
                path: path.clone(),
                status: "onlyLeft",
                is_dir: l.is_dir,
                left_size: (!l.is_dir).then_some(l.size),
                right_size: None,
            },
            (None, Some(r)) => FolderEntry {
                path: path.clone(),
                status: "onlyRight",
                is_dir: r.is_dir,
                left_size: None,
                right_size: (!r.is_dir).then_some(r.size),
            },
            (None, None) => continue,
        };
        entries.push(entry);
    }
    // 片方にだけあるフォルダの中身は、フォルダの行だけにする（同じことを何行も並べないため）
    let only: Vec<String> = entries
        .iter()
        .filter(|entry| entry.is_dir && entry.status.starts_with("only"))
        .map(|entry| format!("{}/", entry.path))
        .collect();
    entries.retain(|entry| !only.iter().any(|dir| entry.path.starts_with(dir.as_str())));
    Ok(FolderCompare { entries, truncated })
}

struct Item {
    full: PathBuf,
    is_dir: bool,
    size: u64,
}

fn walk(root: &Path, truncated: &mut bool) -> io::Result<BTreeMap<String, Item>> {
    let mut items = BTreeMap::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            if items.len() >= MAX_ENTRIES {
                *truncated = true;
                return Ok(items);
            }
            let full = entry.path();
            // シンボリックリンクはたどらない（フォルダの外を読まないため）
            let meta = fs::symlink_metadata(&full)?;
            if meta.file_type().is_symlink() {
                continue;
            }
            let Some(relative) = crate::common::fs_util::relative_slash_path(root, &full) else {
                continue;
            };
            if meta.is_dir() {
                stack.push(full.clone());
            }
            items.insert(
                relative,
                Item {
                    full,
                    is_dir: meta.is_dir(),
                    size: meta.len(),
                },
            );
        }
    }
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grid(rows: &[&[&str]]) -> Grid {
        rows.iter()
            .map(|row| row.iter().map(|cell| cell.to_string()).collect())
            .collect()
    }

    // 1 行のセルを書き換え、1 行足したとき: 書き換えた行は changed（そのセルだけ）、足した行は added
    #[test]
    fn rows_are_aligned_and_changed_cells_found() {
        let left = grid(&[&["品名", "数"], &["りんご", "3"], &["みかん", "5"]]);
        let right = grid(&[
            &["品名", "数"],
            &["りんご", "4"],
            &["みかん", "5"],
            &["ぶどう", "1"],
        ]);
        let rows = compare_rows(&left, &right);
        let kinds: Vec<&str> = rows.iter().map(|row| row.kind).collect();
        assert_eq!(kinds, ["same", "changed", "same", "added"]);
        assert_eq!(rows[1].changed, [1]);
        assert_eq!(rows[3].right_row, Some(4));
        // 行を 1 つ消すと、あとの行はずれずに same のまま
        let removed = grid(&[&["品名", "数"], &["みかん", "5"]]);
        let kinds: Vec<&str> = compare_rows(&left, &removed)
            .iter()
            .map(|row| row.kind)
            .collect();
        assert_eq!(kinds, ["same", "removed", "same"]);
    }

    // 値が同じでも数式が違うセルは、数式の違いとして出し、行を changed にする
    #[test]
    fn formula_changes_are_found_even_when_values_are_same() {
        let values = grid(&[&["品名", "合計"], &["りんご", "10"]]);
        let mut rows = compare_rows(&values, &values);
        let left = grid(&[&[], &["", "=B2*2"]]);
        let right = grid(&[&[], &["", "=5+5"]]);
        compare_formulas(&mut rows, &left, &right);
        assert_eq!(rows[0].kind, "same");
        assert_eq!(rows[1].kind, "changed");
        assert!(rows[1].changed.is_empty());
        assert_eq!(
            rows[1].formulas,
            [FormulaChange {
                column: 1,
                left: "=B2*2".to_string(),
                right: "=5+5".to_string()
            }]
        );
    }

    #[test]
    fn diff_matches_simple_cases() {
        assert_eq!(diff::<u8>(&[], &[]), []);
        assert_eq!(
            diff(&[1, 2, 3], &[1, 3]),
            [Op::Same(0, 0), Op::Remove(1), Op::Same(2, 1)]
        );
        assert_eq!(diff(&[1], &[2]), [Op::Remove(0), Op::Add(0)]);
    }

    #[test]
    fn folders_are_compared_by_content() {
        let dir = std::env::temp_dir().join(format!("ari-compare-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let (left, right) = (dir.join("left"), dir.join("right"));
        fs::create_dir_all(left.join("sub/deep")).unwrap();
        fs::create_dir_all(right.join("other")).unwrap();
        fs::write(left.join("same.txt"), "a").unwrap();
        fs::write(right.join("same.txt"), "a").unwrap();
        fs::write(left.join("diff.txt"), "a").unwrap();
        fs::write(right.join("diff.txt"), "b").unwrap();
        fs::write(left.join("sub/deep/x.txt"), "x").unwrap();
        fs::write(right.join("other/y.txt"), "y").unwrap();
        let result = compare_folders(&left, &right).unwrap();
        let list: Vec<(&str, &str)> = result
            .entries
            .iter()
            .map(|entry| (entry.path.as_str(), entry.status))
            .collect();
        assert_eq!(
            list,
            [
                ("diff.txt", "changed"),
                ("other", "onlyRight"),
                ("same.txt", "same"),
                ("sub", "onlyLeft"),
            ]
        );
        assert!(!result.truncated);
        // 文字のファイル・そのほか
        let text = compare_files(&left.join("diff.txt"), &right.join("diff.txt")).unwrap();
        assert!(matches!(text, FileCompare::Text { .. }));
        fs::write(left.join("a.bin"), [0u8, 1]).unwrap();
        fs::write(right.join("a.bin"), [0u8, 1]).unwrap();
        let binary = compare_files(&left.join("a.bin"), &right.join("a.bin")).unwrap();
        assert!(matches!(binary, FileCompare::Binary { same: true, .. }));
        fs::remove_dir_all(&dir).unwrap();
    }
}
