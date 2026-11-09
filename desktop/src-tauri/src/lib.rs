use std::fs;
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use ari_back::{AppConfig, AppMode};
use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

// バックエンドの待ち受けポート（フロントは http://localhost:8080 を呼ぶ）
const API_PORT: u16 = 8080;

// 使い方。インストーラーか初回起動の画面で選ぶ
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug, Default)]
#[serde(rename_all = "lowercase")]
enum UseMode {
  // 個人用。バックエンドを同じプロセスで動かす（自分の PC からだけ使える）
  #[default]
  Local,
  // 共有サーバーに接続する。バックエンドは動かさない
  Server,
}

impl UseMode {
  fn as_str(self) -> &'static str {
    match self {
      UseMode::Local => "local",
      UseMode::Server => "server",
    }
  }
}

// exe と同じフォルダに置く設定。使い方と、個人用の作業フォルダ・共有サーバーの URL を持つ。
// インストーラー（installer-hooks.nsh）も同じ形式で書く
#[derive(Serialize, Deserialize, Debug, PartialEq)]
struct DesktopConfig {
  // 使い方。無ければ個人用（以前の設定ファイルには無いため）
  #[serde(default)]
  mode: UseMode,
  // 個人用の作業フォルダ。相対パスは exe のフォルダから。"." は exe と同じフォルダ
  #[serde(default = "default_workspace")]
  workspace: String,
  // 共有サーバーの URL（例: http://ari-server:8080）
  #[serde(default)]
  server_url: String,
}

fn default_workspace() -> String {
  ".".to_string()
}

impl Default for DesktopConfig {
  fn default() -> Self {
    Self {
      mode: UseMode::Local,
      workspace: default_workspace(),
      server_url: String::new(),
    }
  }
}

const CONFIG_HEADER: &str = "\
# ari-docs の設定
# mode: local（個人用）/ server（共有サーバーに接続）
# workspace: 個人用の作業フォルダ（folder/ と .ari-docs/ を置く場所）。相対パスは exe のフォルダから。\".\" は exe と同じフォルダ
# server_url: 共有サーバーの URL（mode = \"server\" のとき）
";

// 起動の状態。画面はこれを見て、起動エラーの画面かホームかを決める
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct SetupStatus {
  // 作業フォルダの準備ができ、バックエンドが動いている
  configured: bool,
  // 作業フォルダの絶対パス（デバッグビルドでは空文字）
  workspace: String,
  // 作業フォルダが見つからないなど、表示するエラー（無ければ空文字）
  error: String,
  // 作業フォルダを変えられる（exe のフォルダの config.toml を使っている）。
  // デバッグビルドと、exe のフォルダに書き込めないときは false
  can_change_workspace: bool,
  // 使い方。local（個人用）/ server（共有サーバーに接続）。まだ選んでいなければ空文字
  mode: String,
  // 共有サーバーの URL（mode が server のとき）。個人用では空文字
  server_url: String,
  // 使い方を変えられる（exe のフォルダの config.toml を使っている）
  can_change_mode: bool,
}

// 選んだフォルダを調べた結果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceInfo {
  // 既に ari-docs のデータ（.ari-docs/）がある
  has_ari_docs: bool,
}

struct AppData {
  // exe のフォルダ。デバッグビルドでは None（back/config.toml を使う）
  app_dir: Option<PathBuf>,
  status: Mutex<SetupStatus>,
}

// Windows の canonicalize は \\?\C:\… の形を返すため、普通の形（C:\…、\\server\share\…）に戻す
fn simplify(path: PathBuf) -> PathBuf {
  #[cfg(windows)]
  {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
      return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
      return PathBuf::from(rest);
    }
  }
  path
}

fn canonicalize(path: &Path) -> Result<PathBuf, String> {
  fs::canonicalize(path)
    .map(simplify)
    .map_err(|_| format!("フォルダが見つかりません: {}", path.display()))
}

// exe のフォルダ。AppImage は読み取り専用の一時フォルダから動くため、.AppImage ファイルのフォルダを使う
fn app_dir() -> Result<PathBuf, String> {
  #[cfg(target_os = "linux")]
  if let Some(appimage) = std::env::var_os("APPIMAGE") {
    if let Some(dir) = Path::new(&appimage).parent() {
      return canonicalize(dir);
    }
  }
  let exe = std::env::current_exe().map_err(|e| format!("exe の場所を取得できません: {e}"))?;
  let exe = fs::canonicalize(&exe).unwrap_or(exe);
  let dir = exe
    .parent()
    .ok_or_else(|| format!("exe のフォルダを取得できません: {}", exe.display()))?;
  canonicalize(dir)
}

// 設定の workspace を絶対パスにする（"." などは取り除く）
fn resolve_workspace(app_dir: &Path, workspace: &str) -> PathBuf {
  app_dir.join(workspace).components().collect()
}

// 設定に保存する workspace。exe のフォルダなら "."（フォルダごと移しても使えるように）、それ以外は絶対パス
fn workspace_value(app_dir: &Path, workspace: &Path) -> String {
  if workspace == app_dir {
    ".".to_string()
  } else {
    workspace.to_string_lossy().to_string()
  }
}

// 作業フォルダの構成: <作業フォルダ>/folder（ファイルの置き場所）、<作業フォルダ>/.ari-docs/ari.db（DB）
fn backend_config(workspace: &Path, models_dir: &Path) -> AppConfig {
  let folder = workspace.join("folder");
  AppConfig {
    mode: AppMode::Local,
    // ローカルモードは常に 127.0.0.1 で待ち受ける（AppConfig::listen_address）
    bind_address: "127.0.0.1".to_string(),
    port: API_PORT,
    tls_cert: String::new(),
    tls_key: String::new(),
    folder_root: folder.to_string_lossy().to_string(),
    database_path: workspace
      .join(".ari-docs")
      .join("ari.db")
      .to_string_lossy()
      .to_string(),
    docs_default_root: folder.to_string_lossy().to_string(),
    // 文字認識のモデル（インストーラー・AppImage に同梱する models フォルダ。docs の FN0202-BR15）
    ocr_models_dir: models_dir.to_string_lossy().to_string(),
  }
}

fn prepare_workspace(workspace: &Path) -> Result<(), String> {
  if !workspace.is_dir() {
    return Err(format!("フォルダが見つかりません: {}", workspace.display()));
  }
  for dir in ["folder", ".ari-docs"] {
    fs::create_dir_all(workspace.join(dir))
      .map_err(|e| format!("{dir} を作れませんでした（{}）: {e}", workspace.display()))?;
  }
  Ok(())
}

fn write_config(path: &Path, config: &DesktopConfig) -> Result<(), String> {
  let text = toml::to_string(config).map_err(|e| format!("設定の保存に失敗しました: {e}"))?;
  fs::write(path, format!("{CONFIG_HEADER}{text}"))
    .map_err(|e| format!("設定の保存に失敗しました（{}）: {e}", path.display()))
}

// exe のフォルダの config.toml を読む。無ければ None（初回起動。使い方を選ぶ画面を出す）
fn load_config(app_dir: &Path) -> Result<Option<DesktopConfig>, String> {
  let path = app_dir.join("config.toml");
  if !path.exists() {
    return Ok(None);
  }
  let text = fs::read_to_string(&path)
    .map_err(|e| format!("設定を読めません（{}）: {e}", path.display()))?;
  toml::from_str(&text)
    .map(Some)
    .map_err(|e| format!("設定を読めません（{}）: {e}", path.display()))
}

// 設定を保存する。exe のフォルダに書き込めなければ、その旨のエラーにする
fn save_config(app_dir: &Path, config: &DesktopConfig) -> Result<(), String> {
  write_config(&app_dir.join("config.toml"), config).map_err(|_| {
    format!(
      "exe のフォルダに書き込めません: {}。書き込めるフォルダに ari-docs をフォルダごと置いてください。",
      app_dir.display()
    )
  })
}

// 共有サーバーの URL を確かめて整える（前後の空白と末尾の / を取り除く）
fn normalize_server_url(url: &str) -> Result<String, String> {
  let url = url.trim().trim_end_matches('/');
  let rest = url
    .strip_prefix("http://")
    .or_else(|| url.strip_prefix("https://"))
    .ok_or_else(|| "URL は http:// か https:// で始めてください".to_string())?;
  if rest.is_empty() || rest.contains(['/', ' ', '?', '#']) {
    return Err("URL は「http://サーバー名:ポート」の形で入力してください".to_string());
  }
  Ok(url.to_string())
}

// 起動時に使い方を決め、個人用なら作業フォルダでバックエンドを起動する
fn start(app_dir: &Path, models_dir: &Path) -> SetupStatus {
  let mut status = SetupStatus {
    can_change_mode: true,
    ..Default::default()
  };
  let config = match load_config(app_dir) {
    Ok(Some(config)) => config,
    // 初回起動。画面で使い方を選ぶ
    Ok(None) => return status,
    Err(e) => {
      status.error = e;
      return status;
    }
  };
  status.mode = config.mode.as_str().to_string();
  if config.mode == UseMode::Server {
    match normalize_server_url(&config.server_url) {
      Ok(url) => {
        status.server_url = url;
        status.configured = true;
      }
      Err(e) => status.error = format!("共有サーバーの URL が正しくありません。{e}"),
    }
    return status;
  }
  status.can_change_workspace = true;
  let workspace = resolve_workspace(app_dir, &config.workspace);
  status.workspace = workspace.to_string_lossy().to_string();
  let result = prepare_workspace(&workspace).and_then(|_| {
    tauri::async_runtime::block_on(ari_back::server::start(
      backend_config(&workspace, models_dir),
      API_PORT,
    ))
  });
  match result {
    Ok(()) => status.configured = true,
    Err(e) => status.error = format!("作業フォルダで起動できませんでした。{e}"),
  }
  status
}

// デバッグビルド: リポジトリの back/config.toml（folder/・back/data/ari.db）で起動する。
// 環境変数 ARI_DOCS_SERVER_URL があれば、バックエンドを起動せずにその共有サーバーへ接続する
fn start_dev() -> SetupStatus {
  let mut status = SetupStatus {
    mode: UseMode::Local.as_str().to_string(),
    ..Default::default()
  };
  if let Ok(url) = std::env::var("ARI_DOCS_SERVER_URL") {
    status.mode = UseMode::Server.as_str().to_string();
    match normalize_server_url(&url) {
      Ok(url) => {
        status.server_url = url;
        status.configured = true;
      }
      Err(e) => status.error = e,
    }
    return status;
  }
  match tauri::async_runtime::block_on(ari_back::server::start(
    ari_back::load_dev_config(),
    API_PORT,
  )) {
    Ok(()) => status.configured = true,
    Err(e) => status.error = e,
  }
  status
}

#[tauri::command]
fn setup_status(data: State<AppData>) -> SetupStatus {
  data.status.lock().unwrap().clone()
}

#[tauri::command]
fn inspect_workspace(path: String) -> WorkspaceInfo {
  WorkspaceInfo {
    has_ari_docs: Path::new(&path).join(".ari-docs").is_dir(),
  }
}

// 作業フォルダを変える。folder/ と .ari-docs/ を作って config.toml に保存し、アプリを再起動する
// （バックエンドは同じプロセスで動いているため、再起動して新しい作業フォルダで起動し直す）
#[tauri::command]
fn change_workspace(path: String, app: AppHandle, data: State<AppData>) -> Result<(), String> {
  if !data.status.lock().unwrap().can_change_workspace {
    return Err("作業フォルダを変えられません".to_string());
  }
  let Some(app_dir) = &data.app_dir else {
    return Err("作業フォルダを変えられません".to_string());
  };
  let workspace = canonicalize(Path::new(&path))?;
  prepare_workspace(&workspace)?;
  let mut config = load_config(app_dir)?.unwrap_or_default();
  config.mode = UseMode::Local;
  config.workspace = workspace_value(app_dir, &workspace);
  save_config(app_dir, &config)?;
  app.request_restart();
  Ok(())
}

// 使い方を選ぶ・変える。config.toml に保存してアプリを再起動する。
// 個人用は今の作業フォルダ（無ければ exe と同じフォルダ）を使う。共有サーバーの URL は画面で接続を確かめてから渡す
#[tauri::command]
fn change_mode(
  mode: String,
  server_url: String,
  app: AppHandle,
  data: State<AppData>,
) -> Result<(), String> {
  if !data.status.lock().unwrap().can_change_mode {
    return Err("使い方を変えられません".to_string());
  }
  let Some(app_dir) = &data.app_dir else {
    return Err("使い方を変えられません".to_string());
  };
  let mut config = load_config(app_dir)?.unwrap_or_default();
  match mode.as_str() {
    "local" => config.mode = UseMode::Local,
    "server" => {
      config.mode = UseMode::Server;
      config.server_url = normalize_server_url(&server_url)?;
    }
    _ => return Err("使い方が正しくありません".to_string()),
  }
  save_config(app_dir, &config)?;
  app.request_restart();
  Ok(())
}

// 画面から送られたファイル（本文はそのままのバイト列、名前は x-file-name ヘッダーに URL エンコードして入れる）
fn downloaded_file(request: &Request<'_>) -> Result<(String, Vec<u8>), String> {
  let InvokeBody::Raw(data) = request.body() else {
    return Err("ファイルの内容が正しくありません".to_string());
  };
  let name = request
    .headers()
    .get("x-file-name")
    .and_then(|value| value.to_str().ok())
    .map(percent_decode)
    .unwrap_or_default();
  // パスを含む名前で、選んだ場所・一時フォルダの外に書かないようにする
  let name = Path::new(&name)
    .file_name()
    .map(|name| name.to_string_lossy().to_string())
    .filter(|name| !name.is_empty())
    .unwrap_or_else(|| "download".to_string());
  Ok((name, data.clone()))
}

fn percent_decode(value: &str) -> String {
  let bytes = value.as_bytes();
  let mut out = Vec::with_capacity(bytes.len());
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] == b'%' && i + 2 < bytes.len() {
      if let Ok(byte) = u8::from_str_radix(&value[i + 1..i + 3], 16) {
        out.push(byte);
        i += 3;
        continue;
      }
    }
    out.push(bytes[i]);
    i += 1;
  }
  String::from_utf8_lossy(&out).to_string()
}

// ダウンロードしたファイルを、保存先を選ばせて保存する。キャンセルしたら false
#[tauri::command]
async fn save_download(app: AppHandle, request: Request<'_>) -> Result<bool, String> {
  let (name, data) = downloaded_file(&request)?;
  let Some(path) = app.dialog().file().set_file_name(&name).blocking_save_file() else {
    return Ok(false);
  };
  let path = path
    .into_path()
    .map_err(|e| format!("保存先が正しくありません: {e}"))?;
  fs::write(&path, data).map_err(|e| format!("保存できませんでした（{}）: {e}", path.display()))?;
  Ok(true)
}

// 共有サーバーから開いたファイルの見張り（FN0301-BR28）。保存されたら画面に知らせ、画面がサーバーに戻す
struct Watch {
  path: PathBuf,
  // 最後に知らせた（または開いた）ときの更新日時とサイズ
  seen: (Option<SystemTime>, u64),
  // 変わったのを見つけたときの値。次の確認でも同じなら（書き込みが終わったとみなして）知らせる
  pending: Option<(Option<SystemTime>, u64)>,
  opened: Instant,
}

#[derive(Default)]
struct Watches {
  next_id: Mutex<u64>,
  items: Mutex<HashMap<u64, Watch>>,
}

// 見張る時間の上限（開いたまま放っておかれたものを見張り続けないため）
const WATCH_LIMIT: Duration = Duration::from_secs(24 * 60 * 60);
const WATCH_INTERVAL: Duration = Duration::from_secs(2);
const FILE_CHANGED_EVENT: &str = "ari-docs://file-changed";

fn file_state(path: &Path) -> Option<(Option<SystemTime>, u64)> {
  fs::metadata(path).ok().map(|m| (m.modified().ok(), m.len()))
}

// 2 秒ごとに見張っているファイルを確かめる
fn start_watcher(app: AppHandle) {
  std::thread::spawn(move || loop {
    std::thread::sleep(WATCH_INTERVAL);
    let watches = app.state::<Watches>();
    let mut changed = Vec::new();
    {
      let mut items = watches.items.lock().unwrap();
      items.retain(|_, watch| watch.opened.elapsed() < WATCH_LIMIT && watch.path.exists());
      for (id, watch) in items.iter_mut() {
        let Some(now) = file_state(&watch.path) else {
          continue;
        };
        if now == watch.seen {
          watch.pending = None;
        } else if watch.pending == Some(now) {
          watch.seen = now;
          watch.pending = None;
          changed.push(*id);
        } else {
          watch.pending = Some(now);
        }
      }
    }
    for id in changed {
      let _ = app.emit(FILE_CHANGED_EVENT, id);
    }
  });
}

// 見張っているファイルの今の中身（画面がサーバーへアップロードする）
#[tauri::command]
fn read_watched(watch_id: u64, watches: State<Watches>) -> Result<tauri::ipc::Response, String> {
  let path = watches
    .items
    .lock()
    .unwrap()
    .get(&watch_id)
    .map(|watch| watch.path.clone())
    .ok_or_else(|| "ファイルの見張りが終わっています".to_string())?;
  fs::read(&path)
    .map(tauri::ipc::Response::new)
    .map_err(|e| format!("ファイルを読めませんでした: {e}"))
}

// 共有サーバーのファイルを一時フォルダに保存し、OS の既定のアプリで開く（FN0301-BR21）。
// 保存されたら知らせるよう見張り、見張りの ID を返す（FN0301-BR28）
#[tauri::command]
async fn open_download(request: Request<'_>, watches: State<'_, Watches>) -> Result<u64, String> {
  let (name, data) = downloaded_file(&request)?;
  // 同じ名前のファイルを続けて開いても上書きしないよう、開くたびにフォルダを分ける
  let dir = std::env::temp_dir()
    .join("ari-docs")
    .join(format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
  fs::create_dir_all(&dir).map_err(|e| format!("一時フォルダを作れませんでした: {e}"))?;
  let path = dir.join(name);
  fs::write(&path, data).map_err(|e| format!("ファイルを保存できませんでした: {e}"))?;
  let id = {
    let mut next = watches.next_id.lock().unwrap();
    *next += 1;
    *next
  };
  watches.items.lock().unwrap().insert(
    id,
    Watch {
      seen: file_state(&path).unwrap_or((None, 0)),
      pending: None,
      path: path.clone(),
      opened: Instant::now(),
    },
  );
  open::that(&path).map_err(|e| format!("ファイルを開けませんでした: {e}"))?;
  Ok(id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // バックエンドを起動してから画面を出す
      let (app_dir, status) = if cfg!(debug_assertions) {
        (None, start_dev())
      } else {
        match app_dir() {
          Ok(dir) => {
            // 文字認識のモデルは同梱の resources（tauri.conf.json の bundle.resources）。取れなければ exe の横
            let models_dir = app
              .path()
              .resource_dir()
              .map(|resources| resources.join("models"))
              .unwrap_or_else(|_| dir.join("models"));
            let status = start(&dir, &models_dir);
            (Some(dir), status)
          }
          Err(e) => (
            None,
            SetupStatus {
              error: e,
              ..Default::default()
            },
          ),
        }
      };
      app.manage(AppData {
        app_dir,
        status: Mutex::new(status),
      });
      app.manage(Watches::default());
      start_watcher(app.handle().clone());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      setup_status,
      inspect_workspace,
      change_workspace,
      change_mode,
      save_download,
      open_download,
      read_watched
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("ari-docs-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    canonicalize(&dir).unwrap()
  }

  #[test]
  fn backend_config_uses_workspace_layout() {
    // OS のパスなので、区切りは OS に合わせる（Windows は \）
    let workspace = Path::new("/w");
    let config = backend_config(workspace, Path::new("/app/models"));
    let folder = workspace.join("folder").to_string_lossy().to_string();
    let database = workspace.join(".ari-docs").join("ari.db");
    assert_eq!(config.folder_root, folder);
    assert_eq!(config.database_path, database.to_string_lossy());
    assert_eq!(config.docs_default_root, folder);
  }

  #[test]
  fn prepare_workspace_creates_folders() {
    let dir = temp_dir("prepare");
    prepare_workspace(&dir).unwrap();
    assert!(dir.join("folder").is_dir());
    assert!(dir.join(".ari-docs").is_dir());
    assert!(inspect_workspace(dir.to_string_lossy().to_string()).has_ari_docs);
    fs::remove_dir_all(&dir).unwrap();

    assert!(prepare_workspace(Path::new("/no/such/folder")).is_err());
  }

  #[test]
  fn config_is_none_on_first_run_and_round_trips() {
    let dir = temp_dir("config");
    // 初回起動は設定が無い（使い方を選ぶ画面を出す）
    assert!(load_config(&dir).unwrap().is_none());
    let status = start(&dir, &dir.join("models"));
    assert!(!status.configured);
    assert_eq!(status.mode, "");
    assert!(status.error.is_empty());
    assert!(status.can_change_mode);

    // 作業フォルダの絶対パス（Windows では / で始まるだけでは絶対パスにならないので、一時フォルダから作る）
    let shared = dir.join("shared").join("ari");
    save_config(
      &dir,
      &DesktopConfig {
        workspace: shared.to_string_lossy().to_string(),
        ..Default::default()
      },
    )
    .unwrap();
    assert!(fs::read_to_string(dir.join("config.toml"))
      .unwrap()
      .starts_with("# ari-docs の設定"));
    let config = load_config(&dir).unwrap().unwrap();
    assert_eq!(config.mode, UseMode::Local);
    assert_eq!(
      resolve_workspace(&dir, &config.workspace),
      shared
    );
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn old_config_without_mode_is_local() {
    let config: DesktopConfig = toml::from_str("workspace = \".\"").unwrap();
    assert_eq!(config, DesktopConfig::default());
  }

  #[test]
  fn installer_config_is_readable() {
    // インストーラー（installer-hooks.nsh）が書く形式
    let config: DesktopConfig =
      toml::from_str("mode = \"server\"\r\nworkspace = \".\"\r\nserver_url = \"http://ari:8080/\"\r\n")
        .unwrap();
    assert_eq!(config.mode, UseMode::Server);
    assert_eq!(normalize_server_url(&config.server_url).unwrap(), "http://ari:8080");
  }

  #[test]
  fn server_mode_does_not_start_backend() {
    let dir = temp_dir("server-mode");
    save_config(
      &dir,
      &DesktopConfig {
        mode: UseMode::Server,
        server_url: " https://ari.example.com/ ".to_string(),
        ..Default::default()
      },
    )
    .unwrap();
    let status = start(&dir, &dir.join("models"));
    assert!(status.configured);
    assert_eq!(status.mode, "server");
    assert_eq!(status.server_url, "https://ari.example.com");
    assert!(!status.can_change_workspace);
    // バックエンドを起動していないので作業フォルダも作らない
    assert!(!dir.join(".ari-docs").exists());
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn percent_decode_restores_japanese_name() {
    assert_eq!(percent_decode("%E8%AD%B0%E4%BA%8B%E9%8C%B2.xlsx"), "議事録.xlsx");
    assert_eq!(percent_decode("a%20b%2"), "a b%2");
  }

  #[test]
  fn normalize_server_url_rejects_invalid_urls() {
    assert_eq!(normalize_server_url("http://ari:8080").unwrap(), "http://ari:8080");
    for url in ["", "ari:8080", "ftp://ari", "http://", "http://ari/path", "http://a b"] {
      assert!(normalize_server_url(url).is_err(), "{url}");
    }
  }

  #[test]
  fn workspace_value_is_relative_only_for_app_dir() {
    let app_dir = Path::new("/opt/ari");
    assert_eq!(workspace_value(app_dir, Path::new("/opt/ari")), ".");
    assert_eq!(
      workspace_value(app_dir, Path::new("/shared/ari")),
      "/shared/ari"
    );
  }

  #[cfg(unix)]
  #[test]
  fn save_config_fails_when_app_dir_is_read_only() {
    use std::os::unix::fs::PermissionsExt;
    let dir = temp_dir("readonly");
    fs::set_permissions(&dir, fs::Permissions::from_mode(0o555)).unwrap();
    // root で動かすと書き込めてしまうため、そのときは確認しない
    if fs::write(dir.join("probe"), "").is_err() {
      let error = save_config(&dir, &DesktopConfig::default()).err().unwrap();
      assert!(error.starts_with("exe のフォルダに書き込めません"));
    }
    fs::set_permissions(&dir, fs::Permissions::from_mode(0o755)).unwrap();
    fs::remove_dir_all(&dir).unwrap();
  }
}
