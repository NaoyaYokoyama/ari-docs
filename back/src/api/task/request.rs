use serde::Deserialize;

use crate::service::task::TaskInput;

// タスクを作る・変える（FN0602）。変えないものは送らない
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRequest {
    #[serde(default)]
    pub task_id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<String>,
    pub status: Option<String>,
}

impl TaskRequest {
    pub fn input(self) -> TaskInput {
        TaskInput {
            title: self.title,
            description: self.description,
            priority: self.priority,
            due_date: self.due_date,
            status: self.status,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskIdRequest {
    pub task_id: String,
}

// 列の並び（カンバンのドラッグ）
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskOrderRequest {
    pub status: String,
    pub task_ids: Vec<String>,
}
