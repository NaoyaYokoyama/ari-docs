// 同時編集のお知らせ（docs の FN0501-BR11・API0507）。Wiki を書いている人を、サーバーのメモリに覚える。
// 画面は未保存の変更がある間だけ、書き始めたときと 5 分ごとに知らせる（つなぎっぱなしにしない）。
// 最後に知らせてから STALE_AFTER を過ぎた人は、書くのをやめた（画面を閉じた）ものとして数えない。
// サーバーを起動し直したら消える（DB には残さない）
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

// 画面は 5 分ごとに知らせるので、2 回分と少しで切れる
pub const STALE_AFTER: Duration = Duration::from_secs(11 * 60);

struct Editor {
    display_name: String,
    seen: Instant,
}

// wiki_id → (user_id → 書いている人)
static EDITORS: Mutex<Option<HashMap<String, HashMap<String, Editor>>>> = Mutex::new(None);

// 書いている（editing = true）・やめた（false）を知らせ、ほかに書いている人の表示名を返す
pub fn report(
    wiki_id: &str,
    user_id: &str,
    display_name: &str,
    editing: bool,
    now: Instant,
) -> Vec<String> {
    let mut guard = EDITORS.lock().unwrap_or_else(|e| e.into_inner());
    let all = guard.get_or_insert_with(HashMap::new);
    // 古い人は消す（ほかの Wiki の分も。覚えるものが増え続けないように）
    all.retain(|_, editors| {
        editors.retain(|_, editor| now.duration_since(editor.seen) < STALE_AFTER);
        !editors.is_empty()
    });
    let editors = all.entry(wiki_id.to_string()).or_default();
    if editing {
        editors.insert(
            user_id.to_string(),
            Editor {
                display_name: display_name.to_string(),
                seen: now,
            },
        );
    } else {
        editors.remove(user_id);
    }
    let mut others: Vec<String> = editors
        .iter()
        .filter(|(id, _)| id.as_str() != user_id)
        .map(|(_, editor)| editor.display_name.clone())
        .collect();
    others.sort();
    others
}

// Wiki を消したら、その Wiki の分を忘れる
pub fn forget(wiki_id: &str) {
    if let Some(all) = EDITORS.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
        all.remove(wiki_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_other_editors_until_they_stop_or_go_stale() {
        let now = Instant::now();
        let wiki = "wk_editing_test";
        assert!(report(wiki, "a", "A さん", true, now).is_empty());
        assert_eq!(report(wiki, "b", "B さん", true, now), ["A さん"]);
        assert_eq!(report(wiki, "a", "A さん", true, now), ["B さん"]);
        // B がやめた
        assert_eq!(report(wiki, "b", "B さん", false, now), ["A さん"]);
        assert!(report(wiki, "a", "A さん", true, now).is_empty());
        // B がまた書き、知らせないまま時間が過ぎた
        report(wiki, "b", "B さん", true, now);
        let later = now + STALE_AFTER + Duration::from_secs(1);
        assert!(report(wiki, "a", "A さん", true, later).is_empty());
        forget(wiki);
    }
}
