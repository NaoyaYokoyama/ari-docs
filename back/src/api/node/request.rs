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
