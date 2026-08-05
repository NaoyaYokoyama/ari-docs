use std::fs;

use crate::model::folder::Folder;
use crate::model::node_type::NodeType;

const ROOT_PATH: &str = "../folder";

pub fn get_folders() -> Vec<Folder> {
    let entries = fs::read_dir(ROOT_PATH).unwrap();

    let mut folders = Vec::new();

    for entry in entries {
        let entry = entry.unwrap();

        let node_type = if entry.file_type().unwrap().is_dir() {
            NodeType::Folder
        } else {
            NodeType::File
        };

        folders.push(Folder {
            r#type: node_type,
            name: entry.file_name().to_string_lossy().to_string(),
        });
    }

    folders
}
