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
- デスクトップアプリの「場所」（docs の FN0002-BR20・BR21）: 自分の PC（いつも使える。共有サーバーで入れてもバックエンドを起動する）と共有サーバー（5 つまで。名前・URL・色）を登録し、ヘッダーの場所（`pages/common/PlaceSwitcher.tsx`。共有サーバーを登録したときだけ出す）か `Alt+0` で**再起動せずに**切り替える（画面を読み込み直してホームへ。`app/places.ts`・`app/DesktopGate.tsx`）。ログインのトークン・最近開いたものは場所ごと（`api/client.ts` の `setPlaceScope`）。設定は `config.toml` の `local_name`・`local_color`・`start_place`・`[[servers]]`（設定画面の「場所」。Tauri の `save_places`）。インストーラー（`desktop/src-tauri/installer-hooks.nsh`。共有サーバーは PowerShell で `/api/server-info` を呼んで接続を確かめる）は古い書き方の `mode`・`server_url` を書き、起動したときに読み替える。それ以外は初回起動の画面で選ぶ。共有サーバーにつながらなければ専用の画面（`pages/setup/ServerUnreachable.tsx`。FN0002-BR18・BR19）。場所をまたいだ検索は今後も入れない（検索が遅くなるため）。比べるも今は同じ場所だけ（`ari://` には場所を入れる。FN0004-BR07）
- 自分の PC のバックエンドは 8080。ほかのアプリが使っていれば 8081〜8099（`SetupStatus.apiPort`、画面はそのポートにつなぐ）、8080〜8099 を ari-docs が使っていれば 2 つ目は起動しない（`choose_port`。docs の FN0002-BR22）。公開している PC は決めたポート（既定 8080。設定画面で変えられる。`config.toml` の `host_port`、Tauri の `set_host_port`。FN0005-BR10）だけ
- この PC の公開（docs の FN0005）: 共有 PC のデスクトップアプリを設定画面の「この PC の公開」（`pages/setting/HostSetting.tsx`）から共有サーバーにする。公開するときに最初の管理者を登録し、ユーザー local のデータをその管理者に移して local を消す（`service/host.rs`。ユーザーを指す列を増やしたら `LOCAL_USER_COLUMNS` に足す）。`config.toml` の `shared_host = true`（共有モード・ログインあり）・`publish`（`true` なら `0.0.0.0:8080`、`false` は `127.0.0.1` だけ）。Tauri の `publish_host`・`set_publish`。公開をやめても個人用（ローカルモード）には戻さない。通信は HTTP（プライベートのネットワークだけで使う）。公開している PC の中でも、ファイルはほかの PC と同じくダウンロードして開く（FN0005-BR09）。共有モードで復元しても復元した管理者は残す（`service/backup.rs` の `keep_restorer`。FN0901-BR10）
- アプリの更新（docs の FN0904）: デスクトップアプリが Tauri の updater（`tauri-plugin-updater`）で GitHub Releases から新しい版を取ってきて入れ替える。共有サーバーにつないでいるときはログインした後に自動で調べ、サーバーと同じ版（`/api/server-info` の `version`）の `releases/download/v<版>/latest.json` まで上げる（サーバーより新しくしない）。サーバーの `<データのフォルダ>/app-update/` に配布物と `.sig` があればそちらが先（GitHub につながらない会社用。`/api/app-update/…`・`service/app_update.rs`）。自分の PC は起動したときに調べるかを一度だけ聞く（個人の設定 `updateCheck`。`pages/common/UpdateNotice.tsx`）。`updateCheck` が `off` ならどの場所でも自分からは調べない（FN0904-BR19）。署名の公開鍵は `tauri.conf.json` の `plugins.updater.pubkey`（サーバーの更新もこれで確かめる）、秘密鍵は Actions の Secrets。版は `desktop/src-tauri/Cargo.toml` と `back/Cargo.toml` を同じ値にし、`v<版>` のタグで Releases に載る（docs の OP0002 の 3.1）。版は v0.x で始め、設計書を見直したら v1.0.0
- サーバーの更新（FN0904-BR14〜BR18）: Linux の共有サーバー（`back <config.toml>` で起動。`main.rs` が `enable_self_update`）は、管理者が設定の「情報」から入れ替える（`service/server_update.rs`・`/api/server-update`）。Actions が作るサーバー一式（`ari-docs-server_<版>_linux-x86_64.tar.gz`。`latest.json` の `server-linux-x86_64`）か、管理者が上げたものを、署名を確かめ → `.update-new/` に展開 → `back --version` で確かめ → DB の写し（`<データのフォルダ>/server-update/`）→ `back`・`models` を入れ替え（前は `.old`）→ 同じ引数で `exec` し直す。この PC の公開のサーバーはアプリの更新でいっしょに上がる
- 製品の方針: 自分の PC に exe で入れる。個人用は PC の中だけで完結（外部への通信・外部ソフトのインストールを求めない）。当面すべて無料（docs の 0000_システム概要 2.1）。配布物は GitHub Actions（`.github/workflows/build.yml`）でも Windows・Linux を作れる

### ユーザー管理（共有モード）

- ユーザーは管理者（`user.role_id = 'admin'`）が設定画面で登録・削除・パスワード再設定する。権限は `role_id` の `admin` / `user` だけ（`role` テーブルは T022 で消した）。ユーザーが 1 人もいなければログイン画面で最初の管理者を登録できる。ほかの PC からは登録用のコードが要る（ユーザーか管理者の PC が無い共有サーバーが起動したときに作り、標準出力と `<データのフォルダ>/setup-code.txt` に出す。`127.0.0.1` からは不要。`service/setup_code.rs`。FN0102-BR02）。画面の無い Linux でもサーバーは起動するだけでよい
- 利用者に付ける許可（FN0102-BR11。`user_permission`）: `dictionary`（検索の辞書）・`exclusion`（全員の検索の対象外）・`backup`（バックアップを取る・一覧・設定。ダウンロード・復元・削除は管理者だけ）。既定は無し。判定は `auth::has_permission`、画面は `/api/me` の `permissions` と `hasPermission`
- 管理者の PC（FN0102-BR12。`admin_device`）: 管理者の操作は登録した PC からだけ。画面は場所（URL）ごとの鍵を `X-Ari-Device` で送り（`api/client.ts`。個人の設定には入れない。サーバーを呼ぶときは必ず `api/client.ts` を通す）、サーバーは SHA-256 だけを残す。登録していない PC の管理者は `get_login_user` で利用者に落とす（`service/admin_device.rs` の `apply`、`/api/me` の `adminElsewhere`）。PC を足すのは登録した PC で発行するコード（10 分・1 回）、すべて失ったら登録用のコード。サーバーの PC の中でまだ 1 台も無ければログインで自動登録（FN0005 のため）。管理者の判定に `auth::is_admin` を使えば、この仕組みに乗る
- ユーザー削除ではその人の Note・お気に入り・設定も消し、Wiki は残す。自分は削除できない。管理者はほかの人の管理者・利用者を切り替えられる（自分は不可。`/api/users/role`。FN0102-BR10）
- 画面移動の `Alt+数字` はヘッダーに出ているメニューへ左から順に振る（Setting は一番右。Docs を出さなければ Setting が `Alt+5`、出せば Docs が `Alt+5`・Setting が `Alt+6`。`front/src/shortcut/shortcut.ts` の `navigationItems`）。`?` でショートカット一覧
- ショートカットのキーは設定の「ショートカット」で変えられる（FN0701-BR16。個人の設定の `shortcut-keys`）。`SHORTCUT` の値をその場で書き換えるので、キーの判定は `isShortcut`、表示は `shortcutLabel(SHORTCUT.X)` を使い、キーの文字を直に書かない
- ホームの検索は、検索欄の横で探す種類（Excel・Word・PDF・画像・Note・Wiki など。複数可、既定はすべて）を選べる。種類は拡張子で決め、サーバーの `search/kind.rs` と画面の `preferences.ts` の `SEARCH_TYPES` で名前をそろえる。選んだ種類はこの PC の設定（docs の FN0201-BR09）。同じボタンで「ファイル名・フォルダ名だけで探す」も選べる（`searchNameOnly`、`/api/home/search` の `nameOnly`。パスの最後の名前だけを見る。BR10）
- ari-docs のリンク（docs の FN0004）: `ari://folder|file/{パス}`・`ari://wiki|note/{ID}` の文字で場所を渡す（PC の絶対パスではない）。作るのは Folder の右クリック・Ctrl+Shift+C、Note・Wiki の 🔗。開くのは探して開く・ホームの検索欄に貼る、本文のリンクを押す（`front/src/lib/ariLink.ts`・`app/useAriLink.ts`・`ContentMarkdown.tsx` の `urlTransform`）。ファイルは OS で開かず Folder で選ぶ。末尾の `?server=` は作った場所（共有サーバーは `/api/server-info` の `serverId`。`system_setting` の `server_id`。自分の PC は `local`）で、別の場所のリンクはデスクトップアプリがその場所に切り替えてから開く（FN0004-BR07）
- 探して開く（docs の FN0003）: `Ctrl+P`（Vim モードは `o`、本文の Vim のエディタは `:e`）で Note・Wiki・ファイル・フォルダ・画面・操作を名前のあいまい検索で開く（`front/src/quickOpen/`、API は `/api/home/quick-open`・`back/src/search/fuzzy.rs`。点数の付け方は画面とサーバーで同じにする）。最近開いたものはこの PC の `localStorage`（`recent-opened:<ユーザー ID>`）
- 設定は個人と共有に分ける（docs の FN0701-BR15）。個人の設定（配色・文字の大きさ・Vim など、画面の `localStorage` の値）は、デスクトップアプリが設定ファイルと同じフォルダの `preferences.json` にも保存し（Tauri の `load_preferences`・`save_preferences`。`front/src/app/personalSettings.ts`。書き換えたら `personalSettingsChanged()` を呼ぶ）、起動したときに戻してから画面を描く（`main.tsx` → `start.tsx`）。どの場所でも同じで、共有サーバーには送らない。ログインのトークン・最近開いたものは入れない。共有の設定は「サーバーの設定」など管理者が決めるものだけ
- エラーのログ（docs の OP0009）: `crate::elog!`（`common/error_log.rs`）が標準エラーと `<データのフォルダ>/logs/error.log` に書く（エラーだけ。1 MB×5 個まで）。サーバーのエラーは `eprintln!` でなく `elog!` で出す
- 配色はライト・ダーク・OS に合わせる。ブラウザの `localStorage` に保存する（`front/src/app/theme.ts`）。色は Tailwind の `slate-*` などを直接書かず、`global.css` の変数（`bg-background`・`text-muted-foreground`・`border-border`・`bg-brand` など）を使う

### Note

- 作成者本人のみ参照・編集・削除できる。検索も本人の Note のみ対象
- Note 削除時はその Note のお気に入りも削除する
- タイトルはサーバー側でも検証する（前後の空白を除いて空・25 文字超は 400。`api/validation.rs` の `not_blank`）。Wiki も同じ（作成も更新も 25 文字まで）

### Wiki

- 全ユーザーで共有する。`wiki.user_id` は**作成者**を表すだけで、絞り込みには使わない
- ログインユーザーなら誰でも一覧・参照・編集・削除できる。検索も全 Wiki が対象（ホームの検索の Note・Wiki はタイトルに合うものが先、同じなら新しい順。FN0201-BR03）
- Wiki 削除時は全ユーザーのお気に入りを削除する
- 同時編集のお知らせ（docs の FN0501-BR11）: 共有モードで Wiki に未保存の変更がある間だけ、書き始めたときと 5 分ごとに `/api/wiki/editing` で知らせ、ほかに書いている人・保存した人を出す（つなぎっぱなしにしない。サーバーはメモリに 11 分覚える。`service/editing.rs`・`pages/content/useEditingNotice.ts`）
- 保存すると最後に更新した人（`wiki.updated_by`）を記録する。保存のときに開いたときの更新日時（`baseUpdatedAt`）と違えば 409 で確認し、`force` で上書き（Note も同じ）。Note・Wiki の版は `content_history` に残す（100 件まで。docs の FN0402）
- Note・Wiki・お気に入りの一覧に件数の制限は無い
- 本文の編集の手助け（docs の FN0404）: 書式のボタン（`pages/content/MarkdownToolbar.tsx`）・キー（Ctrl+B など。`shortcut.ts` の `MD_*`）・表の挿入と整形（`pages/content/markdown/`。書き換えはエディタに依存しない関数にし、`editorHandle.ts` で textarea と Vim のエディタに当てる）。Vim のエディタは書式のキーを挿入モードのときだけ受ける。本文の字体は等幅
- Note・Wiki のボタンには一言の説明（`components/common/Hint.tsx`、`IconButton` の `hint`）。マウスを乗せたとき・キーで選んだときに出す。この PC の設定 `buttonHints`（既定オン）で消せる
- 本文の画像は貼り付け・ドロップで入れ、画面で縮小（長い辺 1920 画素・WebP）してから `content_image`（DB）に保存する（サーバーの容量のため）。本文には `/api/content-image/{id}` と書き、表示は `ContentMarkdown.tsx` がトークンを付けて読み込む。Note の画像は本人（と使っている Wiki を読める人）だけ。使われなくなった画像は 1 日後に消す（毎時 15 分）。幅は `![名前|300](…)`、編集の画面では仕上がりの画像を右クリックして小・中・大・元の大きさを選べる（`markdown/imageSize.ts`。FN0404-BR07）
- Note・Wiki はフォルダ（入れ子あり）で分ける（docs の FN0403）。一覧は Ctrl・Shift+クリックでまとめて選んで移せる（FN0403-BR10）。フォルダは `content_folder`、入れ場所は別の表 `content_folder_item`（行が無ければ一番上。Note・Wiki の表は変えない）。Note のフォルダは本人だけ、Wiki のフォルダは全員で使う。削除できるのは中が空のフォルダだけ（Note・Wiki にはゴミ箱が無いため）。画面は `pages/content/`（`contentTree.ts`・`useContentFolders.ts`）

### ノード（ファイル・フォルダ）

- 受け取る大きさの上限は 1 GB（`router.rs` の `DefaultBodyLimit`。axum の既定 2 MB のままにしない）。ファイルのアップロードだけはサーバーの設定の `uploadMaxMb`（既定 1024、10240 まで。FN0902-BR07）で、メモリに読まずに `<データのフォルダ>/tmp/upload/` へ書いてから移す（FN0301-BR29）
- `node` テーブルはファイルの見張り（`batch/node_watch.rs`、数秒で反映）と 10 分ごとの全体の同期（`batch/node_sync.rs`。消えたものの行も消す）で合わせる
- 実体はノードのルート以下のファイルシステム。ルートは `back/config.toml` の `folder_root`（既定 `../folder`）で、アプリの初期設定でだけ決め、運用中は変えない（お気に入り等が相対パスで記録されるため）。`node` テーブルは同期バッチ（`batch/node_sync.rs`）で登録する
- パスは `folder/` からの相対パスで、先頭に `/` を付けない（例: `a/b/memo.txt`）。OS によらず `/` 区切り。`Path` から作るときは `common/fs_util.rs` の `relative_slash_path`（`to_string_lossy` だと Windows で `\` 区切りになる）
- 削除 API は `parentPath` + `name` で対象を特定する。`name` が空・`.`・`..`・`/` を含む場合は 400
- ノードの API はパスに `..`・絶対パスを含むものを 400 にする（`service/node.rs` の `resolve`。`folder/` の外を操作させない）。作成は同名があれば 409 で、上書きしない
- 削除したら `node` の行と全ユーザーのお気に入りも消す（フォルダなら配下も。`repository/node.rs` の `delete_with_descendants`）
- `node.path` は一意（T019 の `idx_node_path`）。登録は `INSERT OR IGNORE`（見張りと同期が同時に登録するため）
- ファイル・フォルダの説明（FN0301-BR33）: `node.description`（200 文字まで。だれでも書ける）。詳細のダイアログで書き（`/api/nodes/description`）、一覧・右のプレビュー・ホームの名前の検索に使う。ゴミ箱へ移すと `trash_description` に控えて、元に戻したら入れ直す。状態（`node.status`）は持たない
- 更新者（FN0301-BR34）: ari-docs で作成・アップロード・名前の変更・移動・コピー・削除したとき、そのものと親フォルダに `node.updated_by` と今の更新日時を記録する（`service/node.rs` の `record_updates`）。見張り・同期が違う更新日時を見たら（外で変わったら）空に戻す（`update_modified_at`）
- 名前の変更・移動では `node` の行のパスを書き換え（`repository/node.rs` の `move_paths`）、`node_id` を保つ（お気に入り・中身の検索がそのまま使える）。コピーはノード同期に任せる
- ファイルのロック（docs の FN0301-BR38。共有モード）: `node_lock`（node_id・user_id・期限は UNIX 秒）。ほかの人のロックは `service/node_lock.rs` の `ensure_unlocked` で上書き・名前の変更・移動・削除を 423 で止める（フォルダは中も見る。ファイルを変える API を足したらここも通す）。期限が過ぎたものは読むときに無視する。ロックした人と管理者が外せる。期限の上限は `server_settings` の `fileLockMaxDays`（既定 7 日）。一覧は設定の「ロック中のファイル」（`/api/nodes/locks`・`LockSetting.tsx`）。開いたファイルの戻し（`lib/editSync.ts`）は、ほかの人のロックなら別の名前で保存するかを聞く
- 比べる（docs の FN0304）: Folder の右クリックの「2 つを比べる」「比べる相手に選ぶ」から `/compare`（`pages/compare/`）。Excel はシートごとに行をそろえて変わったセルと数式の違い（FN0304-BR07。色・罫線は比べない）を返す（`service/compare.rs`）、Word・PowerPoint・PDF・テキストは文字を返して画面で左右に並べる（`lib/lineDiff.ts` の `sideBySide`・`diffChars`）、フォルダは同じ・違う・片方だけ。変更履歴の「前の版との違い」も同じ部品（`TextCompare.tsx`）
- Folder の一覧の右にプレビュー（`pages/node/PreviewPane.tsx`。中身の表示は Space のダイアログと共通の `FilePreview.tsx`）。開いたときに出すかはこの PC の設定（`folderPreviewPane`、既定オン）、Alt+P で出し入れ（docs の FN0301-BR31）。プレビューは 30 MB まで、テキスト・CSV・Markdown は先頭 1 MB だけ（`previewFormats.ts` の `MAX_TEXT_PREVIEW_BYTES`。FN0301-BR30）。一覧が狭いと説明・更新者の列を出さない（`NodeTable.tsx` の `NARROW_HIDDEN`。名前の幅を残す。列を足すときは幅と合わせて考える）
- フォルダ画面の操作はエクスプローラーに合わせる（複数選択・右クリックのメニュー・F2・Ctrl+C/X/V・Delete・ドラッグで移動、Ctrl+ドラッグでコピー）。空いているところ・名前の外の列からのドラッグで囲んで選ぶ（FN0301-BR35）。新しいウィンドウ（`Ctrl+Shift+N`・右クリックの「新しいウィンドウで開く」。`app/windows.ts`・Tauri の `open_window`。窓は `/?page=…&state=…&place=…` で開き、`start.tsx` が描く前にその画面にする）。窓どうしのドラッグ（データに場所を入れる。`nodeDrag.ts`）・切り取りと貼り付け（`nodeClipboard.ts`。localStorage）で移し、変えたら BroadcastChannel でほかの窓の一覧を読み直す（FN0301-BR36）。デスクトップアプリは `tauri.conf.json` の `dragDropEnabled: false` でないと OS のファイルのドロップが画面に届かない

### ファイルの中身の検索（docs の FN0202）

- 取り込みバッチ（`batch/content_index.rs`、毎分 30 秒）が、変わったファイル（更新日時・サイズ・辞書の版で判断）だけを取り込む。時間差は許容する
- 文字の取り出しは `search/extract.rs`（Excel・Word・PowerPoint・PDF・テキスト。古い `.doc`・`.ppt` は `search/legacy_office.rs` で文字だけ。FN0202-BR18）、単語の区切りは `search/tokenizer.rs`（lindera + IPADIC。普通と細かい区切りの両方）。同じ単語は `keyword` の 1 行にまとめ、`node_keyword` で結ぶ。文章そのものは保存しない（抜粋は出さない）。検索語の各単語は、登録した単語との部分一致（`LIKE '%単語%'`）で探す（区切り目のずれで見落とさないため。完全に一致した単語の多いファイルを先に並べる。`repository/search.rs` の `find_nodes_by_words`）
- 画像の中の文字は、アプリに組み込んだ文字認識（PaddleOCR PP-OCRv6 small + ONNX Runtime。`oar-ocr`）で読む（`search/ocr.rs`・PDF はページを `hayro` で描く `search/pdf_ocr.rs`。docs の FN0202-BR14・BR15）。対象は PDF の文字の無いページ・PDF と Excel・Word・PowerPoint に貼り付けた画像・画像ファイル。モデルは `back/models/`（git に入れない。ビルドのとき `back/build_models.rs` が公式の配布元から取得し SHA-256 で確認）、配布物は exe の横の `models/`（`config.toml` の `ocr_models_dir`）。無ければ文字認識だけ飛ばす。文字認識の要るファイルは後に回して小さい順。開発用のビルドも外部の部品は最適化する（`Cargo.toml` の `profile.dev.package`）
- Excel は セル・シート名に加えて、図形・テキストボックス・コメント（`xl/drawings`・`xl/comments`・`xl/threadedComments`）も読む。取り出し方を変えたら `search/index.rs` の `EXTRACTOR_SALT` を変える（すべてのファイルを取り込み直す）
- 対応する形式は `search/extract.rs` の `FORMAT_GROUPS`（プレビューは `front/src/lib/previewFormats.ts`）。一覧は設定画面の「対応するファイル」（`/api/search/formats`）と docs の `10_要件定義/0030_対応するファイル.md`。形式を増やしたら docs も直す
- 業界用語などは「検索の辞書」（`search_dictionary`）に登録する。変えるとすべてのファイルを順に取り込み直す。共有モードでは管理者と許可（`dictionary`）を付けた利用者だけが変更できる
- 検索の対象外（`search_exclusion`。docs の FN0202-BR16・BR17）: パス（そのフォルダ・ファイルと中のもの）か名前の型（`backup*` など。どこにあっても）で指定し、ホームの検索（名前・中身）・最近の更新・探して開くに出さない（Folder の画面では見える）。全員の対象外（`user_id` が空。共有モードは管理者と許可（`exclusion`）を付けた利用者だけが変更）は中身の取り込みもしない。共有モードは本人だけの対象外もある（結果から外すだけ）。ローカルモードは全員の対象外だけ。判定は `search/exclusion.rs`、設定画面の「検索の対象外」と Folder の右クリックから指定する

### ゴミ箱・バックアップ（docs の FN0302・FN0901）

- 削除（`/api/nodes/delete`）はゴミ箱へ移す（`<DB のフォルダ>/trash/<trash_id>/`、`trash` テーブル。お気に入りは `trash_favorite` に控えて、元に戻したら入れ直す）。元に戻す・完全に削除・空にするは共有モードでもだれでもできる（FN0302-BR04）。容量の上限（`backup_settings` の `trashMaxMb`、0 は上限なし）を超えたら古いものから消す（FN0302-BR09）
- バックアップは DB の写し（`VACUUM INTO`）と `folder/` を 1 つの ZIP にする（`service/backup.rs`）。設定は `system_setting` の `backup_settings`。定期の処理は毎分 45 秒（間隔ごとに 1 回）。復元では今の状態を先にバックアップし、`backup`・`system_setting`・`trash` は今のものを残す。実行中は `backup::is_busy()` でほかのバッチを止める。画面から ZIP を取り込むことはしない（別の PC へ移すのは docs の OP0008 の 2.3）。自動のバックアップに失敗したら、その期間は取り直さず（次の予定まで待つ。設定を保存したらすぐ取り直す）画面に出す
- 共有モードで開いたファイルは、デスクトップアプリが見張り（`open_download` → `ari-docs://file-changed`）、画面が自動でアップロードし直す（`front/src/lib/editSync.ts`）

### お気に入り

- ユーザーごとに管理する（`favorite.user_id`）。対象はノード・Note・Wiki のいずれか 1 つ
- ノードのお気に入りは `node.node_id` で紐づける（パスから引く）
- 画面に返すときは解除用の `favoriteId` を必ず含める
- 同じユーザーが同じ対象を登録したら、新しく作らず既存の `favoriteId` を返す
- 並びは利用者が決める（ホームでドラッグ・`Alt+↑↓`。`favorite.sort_order`、`/api/favorite/order`）。新しく登録したものは一番上（docs の FN0601-BR08）

### 設定画面（docs の FN0701・FN0902・FN0903）

- メニューはまとまり（`settingSection.ts` の `group`）ごとに並べ、`keywords` で探せる。開いているメニューは URL の `?section=`
- 配色・文字の大きさ・画面の動き・起動したときの画面・削除の確認・隠しファイルは、この PC（`localStorage`）に保存する（`front/src/app/preferences.ts`）。書き出し・読み込み・初期化もここ。サーバーには送らない
- 削除はゴミ箱へ移すので既定では確認しない。「削除の前に確かめる」をオンにした PC だけ確認する
- Vim モード（docs の FN0702。既定オフ、この PC の `localStorage` の `vim`）: 入力欄の外のキーを Vimium と同じ考え方で操作にする（`front/src/vim/`）。キーは操作ごとに設定で変えられる（`actions.ts`・`vimSettings.ts`）。一覧のある画面は `useVimHandlers` で「j で次の行」などを登録し、無ければスクロール。画面の部品が先に使ったキー（`defaultPrevented`）・入力中のキーは使わない。Note・Wiki の本文は CodeMirror + `@replit/codemirror-vim`（`VimEditor.tsx`、Vim モードのときだけ読み込む。`:w` 保存・`:q` 一覧へ）。領域の移動は `<C-h>`・`<C-l>`（サイドバー `data-vim-pane`・行 `data-vim-item`。`panes.ts`）。`<C-w>` は既定にしない（ブラウザではタブが閉じる）。Folder の一覧は `yy`・`x`・`p`・`D`・`cw`・`V`（範囲選択）でファイルを扱う（`d` は半ページ下へなので切り取りは `x`）

### Markdown ビューア（`/docs`）

- メイン機能とは別の機能。使うかは管理者が「サーバーの設定」で決める（`server_settings` の `docsEnabled`、既定はオフ。docs の FN0902-BR06）。オフならヘッダー・`Alt+数字`・探して開く・Vim の `gd`・起動したときの画面・設定の「Docs の初期フォルダ」に出さず、`/docs` は Home へ移り、API は 404。画面は `/api/me` の `docsEnabled` で判断する
- 指定したフォルダ以下の `.md` を閲覧専用で表示する。本文の相対パスの画像は、そのフォルダの中の画像だけを `/api/doc-image` で読む（FN0801-BR16）。Folder（ノード）機能とは独立させる（ノードは DB の状態と紐づくため）
- 表示するフォルダは URL の指定 → 設定画面の「Docs の初期フォルダ」（`user_setting.docs_root`）→ リポジトリの `docs/` の順に決める。初期フォルダが消えていたら `docs/` を表示してお知らせを出す
- 任意のフォルダを指定できるのはローカルモードのみ。共有モードで指定すると 403
- 指定フォルダの外のファイル（`..`・絶対パス・シンボリックリンク経由）と `.md` 以外は読めない
- `docs/00_概要/0090_ドキュメントルール.md` に沿ったチェック結果（id とファイル名の不一致など）を警告として表示する

### 未決事項

- （今のところ無し。docs の各文書の「未決事項」と要件一覧 RQ0001 を参照）

## 作業ルール

- 作業がまとまったらコミットして push してよい。版を出すときは `v<版>` のタグも付けてよい（2026-11-25 のユーザーの許可）。秘密（鍵・.env など）は入れない
- `back/data/ari.db` は開発用の使い捨て DB（将来は exe の初期化時に作成する）。バックアップは不要
- `folder/` はテスト用のデータなので、中のファイル操作は確認不要
- 意図しない変化を指摘されたら、すぐ差し戻さず原因を説明して「戻すか」を確認する
- 依頼範囲外で見つけた不具合は勝手に直さず、報告して確認する（セキュリティ上の問題は理由を添えて修正してよい）
- フロントは eslint の import 並び替え（simple-import-sort）に従う。Rust は `cd back && cargo fmt` で整形する（設定は `back/rustfmt.toml`、幅 100）
