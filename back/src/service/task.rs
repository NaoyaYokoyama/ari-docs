use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

// 個人のタスク（FN0602）。作った本人だけが見る・変える。カンバン（未着手・進行中・完了）と一覧で使う

pub const PRIORITIES: [&str; 3] = ["high", "medium", "low"];
pub const STATUSES: [&str; 3] = ["todo", "doing", "done"];
// 繰り返し（FN0602-BR10）。空はなし
pub const REPEATS: [&str; 5] = ["", "daily", "weekdays", "weekly", "monthly"];
pub const TITLE_MAX: usize = 100;
pub const DESCRIPTION_MAX: usize = 10_000;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub task_id: String,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub due_date: String,
    pub status: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: String,
    pub repeat: String,
}

// 画面から送るもの（作る・変える）。変えないものは None
#[derive(Default)]
pub struct TaskInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<String>,
    pub status: Option<String>,
    pub repeat: Option<String>,
}

#[derive(Debug)]
pub enum TaskError {
    Invalid(String),
    NotFound,
    Db(rusqlite::Error),
}

impl From<rusqlite::Error> for TaskError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Db(error)
    }
}

const SELECT: &str = "SELECT task_id, title, description, priority, due_date, status, sort_order,
    created_at, updated_at, completed_at, repeat FROM task";

fn to_task(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        task_id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        priority: row.get(3)?,
        due_date: row.get(4)?,
        status: row.get(5)?,
        sort_order: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        completed_at: row.get(9)?,
        repeat: row.get(10)?,
    })
}

fn validate(input: &TaskInput) -> Result<(), TaskError> {
    let invalid = |message: &str| Err(TaskError::Invalid(message.to_string()));
    if let Some(title) = &input.title {
        let title = title.trim();
        if title.is_empty() {
            return invalid("タイトルを入力してください");
        }
        if title.chars().count() > TITLE_MAX {
            return invalid(&format!("タイトルは {TITLE_MAX} 文字までです"));
        }
    }
    if input
        .description
        .as_ref()
        .is_some_and(|text| text.chars().count() > DESCRIPTION_MAX)
    {
        return invalid(&format!("メモは {DESCRIPTION_MAX} 文字までです"));
    }
    if input
        .priority
        .as_ref()
        .is_some_and(|value| !PRIORITIES.contains(&value.as_str()))
    {
        return invalid("優先度が正しくありません");
    }
    if input
        .status
        .as_ref()
        .is_some_and(|value| !STATUSES.contains(&value.as_str()))
    {
        return invalid("状態が正しくありません");
    }
    if input
        .repeat
        .as_ref()
        .is_some_and(|value| !REPEATS.contains(&value.as_str()))
    {
        return invalid("繰り返しが正しくありません");
    }
    if input.due_date.as_ref().is_some_and(|value| {
        !value.is_empty() && chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_err()
    }) {
        return invalid("期限の日付が正しくありません");
    }
    Ok(())
}

pub fn list(conn: &Connection, user_id: &str) -> rusqlite::Result<Vec<Task>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE user_id = ?1 ORDER BY status, sort_order, created_at DESC"
    ))?;
    stmt.query_map([user_id], to_task)?.collect()
}

fn find(conn: &Connection, user_id: &str, task_id: &str) -> Result<Task, TaskError> {
    conn.query_row(
        &format!("{SELECT} WHERE task_id = ?1 AND user_id = ?2"),
        [task_id, user_id],
        to_task,
    )
    .optional()?
    .ok_or(TaskError::NotFound)
}

// 列の一番上の位置（新しく作ったもの・ほかの列から来たものを上に置く）
fn top_order(conn: &Connection, user_id: &str, status: &str) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COALESCE(MIN(sort_order), 1) - 1 FROM task WHERE user_id = ?1 AND status = ?2",
        [user_id, status],
        |row| row.get(0),
    )
}

pub fn create(conn: &Connection, user_id: &str, input: TaskInput) -> Result<Task, TaskError> {
    if input.title.is_none() {
        return Err(TaskError::Invalid("タイトルを入力してください".into()));
    }
    validate(&input)?;
    let status = input.status.clone().unwrap_or_else(|| "todo".into());
    let task_id = format!("tk_{}", uuid::Uuid::new_v4().simple());
    let order = top_order(conn, user_id, &status)?;
    conn.execute(
        "INSERT INTO task (task_id, user_id, title, description, priority, due_date, status, sort_order, repeat, completed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, CASE WHEN ?7 = 'done' THEN CURRENT_TIMESTAMP ELSE '' END)",
        params![
            task_id,
            user_id,
            input.title.unwrap_or_default().trim(),
            input.description.unwrap_or_default(),
            input.priority.unwrap_or_else(|| "medium".into()),
            input.due_date.unwrap_or_default(),
            status,
            order,
            input.repeat.unwrap_or_default(),
        ],
    )?;
    find(conn, user_id, &task_id)
}

// 繰り返しの次の日。期限（無ければ今日）から進め、今日より後になるまで進める
pub fn next_due(
    repeat: &str,
    due_date: &str,
    today: chrono::NaiveDate,
) -> Option<chrono::NaiveDate> {
    use chrono::{Days, Months};
    let base = chrono::NaiveDate::parse_from_str(due_date, "%Y-%m-%d").unwrap_or(today);
    let step = |date: chrono::NaiveDate| -> Option<chrono::NaiveDate> {
        match repeat {
            "daily" => date.checked_add_days(Days::new(1)),
            "weekdays" => {
                let mut next = date.checked_add_days(Days::new(1))?;
                // 土日・祝日は飛ばす
                while !crate::common::holiday::is_business_day(next) {
                    next = next.checked_add_days(Days::new(1))?;
                }
                Some(next)
            }
            "weekly" => date.checked_add_days(Days::new(7)),
            // 31 日など無い月は月末（chrono が合わせる）
            "monthly" => date.checked_add_months(Months::new(1)),
            _ => None,
        }
    };
    let mut next = step(base)?;
    while next <= today {
        next = step(next)?;
    }
    Some(next)
}

// 繰り返しのタスクを完了にしたとき、次の回を未着手の一番上に作る。完了にしたほうは繰り返しを外す（完了を戻して付け直しても二重に作らないため）
fn spawn_next(conn: &Connection, user_id: &str, task: &Task) -> Result<(), TaskError> {
    if task.repeat.is_empty() {
        return Ok(());
    }
    let Some(due) = next_due(
        &task.repeat,
        &task.due_date,
        chrono::Local::now().date_naive(),
    ) else {
        return Ok(());
    };
    create(
        conn,
        user_id,
        TaskInput {
            title: Some(task.title.clone()),
            description: Some(task.description.clone()),
            priority: Some(task.priority.clone()),
            due_date: Some(due.format("%Y-%m-%d").to_string()),
            status: Some("todo".into()),
            repeat: Some(task.repeat.clone()),
        },
    )?;
    conn.execute(
        "UPDATE task SET repeat = '' WHERE task_id = ?1 AND user_id = ?2",
        [&task.task_id, user_id],
    )?;
    Ok(())
}

// 変える。状態を変えたときは、その列の一番上に置く。完了にしたら完了の日時を記録する
pub fn update(
    conn: &Connection,
    user_id: &str,
    task_id: &str,
    input: TaskInput,
) -> Result<Task, TaskError> {
    validate(&input)?;
    let current = find(conn, user_id, task_id)?;
    let status = input.status.clone().unwrap_or(current.status.clone());
    let order = if status != current.status {
        top_order(conn, user_id, &status)?
    } else {
        current.sort_order
    };
    conn.execute(
        "UPDATE task SET title = ?3, description = ?4, priority = ?5, due_date = ?6, status = ?7, sort_order = ?8, repeat = ?9,
           completed_at = CASE WHEN ?7 <> 'done' THEN '' WHEN completed_at = '' THEN CURRENT_TIMESTAMP ELSE completed_at END,
           updated_at = CURRENT_TIMESTAMP
         WHERE task_id = ?1 AND user_id = ?2",
        params![
            task_id,
            user_id,
            input.title.map(|t| t.trim().to_string()).unwrap_or(current.title),
            input.description.unwrap_or(current.description),
            input.priority.unwrap_or(current.priority),
            input.due_date.unwrap_or(current.due_date),
            status,
            order,
            input.repeat.unwrap_or(current.repeat),
        ],
    )?;
    let task = find(conn, user_id, task_id)?;
    if task.status == "done" && current.status != "done" {
        spawn_next(conn, user_id, &task)?;
        return find(conn, user_id, task_id);
    }
    Ok(task)
}

// 列の中の並び（カンバンのドラッグ）。task_ids の順にその状態へ並べる（ほかの列から来たものも状態を変える）
pub fn reorder(
    conn: &Connection,
    user_id: &str,
    status: &str,
    task_ids: &[String],
) -> Result<(), TaskError> {
    if !STATUSES.contains(&status) {
        return Err(TaskError::Invalid("状態が正しくありません".into()));
    }
    let tx = conn.unchecked_transaction()?;
    // 完了の列へ動かした繰り返しのタスク（動かしたあとで次の回を作る）
    let mut finished = Vec::new();
    for (index, task_id) in task_ids.iter().enumerate() {
        if status == "done"
            && let Ok(task) = find(&tx, user_id, task_id)
            && task.status != "done"
            && !task.repeat.is_empty()
        {
            finished.push(task_id.clone());
        }
        tx.execute(
            "UPDATE task SET sort_order = ?3, status = ?4,
               completed_at = CASE WHEN ?4 <> 'done' THEN '' WHEN completed_at = '' THEN CURRENT_TIMESTAMP ELSE completed_at END,
               updated_at = CASE WHEN status <> ?4 THEN CURRENT_TIMESTAMP ELSE updated_at END
             WHERE task_id = ?1 AND user_id = ?2",
            params![task_id, user_id, index as i64, status],
        )?;
    }
    for task_id in finished {
        let task = find(&tx, user_id, &task_id)?;
        spawn_next(&tx, user_id, &task)?;
    }
    tx.commit()?;
    Ok(())
}

pub fn delete(conn: &Connection, user_id: &str, task_id: &str) -> Result<(), TaskError> {
    if conn.execute(
        "DELETE FROM task WHERE task_id = ?1 AND user_id = ?2",
        [task_id, user_id],
    )? == 0
    {
        return Err(TaskError::NotFound);
    }
    Ok(())
}

// 完了したものをまとめて消す
pub fn delete_done(conn: &Connection, user_id: &str) -> rusqlite::Result<usize> {
    conn.execute(
        "DELETE FROM task WHERE user_id = ?1 AND status = 'done'",
        [user_id],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::migration::migrate;

    fn input(title: &str) -> TaskInput {
        TaskInput {
            title: Some(title.into()),
            ..Default::default()
        }
    }

    #[test]
    fn create_update_reorder_and_own_only() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn);
        let a = create(&conn, "u1", input("a")).unwrap();
        let b = create(&conn, "u1", input("b")).unwrap();
        // 新しいものが上
        let todo: Vec<String> = list(&conn, "u1")
            .unwrap()
            .into_iter()
            .map(|t| t.title)
            .collect();
        assert_eq!(todo, ["b", "a"]);
        assert_eq!(a.priority, "medium");
        // ほかの人には見えない・変えられない
        assert!(list(&conn, "u2").unwrap().is_empty());
        assert!(matches!(
            update(&conn, "u2", &a.task_id, input("x")),
            Err(TaskError::NotFound)
        ));
        // 完了にすると完了の日時が付き、戻すと消える
        let done = update(
            &conn,
            "u1",
            &a.task_id,
            TaskInput {
                status: Some("done".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(!done.completed_at.is_empty());
        reorder(
            &conn,
            "u1",
            "doing",
            &[a.task_id.clone(), b.task_id.clone()],
        )
        .unwrap();
        let tasks = list(&conn, "u1").unwrap();
        assert!(
            tasks
                .iter()
                .all(|t| t.status == "doing" && t.completed_at.is_empty())
        );
        assert_eq!(tasks[0].title, "a");
        // 入力の確かめ
        assert!(matches!(
            create(&conn, "u1", input(" ")),
            Err(TaskError::Invalid(_))
        ));
        assert!(matches!(
            create(
                &conn,
                "u1",
                TaskInput {
                    due_date: Some("2026-13-01".into()),
                    ..input("c")
                }
            ),
            Err(TaskError::Invalid(_))
        ));
        assert!(matches!(
            create(
                &conn,
                "u1",
                TaskInput {
                    priority: Some("urgent".into()),
                    ..input("c")
                }
            ),
            Err(TaskError::Invalid(_))
        ));
        delete(&conn, "u1", &b.task_id).unwrap();
        assert_eq!(list(&conn, "u1").unwrap().len(), 1);
    }

    fn date(value: &str) -> chrono::NaiveDate {
        chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn next_due_moves_past_today() {
        let today = date("2026-11-26"); // 木曜
        let next = |repeat: &str, due: &str| next_due(repeat, due, today).map(|d| d.to_string());
        assert_eq!(next("daily", "2026-11-26").as_deref(), Some("2026-11-27"));
        // 遅れていても今日より後へ
        assert_eq!(next("daily", "2026-11-01").as_deref(), Some("2026-11-27"));
        assert_eq!(next("weekly", "2026-11-12").as_deref(), Some("2026-12-03"));
        // 早く終えたら期限から 1 回分
        assert_eq!(next("weekly", "2026-11-27").as_deref(), Some("2026-12-04"));
        // 金曜の次の平日は月曜
        assert_eq!(
            next("weekdays", "2026-11-27").as_deref(),
            Some("2026-11-30")
        );
        // 祝日も飛ばす（1/1 は元日）
        assert_eq!(
            next("weekdays", "2026-12-31").as_deref(),
            Some("2027-01-04")
        );
        // 期限が無ければ今日から
        assert_eq!(next("daily", "").as_deref(), Some("2026-11-27"));
        // 月末は次の月の末へ
        assert_eq!(next("monthly", "2027-01-31").as_deref(), Some("2027-02-28"));
        assert_eq!(next("", "2026-11-26"), None);
    }

    #[test]
    fn completing_repeat_creates_next_once() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn);
        let a = create(
            &conn,
            "u1",
            TaskInput {
                repeat: Some("daily".into()),
                priority: Some("high".into()),
                ..input("日報")
            },
        )
        .unwrap();
        let done = TaskInput {
            status: Some("done".into()),
            ..Default::default()
        };
        let finished = update(&conn, "u1", &a.task_id, done).unwrap();
        assert_eq!(finished.repeat, "");
        let tasks = list(&conn, "u1").unwrap();
        assert_eq!(tasks.len(), 2);
        let next = tasks.iter().find(|t| t.status == "todo").unwrap();
        assert_eq!(
            (
                next.title.as_str(),
                next.priority.as_str(),
                next.repeat.as_str()
            ),
            ("日報", "high", "daily")
        );
        assert!(!next.due_date.is_empty());
        // 戻して完了にし直しても増えない
        for status in ["todo", "done"] {
            let input = TaskInput {
                status: Some(status.into()),
                ..Default::default()
            };
            update(&conn, "u1", &a.task_id, input).unwrap();
        }
        assert_eq!(list(&conn, "u1").unwrap().len(), 2);
        // ドラッグで完了の列へ動かしても作る
        reorder(&conn, "u1", "done", std::slice::from_ref(&next.task_id)).unwrap();
        assert_eq!(list(&conn, "u1").unwrap().len(), 3);
        assert!(matches!(
            create(
                &conn,
                "u1",
                TaskInput {
                    repeat: Some("yearly".into()),
                    ..input("x")
                }
            ),
            Err(TaskError::Invalid(_))
        ));
    }
}
