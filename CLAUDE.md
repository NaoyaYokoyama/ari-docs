# ari-docs

ファイル（フォルダ）・Note・Wiki を管理する社内向けドキュメントツール。

## 構成

- `front/` : React + TypeScript + Vite + Tailwind CSS（`@/` = `front/src/`）
  - 共通部品は `components/common/`（Button・IconButton・Input・Dialog・PageSidebar・EmptyState・Spinner など）。Note と Wiki は同じ画面の部品（`pages/content/`、違いは `contentKinds.ts`）
  - 開発サーバーは Docker（`docker compose` の `frontend`、コンテナ名 `ari-docs`）で動く。`node_modules` はコンテナ内の別ボリュームなので、依存を追加したら `docker compose exec frontend npm install` → `docker compose restart frontend` も行う
- `back/` : Rust（axum + rusqlite / SQLite）。ライブラリ `ari_back`（`src/lib.rs`、起動は `server::start`）と開発用バイナリ（`src/main.rs`、`cargo run`）
  - `api/<機能>/{handler,request,response}.rs` → `service/` → `repository/`（SQL）→ `model/`（テーブル対応）
  - マイグレーション: `back/src/data/migration/T00x_*.sql`。実行ファイルに埋め込む（rust-embed）。空の DB でも通るよう `DROP TABLE IF EXISTS` を使う
  - 開発時の設定は `back/config.toml`（`folder_root`・`database_path`・`docs_default_root`）。DB は `back/data/ari.db`
- `desktop/src-tauri/` : デスクトップアプリ（Tauri 2）。バックエンドを同じプロセスで起動する。exe と同じフォルダの `config.toml` に作業フォルダ（既定 `"."` = exe のフォルダ）を書き、`<作業フォルダ>/folder`・`<作業フォルダ>/.ari-docs/ari.db` を使う。作業フォルダは設定画面から変えられ、変えると再起動する。デバッグビルドは `back/config.toml` で動く（docs の FN0002）
  - Tauri 本体（crate）と `@tauri-apps/api`（npm）はマイナーバージョンを揃える（揃っていないと `cargo tauri build` が止まる）
  - 配布は Windows が NSIS（ユーザー単位）、Linux が AppImage（`tauri.conf.json` の `bundle.targets`）。Linux では `NO_STRIP=true cargo tauri build`（docs の OP0002）
  - Windows の配布物には C++ のランタイムの DLL（ONNX Runtime が使う `msvcp140.dll` など 4 つ）を exe の横に同梱する（`desktop/src-tauri/vcruntime/` に置いて `--config tauri.vcruntime.conf.json`。GitHub Actions は自動で用意。docs の OP0002）
- `folder/` : 開発時のノード（ファイル・フォルダ）の実体。バックエンドは `../folder` として参照
- `docs/` : 設計書（書き方は `docs/00_概要/0090_ドキュメントルール.md`。全文書レビュー中）。git 管理を楽にするため当面はリポジトリ内に置き、固まったら別管理に移す

## 検証コマンド

作業の最後に Stop hook（`.claude/hooks/verify.sh`）が以下を自動実行し、失敗すると差し戻される。

- `cd front && npx tsc -b && npx eslint src`
- `cd back && cargo build`（**警告もゼロにする**）
- `cd desktop/src-tauri && cargo build`（**警告もゼロにする**）

テストは `cd back && cargo test`、`cd desktop/src-tauri && cargo test`。

## 仕様（決定済み）

仕様が不明な点はここを先に確認し、無ければユーザーに確認する。ユーザーが決めた仕様はこの節に追記する。

設計の対象はローカルモードと共有モード。共有モードの残りの検討事項は `docs/10_要件定義/0000_要件一覧.md` の RQ0001。詳細な設計書は `docs/` にある。

### 共通

- ユーザーのデータを扱う API はログイン必須（`auth::get_login_user` → 未ログインは 401）
- 動作モード: ローカルモード（個人用。ユーザー `local`、ログインなし、**`127.0.0.1` だけで待ち受ける**）と共有モード（`back <config.toml>` でサーバーとして起動。`bind_address`・`port`。docs の OP0007）
- セッションは DB（`session`）に保存し、最後に使ってから 30 日で切れる。5 回続けてログインに失敗すると 15 分ロック（`login_failure`）。日数・回数・分数と変更履歴の数は管理者が「サーバーの設定」で変えられる（`service/server_settings.rs`、`system_setting` の `server_settings`。docs の FN0902）。共有モードは `tls_cert`・`tls_key` で HTTPS
- ログイン中の端末は設定画面で見てログアウトさせられる。トークンは画面に返さず `rowid` で指す（FN0101-BR15）
- セッションは `Authorization: Bearer <トークン>`、無ければ Cookie で識別する（デスクトップアプリから共有サーバーへは Cookie が届かないため）。画面はトークンを `localStorage` に保存する（`front/src/api/client.ts`）
- デスクトップアプリの「使い方」: `config.toml` の `mode`（`local` / `server`）と `server_url`。Windows はインストーラー（`desktop/src-tauri/installer-hooks.nsh`。共有サーバーは PowerShell で `/api/server-info` を呼んで接続を確かめる）、それ以外は初回起動の画面で選び、設定画面でも変えられる。`server` ではバックエンドを起動しない。起動したときにサーバーにつながらなければ専用の画面（`pages/setup/ServerUnreachable.tsx`。docs の FN0002-BR18・BR19）
- 製品の方針: 自分の PC に exe で入れる。個人用は PC の中だけで完結（外部への通信・外部ソフトのインストールを求めない）。当面すべて無料（docs の 0000_システム概要 2.1）。配布物は GitHub Actions（`.github/workflows/build.yml`）でも Windows・Linux を作れる

### ユーザー管理（共有モード）

- ユーザーは管理者（`user.role_id = 'admin'`）が設定画面で登録・削除・パスワード再設定する。ユーザーが 1 人もいなければログイン画面で最初の管理者を登録できる
- ユーザー削除ではその人の Note・お気に入り・設定も消し、Wiki は残す。自分は削除できない
- 画面移動の `Alt+数字` はヘッダーに出ているメニューへ左から順に振る（Setting は一番右。Docs を出さなければ Setting が `Alt+5`、出せば Docs が `Alt+5`・Setting が `Alt+6`。`front/src/shortcut/shortcut.ts` の `navigationItems`）。`?` でショートカット一覧
- ホームの検索は、検索欄の横で探す種類（Excel・Word・PDF・画像・Note・Wiki など。複数可、既定はすべて）を選べる。種類は拡張子で決め、サーバーの `search/kind.rs` と画面の `preferences.ts` の `SEARCH_TYPES` で名前をそろえる。選んだ種類はこの PC の設定（docs の FN0201-BR09）
- ari-docs のリンク（docs の FN0004）: `ari://folder|file/{パス}`・`ari://wiki|note/{ID}` の文字で場所を渡す（PC の絶対パスではない）。作るのは Folder の右クリック・Ctrl+Shift+C、Note・Wiki の 🔗。開くのは探して開く・ホームの検索欄に貼る、本文のリンクを押す（`front/src/lib/ariLink.ts`・`app/useAriLink.ts`・`ContentMarkdown.tsx` の `urlTransform`）。ファイルは OS で開かず Folder で選ぶ
- 探して開く（docs の FN0003）: `Ctrl+P`（Vim モードは `o`、本文の Vim のエディタは `:e`）で Note・Wiki・ファイル・フォルダ・画面・操作を名前のあいまい検索で開く（`front/src/quickOpen/`、API は `/api/home/quick-open`・`back/src/search/fuzzy.rs`。点数の付け方は画面とサーバーで同じにする）。最近開いたものはこの PC の `localStorage`（`recent-opened:<ユーザー ID>`）
- 配色はライト・ダーク・OS に合わせる。ブラウザの `localStorage` に保存する（`front/src/app/theme.ts`）。色は Tailwind の `slate-*` などを直接書かず、`global.css` の変数（`bg-background`・`text-muted-foreground`・`border-border`・`bg-brand` など）を使う

### Note

- 作成者本人のみ参照・編集・削除できる。検索も本人の Note のみ対象
- Note 削除時はその Note のお気に入りも削除する
- タイトルはサーバー側でも検証する（前後の空白を除いて空・25 文字超は 400。`api/validation.rs` の `not_blank`）。Wiki も同じで、作成だけは 20 文字まで

### Wiki

- 全ユーザーで共有する。`wiki.user_id` は**作成者**を表すだけで、絞り込みには使わない
- ログインユーザーなら誰でも一覧・参照・編集・削除できる。検索も全 Wiki が対象
- Wiki 削除時は全ユーザーのお気に入りを削除する
- 保存すると最後に更新した人（`wiki.updated_by`）を記録する。保存のときに開いたときの更新日時（`baseUpdatedAt`）と違えば 409 で確認し、`force` で上書き（Note も同じ）。Note・Wiki の版は `content_history` に残す（100 件まで。docs の FN0402）
- Note・Wiki・お気に入りの一覧に件数の制限は無い
- 本文の編集の手助け（docs の FN0404）: 書式のボタン（`pages/content/MarkdownToolbar.tsx`）・キー（Ctrl+B など。`shortcut.ts` の `MD_*`）・表の挿入と整形（`pages/content/markdown/`。書き換えはエディタに依存しない関数にし、`editorHandle.ts` で textarea と Vim のエディタに当てる）。Vim のエディタは書式のキーを挿入モードのときだけ受ける。本文の字体は等幅
- Note・Wiki のボタンには一言の説明（`components/common/Hint.tsx`、`IconButton` の `hint`）。マウスを乗せたとき・キーで選んだときに出す。この PC の設定 `buttonHints`（既定オン）で消せる
- 本文の画像は貼り付け・ドロップで入れ、画面で縮小（長い辺 1920 画素・WebP）してから `content_image`（DB）に保存する（サーバーの容量のため）。本文には `/api/content-image/{id}` と書き、表示は `ContentMarkdown.tsx` がトークンを付けて読み込む。Note の画像は本人（と使っている Wiki を読める人）だけ。使われなくなった画像は 1 日後に消す（毎時 15 分）
- Note・Wiki はフォルダ（入れ子あり）で分ける（docs の FN0403）。フォルダは `content_folder`、入れ場所は別の表 `content_folder_item`（行が無ければ一番上。Note・Wiki の表は変えない）。Note のフォルダは本人だけ、Wiki のフォルダは全員で使う。削除できるのは中が空のフォルダだけ（Note・Wiki にはゴミ箱が無いため）。画面は `pages/content/`（`contentTree.ts`・`useContentFolders.ts`）

### ノード（ファイル・フォルダ）

- 受け取る大きさの上限は 1 GB（`router.rs` の `DefaultBodyLimit`。axum の既定 2 MB のままにしない）
- `node` テーブルはファイルの見張り（`batch/node_watch.rs`、数秒で反映）と 10 分ごとの全体の同期（`batch/node_sync.rs`。消えたものの行も消す）で合わせる
- 実体はノードのルート以下のファイルシステム。ルートは `back/config.toml` の `folder_root`（既定 `../folder`）で、アプリの初期設定でだけ決め、運用中は変えない（お気に入り等が相対パスで記録されるため）。`node` テーブルは同期バッチ（`batch/node_sync.rs`）で登録する
- パスは `folder/` からの相対パスで、先頭に `/` を付けない（例: `a/b/memo.txt`）。OS によらず `/` 区切り。`Path` から作るときは `common/fs_util.rs` の `relative_slash_path`（`to_string_lossy` だと Windows で `\` 区切りになる）
- 削除 API は `parentPath` + `name` で対象を特定する。`name` が空・`.`・`..`・`/` を含む場合は 400
- ノードの API はパスに `..`・絶対パスを含むものを 400 にする（`service/node.rs` の `resolve`。`folder/` の外を操作させない）。作成は同名があれば 409 で、上書きしない
- 削除したら `node` の行と全ユーザーのお気に入りも消す（フォルダなら配下も。`repository/node.rs` の `delete_with_descendants`）
- 名前の変更・移動では `node` の行のパスを書き換え（`repository/node.rs` の `move_paths`）、`node_id` を保つ（お気に入り・中身の検索がそのまま使える）。コピーはノード同期に任せる
- Folder の一覧の右にプレビュー（`pages/node/PreviewPane.tsx`。中身の表示は Space のダイアログと共通の `FilePreview.tsx`）。開いたときに出すかはこの PC の設定（`folderPreviewPane`、既定オン）、Alt+P で出し入れ（docs の FN0301-BR31）
- フォルダ画面の操作はエクスプローラーに合わせる（複数選択・右クリックのメニュー・F2・Ctrl+C/X/V・Delete・ドラッグで移動、Ctrl+ドラッグでコピー）。デスクトップアプリは `tauri.conf.json` の `dragDropEnabled: false` でないと OS のファイルのドロップが画面に届かない

### ファイルの中身の検索（docs の FN0202）

- 取り込みバッチ（`batch/content_index.rs`、毎分 30 秒）が、変わったファイル（更新日時・サイズ・辞書の版で判断）だけを取り込む。時間差は許容する
- 文字の取り出しは `search/extract.rs`（Excel・Word・PowerPoint・PDF・テキスト）、単語の区切りは `search/tokenizer.rs`（lindera + IPADIC。普通と細かい区切りの両方）。同じ単語は `keyword` の 1 行にまとめ、`node_keyword` で結ぶ。文章そのものは保存しない（抜粋は出さない）。検索語の各単語は、登録した単語との部分一致（`LIKE '%単語%'`）で探す（区切り目のずれで見落とさないため。完全に一致した単語の多いファイルを先に並べる。`repository/search.rs` の `find_nodes_by_words`）
- 画像の中の文字は、アプリに組み込んだ文字認識（PaddleOCR PP-OCRv6 small + ONNX Runtime。`oar-ocr`）で読む（`search/ocr.rs`・PDF はページを `hayro` で描く `search/pdf_ocr.rs`。docs の FN0202-BR14・BR15）。対象は PDF の文字の無いページ・PDF と Excel・Word・PowerPoint に貼り付けた画像・画像ファイル。モデルは `back/models/`（git に入れない。ビルドのとき `back/build_models.rs` が公式の配布元から取得し SHA-256 で確認）、配布物は exe の横の `models/`（`config.toml` の `ocr_models_dir`）。無ければ文字認識だけ飛ばす。文字認識の要るファイルは後に回して小さい順。開発用のビルドも外部の部品は最適化する（`Cargo.toml` の `profile.dev.package`）
- Excel は セル・シート名に加えて、図形・テキストボックス・コメント（`xl/drawings`・`xl/comments`・`xl/threadedComments`）も読む。取り出し方を変えたら `search/index.rs` の `EXTRACTOR_SALT` を変える（すべてのファイルを取り込み直す）
- 対応する形式は `search/extract.rs` の `FORMAT_GROUPS`（プレビューは `front/src/lib/previewFormats.ts`）。一覧は設定画面の「対応するファイル」（`/api/search/formats`）と docs の `10_要件定義/0030_対応するファイル.md`。形式を増やしたら docs も直す
- 業界用語などは「検索の辞書」（`search_dictionary`）に登録する。変えるとすべてのファイルを順に取り込み直す。共有モードでは管理者だけが変更できる

### ゴミ箱・バックアップ（docs の FN0302・FN0901）

- 削除（`/api/nodes/delete`）はゴミ箱へ移す（`<DB のフォルダ>/trash/<trash_id>/`、`trash` テーブル）。元に戻すは誰でも、完全に削除・空にするは共有モードでは管理者だけ（`auth::can_manage`）
- バックアップは DB の写し（`VACUUM INTO`）と `folder/` を 1 つの ZIP にする（`service/backup.rs`）。設定は `system_setting` の `backup_settings`。定期の処理は毎分 45 秒（間隔ごとに 1 回）。復元では今の状態を先にバックアップし、`backup`・`system_setting`・`trash` は今のものを残す。実行中は `backup::is_busy()` でほかのバッチを止める
- 共有モードで開いたファイルは、デスクトップアプリが見張り（`open_download` → `ari-docs://file-changed`）、画面が自動でアップロードし直す（`front/src/lib/editSync.ts`）

### お気に入り

- ユーザーごとに管理する（`favorite.user_id`）。対象はノード・Note・Wiki のいずれか 1 つ
- ノードのお気に入りは `node.node_id` で紐づける（パスから引く）
- 画面に返すときは解除用の `favoriteId` を必ず含める
- 同じユーザーが同じ対象を登録したら、新しく作らず既存の `favoriteId` を返す

### 設定画面（docs の FN0701・FN0902・FN0903）

- メニューはまとまり（`settingSection.ts` の `group`）ごとに並べ、`keywords` で探せる。開いているメニューは URL の `?section=`
- 配色・文字の大きさ・画面の動き・起動したときの画面・削除の確認・隠しファイルは、この PC（`localStorage`）に保存する（`front/src/app/preferences.ts`）。書き出し・読み込み・初期化もここ。サーバーには送らない
- 削除はゴミ箱へ移すので既定では確認しない。「削除の前に確かめる」をオンにした PC だけ確認する
- Vim モード（docs の FN0702。既定オフ、この PC の `localStorage` の `vim`）: 入力欄の外のキーを Vimium と同じ考え方で操作にする（`front/src/vim/`）。キーは操作ごとに設定で変えられる（`actions.ts`・`vimSettings.ts`）。一覧のある画面は `useVimHandlers` で「j で次の行」などを登録し、無ければスクロール。画面の部品が先に使ったキー（`defaultPrevented`）・入力中のキーは使わない。Note・Wiki の本文は CodeMirror + `@replit/codemirror-vim`（`VimEditor.tsx`、Vim モードのときだけ読み込む。`:w` 保存・`:q` 一覧へ）。領域の移動は `<C-h>`・`<C-l>`（サイドバー `data-vim-pane`・行 `data-vim-item`。`panes.ts`）。`<C-w>` は既定にしない（ブラウザではタブが閉じる）。Folder の一覧は `yy`・`x`・`p`・`D`・`cw`・`V`（範囲選択）でファイルを扱う（`d` は半ページ下へなので切り取りは `x`）

### Markdown ビューア（`/docs`）

- メイン機能とは別の機能。使うかは管理者が「サーバーの設定」で決める（`server_settings` の `docsEnabled`、既定はオフ。docs の FN0902-BR06）。オフならヘッダー・`Alt+数字`・探して開く・Vim の `gd`・起動したときの画面・設定の「Docs の初期フォルダ」に出さず、`/docs` は Home へ移り、API は 404。画面は `/api/me` の `docsEnabled` で判断する
- 指定したフォルダ以下の `.md` を閲覧専用で表示する。Folder（ノード）機能とは独立させる（ノードは DB の状態と紐づくため）
- 表示するフォルダは URL の指定 → 設定画面の「Docs の初期フォルダ」（`user_setting.docs_root`）→ リポジトリの `docs/` の順に決める。初期フォルダが消えていたら `docs/` を表示してお知らせを出す
- 任意のフォルダを指定できるのはローカルモードのみ。共有モードで指定すると 403
- 指定フォルダの外のファイル（`..`・絶対パス・シンボリックリンク経由）と `.md` 以外は読めない
- `docs/00_概要/0090_ドキュメントルール.md` に沿ったチェック結果（id とファイル名の不一致など）を警告として表示する

### 未決事項

- （今のところ無し。docs の各文書の「未決事項」と要件一覧 RQ0001 を参照）

## 作業ルール

- **git commit はしない・提案もしない**（ユーザーが手動で行う）
- `back/data/ari.db` は開発用の使い捨て DB（将来は exe の初期化時に作成する）。バックアップは不要
- `folder/` はテスト用のデータなので、中のファイル操作は確認不要
- 意図しない変化を指摘されたら、すぐ差し戻さず原因を説明して「戻すか」を確認する
- 依頼範囲外で見つけた不具合は勝手に直さず、報告して確認する（セキュリティ上の問題は理由を添えて修正してよい）
- フロントは eslint の import 並び替え（simple-import-sort）に従う。Rust は `cd back && cargo fmt` で整形する（設定は `back/rustfmt.toml`、幅 100）
