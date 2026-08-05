use std::fs;
use std::path::PathBuf;

use crate::api::node::NodeResponse;
use crate::model::node_type::NodeType;

const ROOT_PATH: &str = "../folder";

pub fn get_nodes(path: &str) -> Vec<NodeResponse> {
    let full_path = PathBuf::from(ROOT_PATH).join(path);
    let entries = fs::read_dir(full_path).unwrap();
    let mut nodes = Vec::new();

    for entry in entries {
        let entry = entry.unwrap();

        let node_type = if entry.file_type().unwrap().is_dir() {
            NodeType::Folder
        } else {
            NodeType::File
        };
        let updated_at = entry.metadata().unwrap().modified().unwrap();

        nodes.push(NodeResponse {
            path: entry.path().to_string_lossy().to_string(),
            name: entry.file_name().to_string_lossy().to_string(),
            node_type: node_type,
            status: "working".to_string(),
            description: String::new(),
            updated_by: String::new(),
            updated_at: chrono::DateTime::<chrono::Local>::from(updated_at)
                .format("%Y/%m/%d %H:%M")
                .to_string(),
        });
    }
    nodes
}
