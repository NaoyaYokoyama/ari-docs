// サーバーの更新（docs の FN0904-BR14〜BR19）。Linux の共有サーバー（`back <config.toml>` で起動したもの）を、
// 管理者が画面から新しい版にする。GitHub Releases のサーバー一式（`.tar.gz`）か、管理者が上げたものを、
// アプリと同じ鍵の署名で確かめてから展開し、DB の写しを残して `back` とモデルを入れ替え、同じ引数で起動し直す。
// デスクトップアプリの中で動くサーバー（この PC の公開）は、アプリの更新でいっしょに新しくなる
use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

use base64::Engine;
use semver::Version;
use serde::{Deserialize, Serialize};

use crate::{config::app::AppConfig, database::connection};

// GitHub Releases の最新の版の情報（Actions が作る。アプリの更新と同じファイル。FN0904-BR02）
const RELEASE_LATEST: &str =
    "https://github.com/NaoyaYokoyama/ari-docs-releases/releases/latest/download/latest.json";
// latest.json の platforms の中の、サーバー一式の名前
pub const PLATFORM: &str = "server-linux-x86_64";
// サーバー一式の中の実行ファイルの名前
const BINARY: &str = "back";
// 展開する場所（実行ファイルのフォルダの中。入れ替えを同じディスクの名前の変更で済ませるため）
const STAGING: &str = ".update-new";
// GitHub に聞いた結果を覚えておく時間（画面を開くたびに聞かないため）
const CHECK_CACHE: Duration = Duration::from_secs(10 * 60);
// 新しい版の情報を聞くときの時間切れ（ファイルを取ってくるときは、つながるまでだけを切る）
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
// 入れ替えてから起動し直すまでの時間（画面に答えを返すため）
const RESTART_DELAY: Duration = Duration::from_millis(1500);

// サーバーとして起動したとき（src/main.rs）だけ画面から更新できる
static ENABLED: AtomicBool = AtomicBool::new(false);
// 更新の途中（2 つ同時に入れ替えない）
static UPDATING: AtomicBool = AtomicBool::new(false);
static CACHE: Mutex<Option<(Instant, Result<Option<Release>, String>)>> = Mutex::new(None);

pub fn enable() {
    ENABLED.store(true, Ordering::SeqCst);
}

pub fn current_version() -> Version {
    Version::parse(env!("CARGO_PKG_VERSION")).expect("Cargo.toml の version")
}

// 新しい版（画面に出すもの）。取ってくる場所と署名は画面に返さない
#[derive(Clone, Debug, Serialize)]
pub struct Release {
    pub version: String,
    // 変更点（GitHub Releases の本文。FN0904-BR13）
    pub notes: String,
    #[serde(skip)]
    url: String,
    #[serde(skip)]
    signature: String,
}

// 署名の公開鍵（アプリと同じ。desktop/src-tauri/tauri.conf.json の plugins.updater.pubkey）。
// 試すときだけ、ビルドのときの環境変数 ARI_UPDATE_PUBKEY で差し替えられる
fn pubkey() -> String {
    if let Some(key) = option_env!("ARI_UPDATE_PUBKEY") {
        return key.trim().to_string();
    }
    let conf: serde_json::Value =
        serde_json::from_str(include_str!("../../../desktop/src-tauri/tauri.conf.json"))
            .unwrap_or_default();
    conf["plugins"]["updater"]["pubkey"]
        .as_str()
        .unwrap_or_default()
        .trim()
        .to_string()
}

// 画面から更新できないときの理由（できるなら None）
pub fn unsupported_reason() -> Option<&'static str> {
    if cfg!(debug_assertions) {
        return Some("開発用のビルドでは、サーバーを画面から更新しません");
    }
    if !ENABLED.load(Ordering::SeqCst) {
        return Some(
            "このサーバーはデスクトップアプリの中で動いています。アプリを更新すると、サーバーも新しい版になります",
        );
    }
    if !cfg!(target_os = "linux") {
        return Some("画面から更新できるのは Linux のサーバーだけです");
    }
    if pubkey().is_empty() {
        return Some("署名の鍵が設定されていない版のため、画面から更新できません");
    }
    None
}

#[derive(Deserialize)]
struct LatestJson {
    version: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    platforms: serde_json::Map<String, serde_json::Value>,
}

fn agent(check: bool) -> ureq::Agent {
    let config = ureq::Agent::config_builder().timeout_connect(Some(CONNECT_TIMEOUT));
    let config = if check {
        config.timeout_global(Some(CHECK_TIMEOUT))
    } else {
        config
    };
    config.build().into()
}

// GitHub Releases の最新の版。今の版より新しくなければ None
fn fetch_latest() -> Result<Option<Release>, String> {
    let text = agent(true)
        .get(RELEASE_LATEST)
        .call()
        .and_then(|mut response| response.body_mut().read_to_string())
        .map_err(|e| match e {
            // まだ版を 1 つも載せていない（または latest.json の無い版）
            ureq::Error::StatusCode(404) => "GitHub Releases にまだ版がありません".to_string(),
            e => format!("GitHub に問い合わせできませんでした（{e}）"),
        })?;
    let latest: LatestJson = serde_json::from_str(&text)
        .map_err(|e| format!("GitHub の版の情報を読めませんでした（{e}）"))?;
    let version = Version::parse(latest.version.trim_start_matches('v'))
        .map_err(|e| format!("GitHub の版の番号を読めませんでした（{e}）"))?;
    if version <= current_version() {
        return Ok(None);
    }
    let platform = latest
        .platforms
        .get(PLATFORM)
        .ok_or_else(|| format!("最新の版（{version}）にサーバーの更新ファイルがありません"))?;
    let field = |name: &str| platform[name].as_str().unwrap_or_default().to_string();
    Ok(Some(Release {
        version: version.to_string(),
        notes: latest.notes.trim().to_string(),
        url: field("url"),
        signature: field("signature"),
    }))
}

// 新しい版を調べる。refresh でなければ 10 分は前の結果を使う
pub fn latest(refresh: bool) -> Result<Option<Release>, String> {
    let mut cache = CACHE.lock().unwrap();
    if !refresh
        && let Some((at, result)) = cache.as_ref()
        && at.elapsed() < CHECK_CACHE
    {
        return result.clone();
    }
    let result = fetch_latest();
    *cache = Some((Instant::now(), result.clone()));
    result
}

// 署名（Tauri の signer が作る .sig。minisign の署名を base64 にしたもの）を確かめる（FN0904-BR06）
pub fn verify(pubkey: &str, signature: &str, data: &[u8]) -> Result<(), String> {
    let decode = |text: &str| {
        base64::engine::general_purpose::STANDARD
            .decode(text.trim())
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
    };
    let key = decode(pubkey)
        .and_then(|text| minisign_verify::PublicKey::decode(&text).ok())
        .ok_or("署名の公開鍵を読めません")?;
    let signature = decode(signature)
        .and_then(|text| minisign_verify::Signature::decode(&text).ok())
        .ok_or("署名を読めません（.sig のファイルを選んでください）")?;
    key.verify(data, &signature, true).map_err(|_| {
        "署名が合いません。ari-docs の配布物ではないか、ファイルが壊れています".to_string()
    })
}

fn exe_path() -> Result<PathBuf, String> {
    std::env::current_exe()
        .and_then(fs::canonicalize)
        .map_err(|e| format!("サーバーの実行ファイルの場所が分かりません: {e}"))
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    path.with_file_name(format!("{name}{suffix}"))
}

// 展開した実行ファイルを動かして版を聞く（この PC で動くかも確かめる。glibc が古いなど）
fn binary_version(binary: &Path) -> Result<Version, String> {
    let mut child = Command::new(binary)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("新しい版を動かせませんでした: {e}"))?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started.elapsed() < Duration::from_secs(30) => {
                std::thread::sleep(Duration::from_millis(100))
            }
            _ => {
                let _ = child.kill();
                return Err("新しい版が答えません".to_string());
            }
        }
    }
    let mut stdout = String::new();
    let mut stderr = String::new();
    if let Some(mut out) = child.stdout.take() {
        let _ = out.read_to_string(&mut stdout);
    }
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut stderr);
    }
    stdout
        .trim()
        .strip_prefix("ari-docs ")
        .and_then(|version| Version::parse(version.trim()).ok())
        .ok_or_else(|| {
            format!(
                "新しい版がこのサーバーで動きません（{}）",
                stderr
                    .lines()
                    .next()
                    .unwrap_or("版を答えませんでした")
                    .trim()
            )
        })
}

// 署名を確かめて、実行ファイルのフォルダの .update-new に展開する。中の back の版を返す
fn prepare(archive: &Path, signature: &str, staging: &Path) -> Result<Version, String> {
    let data = fs::read(archive).map_err(|e| format!("更新ファイルを読めません: {e}"))?;
    verify(&pubkey(), signature, &data)?;
    let _ = fs::remove_dir_all(staging);
    fs::create_dir_all(staging).map_err(|e| format!("展開する場所を作れません: {e}"))?;
    let decoder = flate2::read::GzDecoder::new(io::Cursor::new(data));
    tar::Archive::new(decoder)
        .unpack(staging)
        .map_err(|e| format!("更新ファイルを展開できません（.tar.gz を選んでください）: {e}"))?;
    let binary = staging.join(BINARY);
    if !binary.is_file() {
        return Err(format!("更新ファイルの中に {BINARY} がありません"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&binary, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("新しい版を動かせるようにできません: {e}"))?;
    }
    binary_version(&binary)
}

// 名前の変更で入れ替える。前のものは <名前>.old に残す（戻すとき用。その前の .old は消す）
fn replace(new: &Path, target: &Path) -> Result<(), String> {
    let old = sibling(target, ".old");
    if old.is_dir() {
        let _ = fs::remove_dir_all(&old);
    } else {
        let _ = fs::remove_file(&old);
    }
    if target.exists() {
        fs::rename(target, &old)
            .map_err(|e| format!("{} を入れ替えられません: {e}", target.display()))?;
    }
    fs::rename(new, target).map_err(|e| {
        // 入れ替えられなければ前のものに戻す
        let _ = fs::rename(&old, target);
        format!("{} を入れ替えられません: {e}", target.display())
    })
}

// 入れ替える前の DB の写し（新しい版のマイグレーションで困ったとき、前の版に戻すため）。前の写しは消す
fn snapshot_db(config: &AppConfig) -> Result<PathBuf, String> {
    let dir = config.data_dir().join("server-update");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).map_err(|e| format!("DB の写しの場所を作れません: {e}"))?;
    let path = dir.join(format!("ari-{}.db", current_version()));
    connection::vacuum_into(&connection::connect(), &path)
        .map_err(|e| format!("DB の写しを作れませんでした: {e}"))?;
    Ok(path)
}

struct UpdatingGuard;

impl Drop for UpdatingGuard {
    fn drop(&mut self) {
        UPDATING.store(false, Ordering::SeqCst);
    }
}

// 更新ファイル（.tar.gz）と署名で入れ替え、少し後に起動し直す。expected は GitHub で見つけた版（上げたファイルは無し）
pub fn apply(
    config: &AppConfig,
    archive: &Path,
    signature: &str,
    expected: Option<&Version>,
) -> Result<Version, String> {
    if let Some(reason) = unsupported_reason() {
        return Err(reason.to_string());
    }
    if UPDATING.swap(true, Ordering::SeqCst) {
        return Err("ほかの更新の途中です".to_string());
    }
    let guard = UpdatingGuard;
    if crate::service::backup::is_busy() {
        return Err("バックアップの途中です。終わってから更新してください".to_string());
    }
    let exe = exe_path()?;
    let dir = exe
        .parent()
        .ok_or("サーバーの実行ファイルの場所が分かりません")?;
    let staging = dir.join(STAGING);
    let result = (|| {
        let version = prepare(archive, signature, &staging)?;
        if expected.is_some_and(|expected| *expected != version) {
            return Err(format!(
                "取ってきたファイルの版（{version}）が、GitHub の版と違います"
            ));
        }
        // 前の版には戻さない（マイグレーションは進む方向だけ。FN0904-BR08）
        let current = current_version();
        if version <= current {
            return Err(format!(
                "今の版（{current}）より新しい版だけを入れられます（選んだのは {version}）"
            ));
        }
        let db = snapshot_db(config)?;
        // モデルを先に入れ替え、実行ファイルを入れ替えられなければモデルも戻す
        let models = Path::new(&config.ocr_models_dir);
        let new_models = staging.join("models");
        let models_replaced = new_models.is_dir();
        if models_replaced {
            replace(&new_models, models)?;
        }
        if let Err(e) = replace(&staging.join(BINARY), &exe) {
            if models_replaced {
                let _ = fs::remove_dir_all(models);
                let _ = fs::rename(sibling(models, ".old"), models);
            }
            return Err(e);
        }
        // ライセンスと利用規約（無い版でも更新は止めない）
        for name in ["THIRD_PARTY_NOTICES.txt", "LICENSE.txt"] {
            let _ = fs::copy(staging.join(name), dir.join(name));
        }
        println!(
            "サーバーを {current} から {version} に入れ替えました（前の版: {}、DB の写し: {}）",
            sibling(&exe, ".old").display(),
            db.display()
        );
        Ok(version)
    })();
    let _ = fs::remove_dir_all(&staging);
    let version = result?;
    // 起動し直すまで、ほかの更新を受け付けない
    std::mem::forget(guard);
    restart_later(exe);
    Ok(version)
}

// GitHub Releases の最新の版を取ってきて入れ替える
pub fn apply_from_github(config: &AppConfig) -> Result<Version, String> {
    let release = latest(true)?.ok_or("新しい版はありません")?;
    let version = Version::parse(&release.version).map_err(|e| e.to_string())?;
    let dir = config.data_dir().join("tmp").join("server-update");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).map_err(|e| format!("取ってくる場所を作れません: {e}"))?;
    let file = dir.join("server.tar.gz");
    let result = (|| {
        let mut response = agent(false)
            .get(&release.url)
            .call()
            .map_err(|e| format!("更新ファイルを取ってこられませんでした（{e}）"))?;
        let mut out =
            fs::File::create(&file).map_err(|e| format!("更新ファイルを書けません: {e}"))?;
        io::copy(&mut response.body_mut().as_reader(), &mut out)
            .map_err(|e| format!("更新ファイルを取ってくる途中で切れました（{e}）"))?;
        drop(out);
        apply(config, &file, &release.signature, Some(&version))
    })();
    let _ = fs::remove_dir_all(&dir);
    result
}

// 答えを返してから、同じ引数で新しい実行ファイルを起動し直す（プロセスの番号は変わらないので、systemd もそのまま）
fn restart_later(exe: PathBuf) {
    std::thread::spawn(move || {
        std::thread::sleep(RESTART_DELAY);
        restart(&exe);
    });
}

#[cfg(unix)]
fn restart(exe: &Path) {
    use std::os::unix::process::CommandExt;
    let error = Command::new(exe).args(std::env::args_os().skip(1)).exec();
    // 起動し直せなければ止める（systemd なら起動し直す。OP0007）
    crate::elog!("サーバーを起動し直せませんでした: {error}");
    std::process::exit(1);
}

#[cfg(not(unix))]
fn restart(_exe: &Path) {
    std::process::exit(0);
}

// 前に止まったときの書きかけを消す（起動したとき）
pub fn cleanup(config: &AppConfig) {
    let _ = fs::remove_dir_all(config.data_dir().join("tmp").join("server-update"));
    if let Ok(exe) = exe_path()
        && let Some(dir) = exe.parent()
    {
        let _ = fs::remove_dir_all(dir.join(STAGING));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // `cargo tauri signer generate` で作った試し用の鍵（本番の鍵ではない）で、"ari-docs" に署名したもの
    const TEST_PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDc0MDg4ODc1REYzMTIxMjUKUldRbElUSGZkWWdJZE5RM0wzSytIRS9iaWlRQjFmNlU0MWd2aGdqUlp3dmFQWitqZC9DMDRqei8K";
    const TEST_SIGNATURE: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVRbElUSGZkWWdJZEdhRjhlUjhNSkNGeWVWSlZTMlpERWpyWjJia1ZwNmJxRVk5bCswU1NiUGY4QUxCVG1XaWtBUys2TER3VTRWRzJQejlOd0VEVVpiNlllVEVSLzVGT0FFPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk1NDQ2NTY1CWZpbGU6aGVsbG8udHh0Cm9QSVFobGZaSFlncXU3U2N5ZjcvcENseHEwN25Vc1lhaDBBVC9wQTZBZlIvYytYb2JoL3FEbzZBVFg4OTJ5SUxncGNSYmcxakJjSnRRUUpYQTlIb0F3PT0K";
    const TEST_DATA: &[u8] = b"ari-docs";

    #[test]
    fn verifies_signature_of_the_same_key() {
        assert!(verify(TEST_PUBKEY, TEST_SIGNATURE, TEST_DATA).is_ok());
    }

    #[test]
    fn rejects_changed_data_and_broken_signature() {
        assert!(verify(TEST_PUBKEY, TEST_SIGNATURE, b"changed").is_err());
        assert!(verify(TEST_PUBKEY, "not a signature", TEST_DATA).is_err());
    }

    #[test]
    fn sibling_adds_suffix() {
        assert_eq!(
            sibling(Path::new("/opt/ari-docs/back"), ".old"),
            PathBuf::from("/opt/ari-docs/back.old")
        );
    }
}
