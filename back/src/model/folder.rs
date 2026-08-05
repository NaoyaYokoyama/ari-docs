use crate::model::node_type::NodeType;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub struct Folder {
    pub r#type: NodeType,
    pub name: String,
}
