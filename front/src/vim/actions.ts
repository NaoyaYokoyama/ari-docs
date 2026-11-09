// Vim モードで画面全体に効く操作（FN0702）。キーは設定で変えられる（vimSettings.ts）
// 移動の操作は、画面が一覧を持っていれば一覧の中を動き（Folder の一覧など）、無ければスクロールする
export const VIM_ACTIONS = [
  { id: "down", group: "移動", label: "下へ", description: "一覧では次の行、それ以外は下へスクロール", keys: "j" },
  { id: "up", group: "移動", label: "上へ", description: "一覧では前の行、それ以外は上へスクロール", keys: "k" },
  { id: "left", group: "移動", label: "左へ・戻る", description: "Folder では上のフォルダへ、それ以外は左へスクロール", keys: "h" },
  { id: "right", group: "移動", label: "右へ・開く", description: "Folder では選んだものを開く、それ以外は右へスクロール", keys: "l" },
  { id: "halfDown", group: "移動", label: "半ページ下へ", description: "一覧では 10 行", keys: "d" },
  { id: "halfUp", group: "移動", label: "半ページ上へ", description: "一覧では 10 行", keys: "u" },
  { id: "top", group: "移動", label: "先頭へ", description: "一覧では最初の行", keys: "gg" },
  { id: "bottom", group: "移動", label: "末尾へ", description: "一覧では最後の行", keys: "G" },
  // vimrc でよく使う nnoremap <C-h> <C-w>h などと同じ（<C-w> はブラウザでタブが閉じるため既定にしない）
  { id: "paneLeft", group: "領域の移動", label: "左の領域へ", description: "サイドバー（一覧・ツリー・メニュー）へ", keys: "<C-h>" },
  { id: "paneRight", group: "領域の移動", label: "右の領域へ", description: "メイン（Note・Wiki は本文）へ", keys: "<C-l>" },
  { id: "paneDown", group: "領域の移動", label: "下の領域へ", description: "Note・Wiki のタイトルから本文へ", keys: "<C-j>" },
  { id: "paneUp", group: "領域の移動", label: "上の領域へ", description: "Note・Wiki の本文からタイトルへ", keys: "<C-k>" },
  { id: "hint", group: "クリック・入力", label: "文字で選んでクリック", description: "押せるところに文字を出し、その文字を打つとクリックする（Vimium の f）", keys: "f" },
  { id: "hintOpen", group: "クリック・入力", label: "文字で選んで開く", description: "ダブルクリックと同じ（ファイルを開く・フォルダに入る）", keys: "F" },
  { id: "search", group: "クリック・入力", label: "検索・絞り込みへ", description: "その画面の検索欄・絞り込み欄に移る", keys: "/" },
  { id: "insert", group: "クリック・入力", label: "書き始める", description: "Note・Wiki では本文へ（Vim のエディタなら挿入モード）、ほかの画面では最初の入力欄へ", keys: "i" },
  { id: "quickOpen", group: "画面", label: "探して開く", description: "Note・Wiki・ファイル・画面・操作を名前で探して開く（Ctrl+P と同じ。Vimium の o）", keys: "o" },
  { id: "back", group: "画面", label: "前の画面へ", description: "ブラウザの「戻る」と同じ", keys: "H" },
  { id: "forward", group: "画面", label: "次の画面へ", description: "ブラウザの「進む」と同じ", keys: "L" },
  { id: "nextPage", group: "画面", label: "右隣の画面へ", description: "ヘッダーの並び（Home → Folder → …）で右へ", keys: "gt" },
  { id: "prevPage", group: "画面", label: "左隣の画面へ", description: "ヘッダーの並びで左へ", keys: "gT" },
  { id: "goHome", group: "画面", label: "Home へ", description: "Alt+1 と同じ", keys: "gh" },
  { id: "goFolder", group: "画面", label: "Folder へ", description: "Alt+2 と同じ", keys: "gf" },
  { id: "goNote", group: "画面", label: "Note へ", description: "Alt+3 と同じ", keys: "gn" },
  { id: "goWiki", group: "画面", label: "Wiki へ", description: "Alt+4 と同じ", keys: "gw" },
  { id: "goDocs", group: "画面", label: "Docs へ", description: "Docs を使う設定のときだけ（Alt+5 と同じ）", keys: "gd" },
  { id: "goSetting", group: "画面", label: "設定へ", description: "一番右の画面（Alt+5。Docs を使う設定なら Alt+6）", keys: "gs" },
  // Folder の一覧のファイル操作（ranger・vifm と同じ考え方）。d は半ページ下へに使うので、切り取りは x にする
  { id: "yank", group: "Folder の操作", label: "コピー", description: "選んでいるものをコピーする（Ctrl+C と同じ）", keys: "yy" },
  { id: "cut", group: "Folder の操作", label: "切り取り", description: "選んでいるものを切り取る（Ctrl+X と同じ）", keys: "x" },
  { id: "paste", group: "Folder の操作", label: "貼り付け", description: "表示しているフォルダに貼り付ける（Ctrl+V と同じ）", keys: "p" },
  { id: "trash", group: "Folder の操作", label: "ゴミ箱へ", description: "選んでいるものをゴミ箱に移す（Delete と同じ）", keys: "D" },
  { id: "rename", group: "Folder の操作", label: "名前の変更", description: "選んでいるものの名前を変える（F2 と同じ）", keys: "cw" },
  { id: "visual", group: "Folder の操作", label: "範囲選択", description: "j・k などで選ぶ範囲を広げる。y でコピー、d・x で切り取り、D でゴミ箱へ、Esc でやめる（Vim の V）", keys: "V" },
] as const;

export type VimActionId = (typeof VIM_ACTIONS)[number]["id"];

export const VIM_ACTION_GROUPS = ["移動", "領域の移動", "クリック・入力", "画面", "Folder の操作"] as const;

export const PANE_ACTIONS = ["paneLeft", "paneRight", "paneDown", "paneUp"] as const;

export const DEFAULT_VIM_KEYS = Object.fromEntries(
  VIM_ACTIONS.map((action) => [action.id, action.keys]),
) as Record<VimActionId, string>;
