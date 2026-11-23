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
use tauri_plugin_updater::{Update, UpdaterExt};

// バックエンドの待ち受けポート（フロントは http://localhost:8080 を呼ぶ）
const API_PORT: u16 = 8080;
// 8080 をほかのアプリが使っているときに代わりに使うポート（自分の PC だけ。公開している PC は 8080 のまま。FN0002-BR22）
const FALLBACK_PORTS: std::ops::RangeInclusive<u16> = 8081..=8099;

// 8080 で待ち受けている ari-docs があるか（同じ PC で 2 つ目を起動したとき）。/api/server-info に答えるかで見る
fn ari_docs_is_running(port: u16) -> bool {
  use std::io::{Read, Write};
  let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
  let Ok(mut stream) = std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(1)) else {
    return false;
  };
  let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
  if stream
    .write_all(b"GET /api/server-info HTTP/1.0\r\nHost: localhost\r\n\r\n")
    .is_err()
  {
    return false;
  }
  let mut text = String::new();
  let _ = stream.take(4096).read_to_string(&mut text);
  text.contains("\"app\":\"ari-docs\"")
}

fn port_is_free(port: u16) -> bool {
  std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
}

// 自分の PC のバックエンドのポートを決める。8080〜8099 のどれかを ari-docs が使っていればエラー（2 つ起動すると
// 同じ DB をバッチが 2 重に動かすため）、ほかのアプリが使っていれば 8081〜8099 の空いているもの（FN0002-BR22）。
// 公開している PC（FN0005）はほかの PC に伝えた URL を変えないよう、決めたポート（既定 8080。FN0005-BR10）だけ
fn choose_port(fixed: Option<u16>) -> Result<u16, String> {
  // 1 つ目が代わりのポートで動いていることもあるので、使われているポートはすべて ari-docs かを確かめる
  let ports = || std::iter::once(API_PORT).chain(FALLBACK_PORTS).chain(fixed);
  if ports().any(|port| !port_is_free(port) && ari_docs_is_running(port)) {
    return Err("ari-docs はもう起動しています（同じ PC で 2 つは起動できません）".to_string());
  }
  if let Some(port) = fixed {
    return if port_is_free(port) {
      Ok(port)
    } else {
      Err(format!(
        "ポート {port} をほかのアプリが使っています。この PC を公開しているので、{port} を空けるか、設定の「この PC の公開」でポートを変えてください"
      ))
    };
  }
  if port_is_free(API_PORT) {
    return Ok(API_PORT);
  }
  FALLBACK_PORTS
    .clone()
    .find(|port| port_is_free(*port))
    .ok_or_else(|| format!("ポート {API_PORT}〜{} がすべて使われています", FALLBACK_PORTS.end()))
}

// 使い方。インストーラーか初回起動の画面で選ぶ。今は「起動したときの場所」の古い書き方として読む
// （start_place が無いとき、server なら server_url の共有サーバーで起動する。docs の FN0002-BR20）
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug, Default)]
#[serde(rename_all = "lowercase")]
enum UseMode {
  // 個人用。バックエンドを同じプロセスで動かす（自分の PC からだけ使える）
  #[default]
  Local,
  // 共有サーバーに接続する。バックエンドは動かさない
  Server,
}

// 登録できる共有サーバーの数（docs の FN0002-BR20）
const MAX_SERVERS: usize = 5;
// 場所の名前の長さ
const MAX_PLACE_NAME: usize = 20;
// 場所の色（画面の global.css の --place-*）。空は既定の色
const PLACE_COLORS: [&str; 6] = ["gray", "blue", "green", "amber", "red", "violet"];
// 起動したときの場所: 前回の場所 / 自分の PC。それ以外は共有サーバーの URL
const START_LAST: &str = "last";
const START_LOCAL: &str = "local";

// 登録した共有サーバー
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ServerPlace {
  name: String,
  // 例: http://ari-server:8080（末尾の / を付けない）
  url: String,
  #[serde(default)]
  color: String,
}

// 場所（自分の PC と共有サーバー）の設定。画面の設定（場所）で変え、再起動せずに切り替える（docs の FN0002-BR20）
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
struct Places {
  // 自分の PC の名前（空なら「自分の PC」）と色
  local_name: String,
  local_color: String,
  // 起動したときの場所。last（前回の場所）/ local（自分の PC）/ 共有サーバーの URL
  start_place: String,
  servers: Vec<ServerPlace>,
}

// exe と同じフォルダに置く設定。自分の PC の作業フォルダと、場所（共有サーバー）を持つ。
// インストーラー（installer-hooks.nsh）は mode・workspace・server_url だけを書く
#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
struct DesktopConfig {
  // 古い書き方（起動したときの場所）。無ければ個人用（以前の設定ファイルには無いため）
  #[serde(default)]
  mode: UseMode,
  // 自分の PC の作業フォルダ。相対パスは exe のフォルダから。"." は exe と同じフォルダ
  #[serde(default = "default_workspace")]
  workspace: String,
  // 古い書き方（インストーラーが書く共有サーバーの URL）。読んだら servers に入れる
  #[serde(default, skip_serializing_if = "String::is_empty")]
  server_url: String,
  #[serde(default, skip_serializing_if = "String::is_empty")]
  local_name: String,
  #[serde(default, skip_serializing_if = "String::is_empty")]
  local_color: String,
  #[serde(default, skip_serializing_if = "String::is_empty")]
  start_place: String,
  #[serde(default)]
  servers: Vec<ServerPlace>,
  // この PC を共有サーバーとして使う（ログインあり。docs の FN0005）。一度公開したら戻さない
  #[serde(default, skip_serializing_if = "is_false")]
  shared_host: bool,
  // ほかの PC からつなげる（0.0.0.0 で待ち受ける）。false ならこの PC の中からだけ使える
  #[serde(default, skip_serializing_if = "is_false")]
  publish: bool,
  // 公開しているときのポート（既定 8080。FN0005-BR10）
  #[serde(default = "default_host_port", skip_serializing_if = "is_default_host_port")]
  host_port: u16,
}

fn default_host_port() -> u16 {
  API_PORT
}

fn is_default_host_port(port: &u16) -> bool {
  *port == API_PORT
}

// 公開のポートとして使えるか（1024 未満は管理者の権限が要るので使わない）
fn validate_host_port(port: u16) -> Result<(), String> {
  if port < 1024 {
    return Err("ポートは 1024〜65535 で指定してください".to_string());
  }
  Ok(())
}

impl DesktopConfig {
  // バックエンドのポートを固定するか（共有サーバーとして使っている PC は決めたポートだけ）
  fn fixed_port(&self) -> Option<u16> {
    self.shared_host.then_some(self.host_port)
  }
}

fn is_false(value: &bool) -> bool {
  !value
}

impl DesktopConfig {
  // 場所の設定にする。古い書き方（mode・server_url）は、共有サーバーの 1 つ目と起動したときの場所にする。
  // URL の正しくない共有サーバーは使わない
  fn places(&self) -> Places {
    let mut servers: Vec<ServerPlace> = Vec::new();
    let legacy = normalize_server_url(&self.server_url).ok();
    if let Some(url) = &legacy {
      if !self.servers.iter().any(|server| normalize_server_url(&server.url).ok().as_ref() == Some(url)) {
        servers.push(ServerPlace {
          name: "共有サーバー".to_string(),
          url: url.clone(),
          color: String::new(),
        });
      }
    }
    for server in &self.servers {
      if let Ok(url) = normalize_server_url(&server.url) {
        if servers.len() < MAX_SERVERS && !servers.iter().any(|s| s.url == url) {
          servers.push(ServerPlace {
            url,
            ..server.clone()
          });
        }
      }
    }
    let start_place = if !self.start_place.is_empty() {
      self.start_place.clone()
    } else if self.mode == UseMode::Server && legacy.is_some() {
      legacy.unwrap()
    } else {
      START_LAST.to_string()
    };
    let start_place = if start_place == START_LAST
      || start_place == START_LOCAL
      || servers.iter().any(|server| server.url == start_place)
    {
      start_place
    } else {
      START_LAST.to_string()
    };
    Places {
      local_name: self.local_name.clone(),
      local_color: self.local_color.clone(),
      start_place,
      servers,
    }
  }

  // 場所を書き込む（古い書き方は消す）
  fn set_places(&mut self, places: Places) {
    self.mode = UseMode::Local;
    self.server_url = String::new();
    self.local_name = places.local_name;
    self.local_color = places.local_color;
    self.start_place = places.start_place;
    self.servers = places.servers;
  }
}

// 画面から受け取った場所を確かめて整える
fn validate_places(places: Places) -> Result<Places, String> {
  let name = |value: &str, label: &str| -> Result<String, String> {
    let value = value.trim();
    if value.chars().count() > MAX_PLACE_NAME {
      return Err(format!("{label}は {MAX_PLACE_NAME} 文字までにしてください"));
    }
    Ok(value.to_string())
  };
  let color = |value: &str| -> Result<String, String> {
    if value.is_empty() || PLACE_COLORS.contains(&value) {
      Ok(value.to_string())
    } else {
      Err(format!("色が正しくありません: {value}"))
    }
  };
  if places.servers.len() > MAX_SERVERS {
    return Err(format!("共有サーバーは {MAX_SERVERS} つまで登録できます"));
  }
  let mut servers: Vec<ServerPlace> = Vec::new();
  for server in &places.servers {
    let url = normalize_server_url(&server.url)?;
    if servers.iter().any(|s| s.url == url) {
      return Err(format!("同じ共有サーバーが 2 つあります: {url}"));
    }
    let server_name = name(&server.name, "共有サーバーの名前")?;
    if server_name.is_empty() {
      return Err(format!("共有サーバーの名前を入力してください: {url}"));
    }
    servers.push(ServerPlace {
      name: server_name,
      url,
      color: color(&server.color)?,
    });
  }
  let start_place = places.start_place.trim().to_string();
  if start_place != START_LAST
    && start_place != START_LOCAL
    && !servers.iter().any(|server| server.url == start_place)
  {
    return Err("起動したときの場所が正しくありません".to_string());
  }
  Ok(Places {
    local_name: name(&places.local_name, "自分の PC の名前")?,
    local_color: color(&places.local_color)?,
    start_place,
    servers,
  })
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
      local_name: String::new(),
      local_color: String::new(),
      start_place: String::new(),
      servers: Vec::new(),
      shared_host: false,
      publish: false,
      host_port: API_PORT,
    }
  }
}

const CONFIG_HEADER: &str = "\
# ari-docs の設定
# workspace: 自分の PC の作業フォルダ（folder/ と .ari-docs/ を置く場所）。相対パスは exe のフォルダから。\".\" は exe と同じフォルダ
# local_name・local_color: 自分の PC の名前と色
# start_place: 起動したときの場所（last: 前回の場所 / local: 自分の PC / 共有サーバーの URL）
# [[servers]]: 共有サーバー（name・url・color。5 つまで）。アプリの設定画面の「場所」で変えられる
# mode・server_url: 古い書き方（インストーラーが書く）。server なら server_url の共有サーバーで起動する
# shared_host: この PC を共有サーバーとして使う（ログインあり）。publish: ほかの PC からつなげる。host_port: そのポート（既定 8080）。設定画面の「この PC の公開」で変える
";

// 起動の状態。画面はこれを見て、起動エラーの画面かホームかを決める
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct SetupStatus {
  // 自分の PC の作業フォルダの準備ができ、バックエンドが動いている
  configured: bool,
  // 初回起動（設定ファイルが無い）。初回起動の画面を出す
  first_run: bool,
  // 作業フォルダの絶対パス（デバッグビルドでは空文字）
  workspace: String,
  // 作業フォルダが見つからないなど、表示するエラー（無ければ空文字）
  error: String,
  // 作業フォルダを変えられる（exe のフォルダの config.toml を使っている）。
  // デバッグビルドと、exe のフォルダに書き込めないときは false
  can_change_workspace: bool,
  // 場所（自分の PC と共有サーバー）
  places: Places,
  // 場所を変えられる（設定ファイルに書き込める）。exe のフォルダを取れなかったときは false
  can_change_places: bool,
  // この PC の公開（docs の FN0005）
  host: HostStatus,
  // 自分の PC のバックエンドの待ち受けポート（ふつうは 8080。FN0002-BR22）
  api_port: u16,
}

// この PC を共有サーバーとして公開しているか（docs の FN0005）
#[derive(Serialize, Clone, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct HostStatus {
  // 共有サーバーとして使っている（ログインあり）
  shared: bool,
  // ほかの PC からつなげる
  published: bool,
  port: u16,
  // ほかの PC に伝える URL（PC の名前と IP アドレス。分からなければ空）
  urls: Vec<String>,
}

// この PC の名前（Windows は COMPUTERNAME、Linux は /etc/hostname）
fn host_name() -> Option<String> {
  std::env::var("COMPUTERNAME")
    .ok()
    .or_else(|| fs::read_to_string("/etc/hostname").ok())
    .or_else(|| std::env::var("HOSTNAME").ok())
    .map(|name| name.trim().to_string())
    .filter(|name| !name.is_empty())
}

// この PC の IP アドレス。UDP の connect は宛先を決めるだけで、何も送らない（外部とは通信しない）
fn host_address() -> Option<String> {
  let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
  socket.connect("192.0.2.1:80").ok()?;
  let ip = socket.local_addr().ok()?.ip();
  (!ip.is_loopback() && !ip.is_unspecified()).then(|| ip.to_string())
}

fn host_status(config: &DesktopConfig) -> HostStatus {
  let urls = if config.shared_host && config.publish {
    host_name()
      .into_iter()
      .chain(host_address())
      .map(|host| format!("http://{host}:{}", config.host_port))
      .collect()
  } else {
    Vec::new()
  };
  HostStatus {
    shared: config.shared_host,
    published: config.shared_host && config.publish,
    port: if config.shared_host { config.host_port } else { API_PORT },
    urls,
  }
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
  // 場所を保存する設定ファイル。デバッグビルドは back/data/desktop.toml。取れなかったときは None
  config_path: Option<PathBuf>,
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

// 公開の設定をバックエンドの設定に当てる（docs の FN0005）。共有サーバーとして使うなら共有モード（ログインあり）にし、
// 公開しているときだけ 0.0.0.0 で待ち受ける。ローカルモードは常に 127.0.0.1（AppConfig::listen_address）
fn apply_host(mut config: AppConfig, desktop: &DesktopConfig) -> AppConfig {
  config.port = desktop.fixed_port().unwrap_or(API_PORT);
  if desktop.shared_host {
    config.mode = AppMode::Shared;
    config.bind_address = if desktop.publish { "0.0.0.0" } else { "127.0.0.1" }.to_string();
    // 証明書は使わない（プライベートのネットワークだけで HTTP で使う。FN0005-BR05）
    config.tls_cert = String::new();
    config.tls_key = String::new();
  } else {
    config.mode = AppMode::Local;
    config.bind_address = "127.0.0.1".to_string();
  }
  config
}

// 作業フォルダの構成: <作業フォルダ>/folder（ファイルの置き場所）、<作業フォルダ>/.ari-docs/ari.db（DB）
fn backend_config(workspace: &Path, models_dir: &Path) -> AppConfig {
  let folder = workspace.join("folder");
  AppConfig {
    mode: AppMode::Local,
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
  load_config_file(&app_dir.join("config.toml"))
}

fn load_config_file(path: &Path) -> Result<Option<DesktopConfig>, String> {
  if !path.exists() {
    return Ok(None);
  }
  let text = fs::read_to_string(path)
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

// 起動時に設定を読み、自分の PC の作業フォルダでバックエンドを起動する。
// 共有サーバーを使う設定でも、自分の PC はいつも使えるようにする（docs の FN0002-BR20）
fn start(app_dir: &Path, models_dir: &Path) -> SetupStatus {
  let mut status = SetupStatus {
    can_change_places: true,
    ..Default::default()
  };
  let config = match load_config(app_dir) {
    Ok(Some(config)) => config,
    // 初回起動。画面で使い方を選ぶ
    Ok(None) => {
      status.first_run = true;
      return status;
    }
    Err(e) => {
      status.error = e;
      return status;
    }
  };
  status.places = config.places();
  status.host = host_status(&config);
  status.can_change_workspace = true;
  let workspace = resolve_workspace(app_dir, &config.workspace);
  status.workspace = workspace.to_string_lossy().to_string();
  let result = prepare_workspace(&workspace)
    .and_then(|_| choose_port(config.fixed_port()))
    .and_then(|port| {
      status.api_port = port;
      tauri::async_runtime::block_on(ari_back::server::start(
        apply_host(backend_config(&workspace, models_dir), &config),
        port,
      ))
    });
  match result {
    Ok(()) => status.configured = true,
    Err(e) => status.error = format!("作業フォルダで起動できませんでした。{e}"),
  }
  status
}

// デバッグビルドの場所の設定（back/data/ は開発用の使い捨て）
fn dev_config_path() -> PathBuf {
  Path::new(env!("CARGO_MANIFEST_DIR")).join("../../back/data/desktop.toml")
}

// デバッグビルド: リポジトリの back/config.toml（folder/・back/data/ari.db）で起動する。
// 場所は back/data/desktop.toml に保存する。環境変数 ARI_DOCS_SERVER_URL があれば、その共有サーバーを足して、そこで起動する
fn start_dev() -> SetupStatus {
  let mut status = SetupStatus {
    can_change_places: true,
    ..Default::default()
  };
  let config = match load_config_file(&dev_config_path()) {
    Ok(config) => config.unwrap_or_default(),
    Err(e) => {
      status.error = e;
      return status;
    }
  };
  status.places = config.places();
  status.host = host_status(&config);
  if let Ok(url) = std::env::var("ARI_DOCS_SERVER_URL") {
    match normalize_server_url(&url) {
      Ok(url) => {
        if !status.places.servers.iter().any(|server| server.url == url)
          && status.places.servers.len() < MAX_SERVERS
        {
          status.places.servers.push(ServerPlace {
            name: "開発用のサーバー".to_string(),
            url: url.clone(),
            color: String::new(),
          });
        }
        status.places.start_place = url;
      }
      Err(e) => status.error = e,
    }
  }
  let result = choose_port(config.fixed_port()).and_then(|port| {
    status.api_port = port;
    tauri::async_runtime::block_on(ari_back::server::start(
      apply_host(ari_back::load_dev_config(), &config),
      port,
    ))
  });
  match result {
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
  config.workspace = workspace_value(app_dir, &workspace);
  save_config(app_dir, &config)?;
  app.request_restart();
  Ok(())
}

// 初回起動の画面で使い方を選ぶ。config.toml に保存してアプリを再起動する（自分の PC のバックエンドを起動するため）。
// server_url が空なら自分の PC だけ。あれば共有サーバーに登録し、そこで起動する（画面で接続を確かめてから渡す）
#[tauri::command]
fn complete_first_run(server_url: String, app: AppHandle, data: State<AppData>) -> Result<(), String> {
  let Some(app_dir) = &data.app_dir else {
    return Err("設定を保存できません".to_string());
  };
  let mut config = load_config(app_dir)?.unwrap_or_default();
  let mut places = config.places();
  if !server_url.trim().is_empty() {
    let url = normalize_server_url(&server_url)?;
    if !places.servers.iter().any(|server| server.url == url) {
      places.servers.push(ServerPlace {
        name: "共有サーバー".to_string(),
        url: url.clone(),
        color: String::new(),
      });
    }
    places.start_place = url;
  }
  config.set_places(validate_places(places)?);
  save_config(app_dir, &config)?;
  app.request_restart();
  Ok(())
}

// 個人の設定（配色・文字の大きさ・Vim など。docs の FN0701-BR15）。設定ファイル（config.toml）と同じフォルダの
// preferences.json に、画面の localStorage の値（キー → 文字列）をそのまま保存する。どの場所（自分の PC・共有サーバー）でも
// 同じものを使い、共有サーバーには送らない。アプリを入れ直す・画面の保存場所が消えても残るように、この PC の ari-docs に置く
const PREFERENCES_FILE: &str = "preferences.json";
// 画面から送られる大きさの上限（壊れた値で大きなファイルを書かないように）
const MAX_PREFERENCES_BYTES: usize = 1024 * 1024;

fn preferences_path(data: &AppData) -> Option<PathBuf> {
  data.config_path.as_ref()?.parent().map(|dir| dir.join(PREFERENCES_FILE))
}

fn read_preferences(path: &Path) -> HashMap<String, String> {
  fs::read_to_string(path)
    .ok()
    .and_then(|text| serde_json::from_str(&text).ok())
    .unwrap_or_default()
}

fn write_preferences(path: &Path, values: &HashMap<String, String>) -> Result<(), String> {
  let text = serde_json::to_string_pretty(values).map_err(|e| e.to_string())?;
  if text.len() > MAX_PREFERENCES_BYTES {
    return Err("個人の設定が大きすぎます".to_string());
  }
  // 途中で止まっても壊れないよう、別の名前で書いてから置き換える
  let partial = path.with_extension("json.partial");
  fs::write(&partial, text).map_err(|e| format!("個人の設定を保存できません: {e}"))?;
  fs::rename(&partial, path).map_err(|e| format!("個人の設定を保存できません: {e}"))
}

// 個人の設定を読む。まだ無ければ空（画面は今の localStorage をそのまま使い、次に保存する）
#[tauri::command]
fn load_preferences(data: State<AppData>) -> HashMap<String, String> {
  preferences_path(&data).map(|path| read_preferences(&path)).unwrap_or_default()
}

#[tauri::command]
fn save_preferences(values: HashMap<String, String>, data: State<AppData>) -> Result<(), String> {
  let Some(path) = preferences_path(&data) else {
    return Err("個人の設定を保存できません".to_string());
  };
  write_preferences(&path, &values)
}

// 場所（自分の PC の名前・共有サーバー・起動したときの場所）を保存する。再起動はしない（docs の FN0002-BR20）
#[tauri::command]
fn save_places(places: Places, data: State<AppData>) -> Result<SetupStatus, String> {
  let Some(path) = &data.config_path else {
    return Err("場所を保存できません".to_string());
  };
  if !data.status.lock().unwrap().can_change_places {
    return Err("場所を保存できません".to_string());
  }
  let places = validate_places(places)?;
  let mut config = load_config_file(path)?.unwrap_or_default();
  config.set_places(places.clone());
  store_config(&data, path, &config)?;
  let mut status = data.status.lock().unwrap();
  status.places = places;
  Ok(status.clone())
}

// 設定ファイルに書く（exe のフォルダのものは save_config で、書き込めないときの文にする）
fn store_config(data: &AppData, path: &Path, config: &DesktopConfig) -> Result<(), String> {
  match &data.app_dir {
    Some(app_dir) => save_config(app_dir, config),
    None => write_config(path, config),
  }
}

// 公開の設定を変えられるか。自分の PC のバックエンドが動いていて、設定ファイルに書き込めること
fn host_config(data: &AppData) -> Result<(PathBuf, DesktopConfig), String> {
  let status = data.status.lock().unwrap().clone();
  let Some(path) = data.config_path.clone().filter(|_| status.configured && status.can_change_places) else {
    return Err("この PC の公開の設定を変えられません".to_string());
  };
  let config = load_config_file(&path)?.unwrap_or_default();
  Ok((path, config))
}

// この PC を共有サーバーとして公開する（docs の FN0005）。最初の管理者を登録して、自分の PC のデータ（ユーザー local）を
// その管理者に移し、共有モードで 0.0.0.0 に待ち受けるよう設定してアプリを再起動する。
// 先に設定を書き、データを移せなかったら設定を元に戻す（管理者のいない共有サーバーを公開しないため）
#[tauri::command]
fn publish_host(
  user_id: String,
  display_name: String,
  password: String,
  port: u16,
  app: AppHandle,
  data: State<AppData>,
) -> Result<(), String> {
  let (path, config) = host_config(&data)?;
  if config.shared_host {
    return Err("この PC はもう共有サーバーとして使っています".to_string());
  }
  validate_host_port(port)?;
  let published = DesktopConfig {
    shared_host: true,
    publish: true,
    host_port: port,
    ..config.clone()
  };
  store_config(&data, &path, &published)?;
  if let Err(e) = ari_back::publish_local_data(&user_id, &display_name, &password) {
    store_config(&data, &path, &config)?;
    return Err(e);
  }
  app.request_restart();
  Ok(())
}

// 公開をやめる・また公開する（docs の FN0005-BR06）。共有サーバーとして使ったまま、待ち受けるアドレスだけを変えて再起動する
#[tauri::command]
fn set_publish(publish: bool, app: AppHandle, data: State<AppData>) -> Result<(), String> {
  let (path, mut config) = host_config(&data)?;
  if !config.shared_host {
    return Err("この PC は共有サーバーとして公開していません".to_string());
  }
  config.publish = publish;
  store_config(&data, &path, &config)?;
  app.request_restart();
  Ok(())
}

// 公開のポートを変える（FN0005-BR10）。ほかの PC は場所の URL を直す必要がある。再起動する
#[tauri::command]
fn set_host_port(port: u16, app: AppHandle, data: State<AppData>) -> Result<(), String> {
  let (path, mut config) = host_config(&data)?;
  if !config.shared_host {
    return Err("この PC は共有サーバーとして公開していません".to_string());
  }
  validate_host_port(port)?;
  config.host_port = port;
  store_config(&data, &path, &config)?;
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

// 開いたファイルの一時フォルダ（<OS の一時フォルダ>/ari-docs/<開いた時刻>/）のうち、見張りの上限（24 時間）を過ぎたものを消す。
// 起動したときに 1 回だけ行う（FN0301-BR32）。見張りが終わっていて、もうサーバーに戻らないため
fn remove_old_downloads(root: &Path, limit: Duration) -> usize {
  let Ok(entries) = fs::read_dir(root) else {
    return 0;
  };
  let mut removed = 0;
  for entry in entries.flatten() {
    let old = entry
      .metadata()
      .and_then(|m| m.modified())
      .ok()
      .and_then(|time| time.elapsed().ok())
      .is_some_and(|age| age > limit);
    let named = entry.file_name().to_string_lossy().chars().all(|c| c.is_ascii_digit());
    if old && named && entry.path().is_dir() && fs::remove_dir_all(entry.path()).is_ok() {
      removed += 1;
    }
  }
  removed
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

// ---- アプリの更新（docs の FN0904） ----

// 自分の PC のときの取り先（GitHub Releases の最新の版。FN0904-BR02）
const RELEASE_ENDPOINT: &str =
  "https://github.com/NaoyaYokoyama/ari-docs/releases/latest/download/latest.json";
// 新しい版を調べるときの時間切れ（ファイルを取ってくるときは時間を切らない）
const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(30);

// 調べて見つけた新しい版。更新の実行（install_update）で使う
#[derive(Default)]
struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
  version: String,
  current_version: String,
  // 変更点（latest.json・共有サーバーの notes。無ければ空。FN0904-BR13）
  notes: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
  downloaded: u64,
  total: Option<u64>,
}

// 新しい版を調べる先。共有サーバーならそのサーバー（API0911）、空なら GitHub Releases
fn update_endpoint(server_url: &str) -> Result<tauri::Url, String> {
  let url = if server_url.trim().is_empty() {
    RELEASE_ENDPOINT.to_string()
  } else {
    format!(
      "{}/api/app-update/{{{{target}}}}/{{{{arch}}}}/{{{{current_version}}}}",
      normalize_server_url(server_url)?
    )
  };
  url.parse().map_err(|e| format!("URL が正しくありません: {e}"))
}

// アプリに入れた署名の公開鍵（tauri.conf.json の plugins.updater.pubkey）
fn updater_pubkey(app: &AppHandle) -> String {
  app
    .config()
    .plugins
    .0
    .get("updater")
    .and_then(|updater| updater.get("pubkey"))
    .and_then(|pubkey| pubkey.as_str())
    .unwrap_or_default()
    .trim()
    .to_string()
}

#[tauri::command]
async fn check_update(
  server_url: String,
  app: AppHandle,
  pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
  if updater_pubkey(&app).is_empty() {
    return Err("署名の鍵が設定されていないため、このアプリは更新できません".to_string());
  }
  let updater = app
    .updater_builder()
    .endpoints(vec![update_endpoint(&server_url)?])
    .map_err(|e| e.to_string())?
    .timeout(UPDATE_CHECK_TIMEOUT)
    .build()
    .map_err(|e| e.to_string())?;
  let update = updater.check().await.map_err(|e| e.to_string())?;
  let info = update.as_ref().map(|update| UpdateInfo {
    version: update.version.clone(),
    current_version: update.current_version.clone(),
    notes: update.body.clone().unwrap_or_default().trim().to_string(),
  });
  *pending.0.lock().unwrap() = update;
  Ok(info)
}

// 新しい版を取ってきて署名を確かめ、入れ替えて再起動する（FN0904-BR06）。
// 取ってくる間は ari-docs://update-progress で進み具合を知らせる
#[tauri::command]
async fn install_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
  if cfg!(debug_assertions) {
    return Err("開発用のビルドでは更新しません".to_string());
  }
  let update = pending
    .0
    .lock()
    .unwrap()
    .clone()
    .ok_or_else(|| "先に更新を確認してください".to_string())?;
  let progress_app = app.clone();
  let mut downloaded = 0u64;
  let mut last_percent = None;
  update
    .download_and_install(
      move |chunk, total| {
        downloaded += chunk as u64;
        // 進み具合は 1% ごとに知らせる（細かい塊ごとに送らない）
        let percent = total.map(|total| downloaded * 100 / total.max(1));
        if percent.is_none() || percent != last_percent {
          last_percent = percent;
          let _ = progress_app.emit(
            "ari-docs://update-progress",
            UpdateProgress { downloaded, total },
          );
        }
      },
      || {},
    )
    .await
    .map_err(|e| e.to_string())?;
  app.restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
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
      let config_path = if cfg!(debug_assertions) {
        Some(dev_config_path())
      } else {
        app_dir.as_ref().map(|dir| dir.join("config.toml"))
      };
      app.manage(AppData {
        app_dir,
        config_path,
        status: Mutex::new(status),
      });
      app.manage(Watches::default());
      app.manage(PendingUpdate::default());
      start_watcher(app.handle().clone());
      std::thread::spawn(|| remove_old_downloads(&std::env::temp_dir().join("ari-docs"), WATCH_LIMIT));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      setup_status,
      inspect_workspace,
      change_workspace,
      complete_first_run,
      save_places,
      publish_host,
      set_publish,
      set_host_port,
      load_preferences,
      save_preferences,
      save_download,
      open_download,
      read_watched,
      check_update,
      install_update
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
    assert!(status.first_run);
    assert!(status.error.is_empty());
    assert!(status.can_change_places);

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
  fn host_settings_choose_mode_and_address() {
    let base = backend_config(Path::new("/w"), Path::new("/m"));
    let local = apply_host(base.clone(), &DesktopConfig::default());
    assert!(local.mode.is_local());
    assert_eq!(local.listen_address(), "127.0.0.1");

    let published = DesktopConfig {
      shared_host: true,
      publish: true,
      ..Default::default()
    };
    let config = apply_host(base.clone(), &published);
    assert!(!config.mode.is_local());
    assert_eq!(config.listen_address(), "0.0.0.0");
    assert!(config.tls_files().is_none());
    let status = host_status(&published);
    assert!(status.shared && status.published);
    assert!(status.urls.iter().all(|url| url.starts_with("http://") && url.ends_with(":8080")));

    // 公開をやめても共有モード（ログインあり）のまま、この PC の中からだけ
    let closed = DesktopConfig {
      shared_host: true,
      publish: false,
      ..Default::default()
    };
    let config = apply_host(base, &closed);
    assert!(!config.mode.is_local());
    assert_eq!(config.listen_address(), "127.0.0.1");
    let status = host_status(&closed);
    assert!(status.shared && !status.published && status.urls.is_empty());

    // ポートを変えたら、そのポートで待ち受け、URL もそのポートにする（FN0005-BR10）
    let moved = DesktopConfig {
      host_port: 18080,
      ..published
    };
    assert_eq!(apply_host(backend_config(Path::new("/w"), Path::new("/m")), &moved).port, 18080);
    assert_eq!(moved.fixed_port(), Some(18080));
    assert_eq!(DesktopConfig::default().fixed_port(), None);
    assert!(host_status(&moved).urls.iter().all(|url| url.ends_with(":18080")));
    assert!(validate_host_port(80).is_err() && validate_host_port(18080).is_ok());
  }

  #[test]
  fn preferences_round_trip() {
    let dir = temp_dir("preferences");
    let path = dir.join(PREFERENCES_FILE);
    assert!(read_preferences(&path).is_empty());
    let values = HashMap::from([("theme".to_string(), "dark".to_string())]);
    write_preferences(&path, &values).unwrap();
    assert_eq!(read_preferences(&path), values);
    let huge = HashMap::from([("x".to_string(), "a".repeat(MAX_PREFERENCES_BYTES))]);
    assert!(write_preferences(&path, &huge).is_err());
    assert_eq!(read_preferences(&path), values);
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn old_download_folders_are_removed() {
    let dir = temp_dir("downloads");
    fs::create_dir_all(dir.join("1700000000000")).unwrap();
    fs::write(dir.join("1700000000000").join("a.xlsx"), "x").unwrap();
    fs::create_dir_all(dir.join("keep-me")).unwrap();
    // 上限 0 秒なら数字の名前のフォルダだけを消す。上限が長ければ消さない
    assert_eq!(remove_old_downloads(&dir, Duration::from_secs(3600)), 0);
    std::thread::sleep(Duration::from_millis(20));
    assert_eq!(remove_old_downloads(&dir, Duration::ZERO), 1);
    assert!(dir.join("keep-me").is_dir());
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn used_port_is_not_free_and_not_ari_docs() {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    assert!(!port_is_free(port));
    // 答えない（ari-docs ではない）アプリ
    assert!(!ari_docs_is_running(port));
  }

  #[test]
  fn host_settings_round_trip_and_are_omitted_when_off() {
    let dir = temp_dir("host");
    let config = DesktopConfig {
      shared_host: true,
      publish: true,
      ..Default::default()
    };
    save_config(&dir, &config).unwrap();
    assert_eq!(load_config(&dir).unwrap().unwrap(), config);
    let moved = DesktopConfig {
      host_port: 9000,
      ..config
    };
    save_config(&dir, &moved).unwrap();
    assert_eq!(load_config(&dir).unwrap().unwrap().host_port, 9000);
    save_config(&dir, &DesktopConfig::default()).unwrap();
    let text = fs::read_to_string(dir.join("config.toml")).unwrap();
    assert!(!text.contains("shared_host =") && !text.contains("publish =") && !text.contains("host_port ="));
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
  fn installer_server_config_becomes_first_server_and_start_place() {
    let config = DesktopConfig {
      mode: UseMode::Server,
      server_url: " https://ari.example.com/ ".to_string(),
      ..Default::default()
    };
    let places = config.places();
    assert_eq!(places.servers.len(), 1);
    assert_eq!(places.servers[0].url, "https://ari.example.com");
    assert_eq!(places.servers[0].name, "共有サーバー");
    assert_eq!(places.start_place, "https://ari.example.com");
    // 個人用の古い設定は前回の場所で起動する
    assert_eq!(DesktopConfig::default().places().start_place, "last");
  }

  #[test]
  fn set_places_round_trips_and_drops_legacy_fields() {
    let dir = temp_dir("places");
    let mut config = DesktopConfig {
      mode: UseMode::Server,
      server_url: "http://a:8080".to_string(),
      ..Default::default()
    };
    let mut places = config.places();
    places.servers.push(ServerPlace {
      name: "部署".to_string(),
      url: "http://b:8080/".to_string(),
      color: "green".to_string(),
    });
    places.local_name = "手元".to_string();
    places.start_place = "local".to_string();
    config.set_places(validate_places(places).unwrap());
    save_config(&dir, &config).unwrap();
    let text = fs::read_to_string(dir.join("config.toml")).unwrap();
    assert!(!text.contains("server_url ="));
    let loaded = load_config(&dir).unwrap().unwrap().places();
    assert_eq!(loaded.local_name, "手元");
    assert_eq!(loaded.start_place, "local");
    assert_eq!(
      loaded.servers.iter().map(|s| s.url.as_str()).collect::<Vec<_>>(),
      ["http://a:8080", "http://b:8080"]
    );
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn validate_places_rejects_invalid_values() {
    let server = |url: &str| ServerPlace {
      name: "s".to_string(),
      url: url.to_string(),
      color: String::new(),
    };
    let places = |servers: Vec<ServerPlace>, start: &str| Places {
      start_place: start.to_string(),
      servers,
      ..Default::default()
    };
    assert!(validate_places(places(vec![], "last")).is_ok());
    assert!(validate_places(places(vec![server("http://a")], "http://a")).is_ok());
    // 6 つ以上・同じ URL・正しくない URL・名前が空・知らない起動の場所・知らない色
    let six = (0..6).map(|i| server(&format!("http://a{i}"))).collect();
    assert!(validate_places(places(six, "last")).is_err());
    assert!(validate_places(places(vec![server("http://a"), server("http://a/")], "last")).is_err());
    assert!(validate_places(places(vec![server("a")], "last")).is_err());
    let mut unnamed = server("http://a");
    unnamed.name = " ".to_string();
    assert!(validate_places(places(vec![unnamed], "last")).is_err());
    assert!(validate_places(places(vec![], "http://x")).is_err());
    let mut colored = places(vec![], "last");
    colored.local_color = "pink".to_string();
    assert!(validate_places(colored).is_err());
  }

  #[test]
  fn server_config_still_starts_local_backend_workspace() {
    let dir = temp_dir("server-mode");
    save_config(
      &dir,
      &DesktopConfig {
        mode: UseMode::Server,
        server_url: "http://ari:8080".to_string(),
        ..Default::default()
      },
    )
    .unwrap();
    // 起動は ari_back を動かすため、ここでは設定の読み取りまでを確かめる
    let places = load_config(&dir).unwrap().unwrap().places();
    assert_eq!(places.start_place, "http://ari:8080");
    fs::remove_dir_all(&dir).unwrap();
  }

  #[test]
  fn percent_decode_restores_japanese_name() {
    assert_eq!(percent_decode("%E8%AD%B0%E4%BA%8B%E9%8C%B2.xlsx"), "議事録.xlsx");
    assert_eq!(percent_decode("a%20b%2"), "a b%2");
  }

  #[test]
  fn update_endpoint_uses_server_or_github() {
    assert_eq!(update_endpoint("").unwrap().as_str(), RELEASE_ENDPOINT);
    let url = update_endpoint(" http://ari-server:8080/ ").unwrap();
    assert!(url
      .as_str()
      .starts_with("http://ari-server:8080/api/app-update/"));
    assert!(update_endpoint("ari-server").is_err());
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
