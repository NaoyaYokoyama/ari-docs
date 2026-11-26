use crate::model::node_type::NodeType;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeResponse {
    pub current_path: String,
    pub nodes: Vec<Node>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub node_id: String,
    pub path: String,
    pub name: String,
    pub node_type: NodeType,
    // 説明（FN0301-BR33。無ければ空）
    pub description: String,
    pub updated_by: String,
    pub updated_at: String,
    pub favorite_id: String,
    // ファイルのサイズ（バイト）。フォルダは 0
    pub size: u64,
    // ロック（FN0301-BR38）。期限内のものだけ
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lock: Option<NodeLock>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeLock {
    // ロックした人の表示名と、自分か
    pub user_name: String,
    pub mine: bool,
    // 期限（この PC の時刻。YYYY/MM/DD HH:MM）
    pub expires_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyNodesResponse {
    // コピーしてできた名前（同じ名前があれば「 - コピー」を付ける）
    pub names: Vec<String>,
}
