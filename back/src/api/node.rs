use axum::{Json, extract::Query, http::StatusCode};

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNodeRequest {
    pub parent_path: String,
    pub node_type: String,
    pub name: String,
}

// ノード一覧を取得
pub async fn get_nodes(Query(query): Query<NodeQuery>) -> Json<NodeResponse> {
    Json(node::get_nodes(&query.path))
}

// ノードの作成
pub async fn create_node(Json(request): Json<CreateNodeRequest>) -> StatusCode {
    node::create_node(
        &request.parent_path,
        &request.node_type,
        &request.name,
    );
    StatusCode::CREATED
}

// ノードの削除
pub async fn delete_node(Json(request): Json<CreateNodeRequest>) -> StatusCode {
    node::delete_node(
        &request.parent_path,
        &request.node_type,
        &request.name,
    );
    StatusCode::CREATED
}
