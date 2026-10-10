use crate::api::node::{response::Node, response::NodeResponse};
use crate::model::node_type::NodeType;
use crate::repository::favorite as favorite_repo;
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;

const ROOT_PATH: &str = "../folder";
pub fn get_nodes(conn: &Connection, user_id: &str, path: &str) -> rusqlite::Result<NodeResponse> {
    let path = if path == "/" {
        ""
    } else {
        path.trim_start_matches('/')
    };
    let full_path = PathBuf::from(ROOT_PATH).join(path);
    let entries = fs::read_dir(&full_path).unwrap();
    let mut nodes = Vec::new();
    let current_path = path.trim_start_matches('/').to_string();
    for entry in entries {
        let entry = entry.unwrap();

        let node_type = if entry.file_type().unwrap().is_dir() {
            NodeType::Folder
        } else {
            NodeType::File
        };
        let updated_at = entry.metadata().unwrap().modified().unwrap();
        let relative_path = full_path
            .join(entry.file_name())
            .strip_prefix(ROOT_PATH)
            .unwrap()
            .to_string_lossy()
            .to_string();
        nodes.push(Node {
            node_id: String::new(),
            path: relative_path,
            name: entry.file_name().to_string_lossy().to_string(),
            node_type: node_type,
            status: "working".to_string(),
            description: String::new(),
            updated_by: String::new(),
            updated_at: chrono::DateTime::<chrono::Local>::from(updated_at)
                .format("%Y/%m/%d %H:%M")
                .to_string(),
            favorite_id: String::new(),
        });
    }

    let paths: Vec<String> = nodes.iter().map(|node| node.path.clone()).collect();
    let favorite_ids = favorite_repo::find_node_favorite_ids_by_paths(conn, user_id, &paths)?;
    for node in &mut nodes {
        if let Some(favorite_id) = favorite_ids.get(&node.path) {
            node.favorite_id = favorite_id.clone();
        }
    }

    Ok(NodeResponse {
        current_path: current_path.to_string(),
        nodes: nodes,
    })
}

pub fn create_node(parent_path: &str, node_type: &str, name: &str) {
    let full_path = PathBuf::from(ROOT_PATH)
        .join(parent_path.trim_start_matches('/'))
        .join(name);

    if node_type == "folder" {
        fs::create_dir(full_path).unwrap();
    } else {
        fs::File::create(full_path).unwrap();
    }
}

pub fn delete_node(parent_path: &str, node_type: &str, name: &str) -> std::io::Result<()> {
    // nameが空や".."だと親フォルダ以上を消してしまうため弾く
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("invalid node name: {}", name),
        ));
    }

    let full_path = PathBuf::from(ROOT_PATH)
        .join(parent_path.trim_start_matches('/'))
        .join(name);

    if node_type == "folder" {
        fs::remove_dir_all(full_path)
    } else {
        fs::remove_file(full_path)
    }
}
