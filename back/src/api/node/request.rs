use serde::Deserialize;

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
