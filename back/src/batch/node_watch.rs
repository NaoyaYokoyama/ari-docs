use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use notify::{RecursiveMode, Watcher};

use crate::batch::node_sync;
use crate::service::backup;

// 見張りで見つけた、変わったパス。数秒ごとにまとめて node テーブルへ反映する
static CHANGED: Mutex<Option<HashSet<PathBuf>>> = Mutex::new(None);

const FLUSH_INTERVAL: Duration = Duration::from_secs(3);

// folder/ の変更を OS から知らせてもらい、数秒以内に node テーブルへ反映する（BAT0301）。
// 見張れないとき（ネットワークドライブなど）はログに出し、10 分ごとの全体の同期だけで動く
pub fn start(folder_root: String) {
    let root = PathBuf::from(&folder_root);
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match notify::recommended_watcher(tx) {
            Ok(watcher) => watcher,
            Err(e) => {
                eprintln!("node_watch: 見張れません: {e}");
                return;
            }
        };
        if let Err(e) = watcher.watch(&root, RecursiveMode::Recursive) {
            eprintln!("node_watch: 見張れません（{}）: {e}", root.display());
            return;
        }
        for event in rx {
            let Ok(event) = event else {
                continue;
            };
            if event.kind.is_access() {
                continue;
            }
            let mut changed = CHANGED.lock().unwrap();
            changed.get_or_insert_with(HashSet::new).extend(event.paths);
        }
    });

    tokio::spawn(async move {
        loop {
            tokio::time::sleep(FLUSH_INTERVAL).await;
            // 復元中は folder/ と DB を入れ替えているため動かさない
            if backup::is_busy() {
                continue;
            }
            let paths: Vec<PathBuf> = match CHANGED.lock().unwrap().take() {
                Some(paths) if !paths.is_empty() => paths.into_iter().collect(),
                _ => continue,
            };
            let root = folder_root.clone();
            let result =
                tokio::task::spawn_blocking(move || node_sync::sync_paths(&root, &paths)).await;
            if let Ok(Err(e)) = result {
                eprintln!("node_watch: {e}");
            }
        }
    });
}
