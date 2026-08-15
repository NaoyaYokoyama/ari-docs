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
    pub path: String,
    pub name: String,
    pub node_type: NodeType,
    pub status: String,
    pub description: String,
    pub updated_by: String,
    pub updated_at: String,
}
