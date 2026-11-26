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
    pub repeat: Option<String>,
    pub start_date: Option<String>,
    // 作るときだけ（WBS の子として作る。FN0602-BR14）
    pub parent_id: Option<String>,
}

impl TaskRequest {
    pub fn input(self) -> TaskInput {
        TaskInput {
            title: self.title,
            description: self.description,
            priority: self.priority,
            due_date: self.due_date,
            status: self.status,
            repeat: self.repeat,
            start_date: self.start_date,
            parent_id: self.parent_id,
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

// WBS の中で動かす（FN0602-BR14）。parentId（空なら一番上）の子の index 番目へ
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskMoveRequest {
    pub task_id: String,
    #[serde(default)]
    pub parent_id: String,
    pub index: usize,
}
