// エラーのログ（docs の 0020_非機能要件・OP0009）。エラーだけを <データのフォルダ>/logs/error.log に追記する。
// 1 MB を超えたら error.log.1 へずらし（古いものは error.log.5 まで残して、それより古いものは消す）。
// 書けなくてもアプリは止めない（ログのためにエラーを増やさない）。起動するまで（init の前）は書かない
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const MAX_BYTES: u64 = 1024 * 1024;
pub const KEEP_FILES: usize = 5;
const FILE_NAME: &str = "error.log";

static DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

// ログのフォルダを決める（server::start で 1 回）。パニック（想定外の停止）も記録する
pub fn init(dir: PathBuf) {
    *DIR.lock().unwrap_or_else(|e| e.into_inner()) = Some(dir);
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        write(&format!("panic: {info}"));
        default_hook(info);
    }));
}

pub fn dir() -> Option<PathBuf> {
    DIR.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

pub fn write(message: &str) {
    let guard = DIR.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(dir) = guard.as_ref() {
        let _ = append(dir, message, MAX_BYTES);
    }
}

fn append(dir: &Path, message: &str, max_bytes: u64) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let path = dir.join(FILE_NAME);
    if fs::metadata(&path).is_ok_and(|meta| meta.len() >= max_bytes) {
        rotate(dir);
    }
    let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    writeln!(file, "[{now}] {message}")
}

// error.log → error.log.1 → … → error.log.5（それより古いものは消える）
fn rotate(dir: &Path) {
    let name = |index: usize| {
        if index == 0 {
            dir.join(FILE_NAME)
        } else {
            dir.join(format!("{FILE_NAME}.{index}"))
        }
    };
    let _ = fs::remove_file(name(KEEP_FILES));
    for index in (0..KEEP_FILES).rev() {
        let _ = fs::rename(name(index), name(index + 1));
    }
}

// エラーを標準エラーとログのファイルの両方に出す
#[macro_export]
macro_rules! elog {
    ($($arg:tt)*) => {{
        let message = format!($($arg)*);
        eprintln!("{message}");
        $crate::common::error_log::write(&message);
    }};
}

#[cfg(test)]
mod tests {
    use super::*;

    // 上限を超えたらずらし、5 個より古いものは消す
    #[test]
    fn rotates_and_keeps_five_files() {
        let dir = std::env::temp_dir().join(format!("ari-error-log-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        for index in 0..8 {
            append(&dir, &format!("error {index}"), 1).unwrap();
        }
        assert!(dir.join("error.log").is_file());
        assert!(dir.join("error.log.5").is_file());
        assert!(!dir.join("error.log.6").exists());
        assert!(
            fs::read_to_string(dir.join("error.log"))
                .unwrap()
                .contains("error 7")
        );
        assert!(
            fs::read_to_string(dir.join("error.log.5"))
                .unwrap()
                .contains("error 2")
        );
        fs::remove_dir_all(&dir).unwrap();
    }
}
