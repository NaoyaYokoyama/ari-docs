use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::config::app::AppConfig;

// 最初の管理者の登録用のコード（FN0102-BR02）。管理者の PC をすべて失ったときの登録にも使う（FN0102-BR12）。ユーザーが 1 人もいない共有サーバーは、起動したときにコードを作って
// 起動した画面（標準出力）とデータのフォルダの setup-code.txt に書く。ほかの PC から登録するときはこのコードが要る
// （サーバーにつながる人ならだれでも管理者になれてしまうのを防ぐ）。サーバーの PC の中（127.0.0.1）からはコード不要
static CODE: Mutex<Option<String>> = Mutex::new(None);

// 読み違えやすい文字（0・O・1・I）は使わない
const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const FILE_NAME: &str = "setup-code.txt";

fn file_path(config: &AppConfig) -> PathBuf {
    config.data_dir().join(FILE_NAME)
}

pub fn generate() -> String {
    // UUID v4 の版・種類を表す 6・8 番目の値は乱数でないので使わない（32 で割り切れるので偏りもない）
    let bytes = uuid::Uuid::new_v4().into_bytes();
    let chars: String = [0, 1, 2, 3, 4, 5, 10, 11]
        .iter()
        .map(|i| CHARS[bytes[*i] as usize % CHARS.len()] as char)
        .collect();
    format!("{}-{}", &chars[..4], &chars[4..])
}

// 今のコード。まだ無ければ作って、画面とファイルに出す
pub fn current(config: &AppConfig) -> String {
    let mut code = CODE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(code) = code.as_ref() {
        return code.clone();
    }
    let created = generate();
    let path = file_path(config);
    let written = std::fs::write(&path, format!("{created}\n")).is_ok();
    println!("============================================================");
    println!("最初の管理者の登録コード: {created}");
    println!("ログイン画面の「管理者の登録」で入力してください。");
    if written {
        println!("（{} にも書きました。登録すると消します）", path.display());
    }
    println!("============================================================");
    *code = Some(created.clone());
    created
}

// 登録できるか。サーバーの PC の中からはコードを問わない
pub fn verify(config: &AppConfig, addr: &SocketAddr, input: &str) -> bool {
    if is_loopback(addr) {
        return true;
    }
    normalize(input) == normalize(&current(config))
}

// ほかの PC からつないだときはコードが要る
pub fn required(addr: &SocketAddr) -> bool {
    !is_loopback(addr)
}

// 管理者を登録したら、コードとファイルを消す
pub fn clear(config: &AppConfig) {
    *CODE.lock().unwrap_or_else(|e| e.into_inner()) = None;
    let _ = std::fs::remove_file(file_path(config));
}

fn is_loopback(addr: &SocketAddr) -> bool {
    addr.ip().to_canonical().is_loopback()
}

// 大文字・小文字、- と空白の有無は問わない
pub fn normalize(code: &str) -> String {
    code.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_is_easy_to_read_and_compared_loosely() {
        let code = generate();
        assert_eq!(code.len(), 9);
        assert!(code.chars().all(|c| c == '-' || CHARS.contains(&(c as u8))));
        assert_eq!(normalize("abcd-efgh"), normalize("ABCD EFGH"));
    }

    #[test]
    fn loopback_needs_no_code() {
        let local: SocketAddr = "127.0.0.1:5000".parse().unwrap();
        let mapped: SocketAddr = "[::ffff:127.0.0.1]:5000".parse().unwrap();
        let other: SocketAddr = "192.168.1.10:5000".parse().unwrap();
        assert!(!required(&local));
        assert!(!required(&mapped));
        assert!(required(&other));
    }
}
