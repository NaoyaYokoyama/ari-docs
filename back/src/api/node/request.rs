use serde::Deserialize;

#[derive(Deserialize)]
pub struct OpenNodeRequest {
    pub path: String,
}

#[derive(Deserialize)]
pub struct NodeQuery {
    pub path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNodeRequest {
    pub parent_path: String,
    pub node_type: String,
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameNodeRequest {
    pub parent_path: String,
    pub name: String,
    pub new_name: String,
}

// 移動・コピー。paths は folder/ からの相対パス、dest_path は移動先・コピー先のフォルダ
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferNodesRequest {
    pub paths: Vec<String>,
    pub dest_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathsRequest {
    pub paths: Vec<String>,
}

// ファイル・フォルダの説明（FN0301-BR33）。空なら説明を消す
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeDescriptionRequest {
    pub path: String,
    pub description: String,
}

// ファイルのロック（FN0301-BR38）。expires_at は期限（RFC 3339。画面の日時）
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockNodeRequest {
    pub path: String,
    pub expires_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockNodeRequest {
    pub path: String,
}

// ファイルの以前の版（FN0301-BR39）
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeVersionQuery {
    pub path: String,
    pub version_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreVersionRequest {
    pub path: String,
    pub version_id: String,
}
