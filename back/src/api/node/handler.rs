use super::{request::*, response::*};
use crate::service::node;
use axum::{Json, extract::Query, http::StatusCode};

// ノード一覧を取得
pub async fn get_nodes(Query(query): Query<NodeQuery>) -> Json<NodeResponse> {
    Json(node::get_nodes(&query.path))
}

// ノードの作成
pub async fn create_node(Json(request): Json<CreateNodeRequest>) -> StatusCode {
    node::create_node(&request.parent_path, &request.node_type, &request.name);
    StatusCode::CREATED
}

// ノードの削除
pub async fn delete_node(Json(request): Json<CreateNodeRequest>) -> StatusCode {
    node::delete_node(&request.parent_path, &request.node_type, &request.name);
    StatusCode::CREATED
}
