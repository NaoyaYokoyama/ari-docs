use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

// 個人のタスク（FN0602）。作った本人だけが見る・変える。カンバン（未着手・進行中・完了）と一覧で使う

pub const PRIORITIES: [&str; 3] = ["high", "medium", "low"];
pub const STATUSES: [&str; 3] = ["todo", "doing", "done"];
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
}

// 画面から送るもの（作る・変える）。変えないものは None
#[derive(Default)]
pub struct TaskInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<String>,
    pub status: Option<String>,
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
    created_at, updated_at, completed_at FROM task";

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
        "INSERT INTO task (task_id, user_id, title, description, priority, due_date, status, sort_order, completed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CASE WHEN ?7 = 'done' THEN CURRENT_TIMESTAMP ELSE '' END)",
        params![
            task_id,
            user_id,
            input.title.unwrap_or_default().trim(),
            input.description.unwrap_or_default(),
            input.priority.unwrap_or_else(|| "medium".into()),
            input.due_date.unwrap_or_default(),
            status,
            order,
        ],
    )?;
    find(conn, user_id, &task_id)
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
        "UPDATE task SET title = ?3, description = ?4, priority = ?5, due_date = ?6, status = ?7, sort_order = ?8,
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
        ],
    )?;
    find(conn, user_id, task_id)
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
    for (index, task_id) in task_ids.iter().enumerate() {
        tx.execute(
            "UPDATE task SET sort_order = ?3, status = ?4,
               completed_at = CASE WHEN ?4 <> 'done' THEN '' WHEN completed_at = '' THEN CURRENT_TIMESTAMP ELSE completed_at END,
               updated_at = CASE WHEN status <> ?4 THEN CURRENT_TIMESTAMP ELSE updated_at END
             WHERE task_id = ?1 AND user_id = ?2",
            params![task_id, user_id, index as i64, status],
        )?;
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
}
