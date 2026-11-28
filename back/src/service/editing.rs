// 同時編集のお知らせとロック（docs の FN0501-BR11・BR12・API0507）。Wiki を書いている人を、サーバーのメモリに覚える。
// 画面は開いたときに書いている人を確かめ、未保存の変更がある間は書き始めたときと 2 分ごとに知らせる（つなぎっぱなしにしない）。
// 最後に知らせてから STALE_AFTER を過ぎた人は、書くのをやめた（画面を閉じた・PC が止まった）ものとして数えない。
// ロック（サーバーの設定の wikiEditLock。共有モードだけ）のときは、先に書き始めた人のほかは書き始められず、保存もできない。
// サーバーを起動し直したら消える（DB には残さない）
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

// 画面は書いている間 2 分ごとに知らせるので、止まって 10 分で外れる（FN0501-BR12）
pub const STALE_AFTER: Duration = Duration::from_secs(10 * 60);

struct Editor {
    display_name: String,
    // 書き始めた時刻（この PC の時刻の HH:MM。お知らせに出す）
    since: String,
    started: Instant,
    seen: Instant,
}

// wiki_id → (user_id → 書いている人)
static EDITORS: Mutex<Option<HashMap<String, HashMap<String, Editor>>>> = Mutex::new(None);

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Action {
    // 開いたとき・読んでいる間。書いている人を確かめるだけ
    Check,
    // 書き始めた・書いている
    Edit,
    // 書くのをやめた（保存した・変更を捨てた・ほかへ移った）
    Stop,
    // 管理者がロックを外す（書いている人をすべて忘れる）
    Release,
}

#[derive(Debug, PartialEq)]
pub struct Status {
    // ほかに書いている人の表示名
    pub editors: Vec<String>,
    // ロックしている人（自分のほか）と、書き始めた時刻
    pub locked_by: Option<(String, String)>,
}

fn holder<'a>(editors: &'a HashMap<String, Editor>, user_id: &str) -> Option<&'a Editor> {
    editors
        .iter()
        .filter(|(id, _)| id.as_str() != user_id)
        .map(|(_, editor)| editor)
        .min_by_key(|editor| editor.started)
}

pub fn report(
    wiki_id: &str,
    user_id: &str,
    display_name: &str,
    action: Action,
    lock: bool,
    now: Instant,
) -> Status {
    let mut guard = EDITORS.lock().unwrap_or_else(|e| e.into_inner());
    let all = guard.get_or_insert_with(HashMap::new);
    // 古い人は消す（ほかの Wiki の分も。覚えるものが増え続けないように）
    all.retain(|_, editors| {
        editors.retain(|_, editor| now.duration_since(editor.seen) < STALE_AFTER);
        !editors.is_empty()
    });
    let editors = all.entry(wiki_id.to_string()).or_default();
    match action {
        Action::Check => {}
        Action::Stop => {
            editors.remove(user_id);
        }
        Action::Release => editors.clear(),
        Action::Edit => {
            // ロックのときは、ほかの人が書いていれば書き始めさせない
            let blocked = lock && holder(editors, user_id).is_some();
            if !blocked {
                let editor = editors
                    .entry(user_id.to_string())
                    .or_insert_with(|| Editor {
                        display_name: display_name.to_string(),
                        since: chrono::Local::now().format("%H:%M").to_string(),
                        started: now,
                        seen: now,
                    });
                editor.seen = now;
            }
        }
    }
    let mut others: Vec<String> = editors
        .iter()
        .filter(|(id, _)| id.as_str() != user_id)
        .map(|(_, editor)| editor.display_name.clone())
        .collect();
    others.sort();
    let locked_by = if lock {
        holder(editors, user_id).map(|editor| (editor.display_name.clone(), editor.since.clone()))
    } else {
        None
    };
    Status {
        editors: others,
        locked_by,
    }
}

// ほかの人が書いていれば、その人の表示名と書き始めた時刻（ロックのときの保存・削除の確かめ）
pub fn locked_by(wiki_id: &str, user_id: &str, now: Instant) -> Option<(String, String)> {
    let guard = EDITORS.lock().unwrap_or_else(|e| e.into_inner());
    let editors = guard.as_ref()?.get(wiki_id)?;
    editors
        .iter()
        .filter(|(id, editor)| {
            id.as_str() != user_id && now.duration_since(editor.seen) < STALE_AFTER
        })
        .map(|(_, editor)| editor)
        .min_by_key(|editor| editor.started)
        .map(|editor| (editor.display_name.clone(), editor.since.clone()))
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
        let names = |status: Status| status.editors;
        assert!(names(report(wiki, "a", "A さん", Action::Edit, false, now)).is_empty());
        assert_eq!(
            names(report(wiki, "b", "B さん", Action::Edit, false, now)),
            ["A さん"]
        );
        assert_eq!(
            names(report(wiki, "a", "A さん", Action::Edit, false, now)),
            ["B さん"]
        );
        // 開いただけの人も、書いている人が分かる
        assert_eq!(
            names(report(wiki, "c", "C さん", Action::Check, false, now)),
            ["A さん", "B さん"]
        );
        // B がやめた
        assert_eq!(
            names(report(wiki, "b", "B さん", Action::Stop, false, now)),
            ["A さん"]
        );
        assert!(names(report(wiki, "a", "A さん", Action::Edit, false, now)).is_empty());
        // B がまた書き、知らせないまま時間が過ぎた
        report(wiki, "b", "B さん", Action::Edit, false, now);
        let later = now + STALE_AFTER + Duration::from_secs(1);
        assert!(names(report(wiki, "a", "A さん", Action::Edit, false, later)).is_empty());
        forget(wiki);
    }

    #[test]
    fn lock_keeps_others_out_until_released() {
        let now = Instant::now();
        let wiki = "wk_lock_test";
        let first = report(wiki, "a", "A さん", Action::Edit, true, now);
        assert_eq!(first.locked_by, None);
        // B は書き始められない（覚えない）
        let second = report(wiki, "b", "B さん", Action::Edit, true, now);
        assert_eq!(
            second.locked_by.as_ref().map(|(name, _)| name.as_str()),
            Some("A さん")
        );
        assert_eq!(
            report(wiki, "a", "A さん", Action::Check, true, now).editors,
            Vec::<String>::new()
        );
        assert!(locked_by(wiki, "b", now).is_some());
        assert!(locked_by(wiki, "a", now).is_none());
        // A が保存してやめると、B が書ける
        report(wiki, "a", "A さん", Action::Stop, true, now);
        assert_eq!(
            report(wiki, "b", "B さん", Action::Edit, true, now).locked_by,
            None
        );
        // 管理者が外す
        report(wiki, "admin", "管理者", Action::Release, true, now);
        assert!(locked_by(wiki, "a", now).is_none());
        // 止まって 10 分で外れる
        report(wiki, "a", "A さん", Action::Edit, true, now);
        let later = now + STALE_AFTER + Duration::from_secs(1);
        assert!(locked_by(wiki, "b", later).is_none());
        forget(wiki);
    }
}
