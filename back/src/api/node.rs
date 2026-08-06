use axum::{Json, extract::Query};

use serde::{Deserialize, Serialize};

use crate::model::node_type::NodeType;
use crate::service::node;

#[derive(Deserialize)]
pub struct NodeQuery {
    pub path: String,
}

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

pub async fn get_nodes(Query(query): Query<NodeQuery>) -> Json<NodeResponse> {
    Json(node::get_nodes(&query.path))
}
