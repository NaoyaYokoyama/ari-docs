use crate::{database::connection, search::index};

// ファイルの中身の取り込み（BAT0302）。単語の区切りに時間がかかるため、呼び出し側で別スレッド（spawn_blocking）で動かす
pub fn execute(folder_root: &str) {
    let conn = connection::connect();
    match index::execute(&conn, folder_root) {
        Ok(summary) if summary.processed > 0 || summary.pending > 0 => println!(
            "content_index: processed = {}, pending = {}",
            summary.processed, summary.pending
        ),
        Ok(_) => {}
        Err(e) => eprintln!("content_index: {e}"),
    }
}
