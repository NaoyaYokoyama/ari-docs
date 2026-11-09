use std::fs;

use crate::model::folder::Folder;
use crate::model::node_type::NodeType;

// ルート直下の一覧。読めない項目は飛ばす（API が止まらないように）
pub fn get_folders(folder_root: &str) -> std::io::Result<Vec<Folder>> {
    let mut folders = Vec::new();
    for entry in fs::read_dir(folder_root)?.flatten() {
        let folder = fs::metadata(entry.path())
            .map(|metadata| metadata.is_dir())
            .unwrap_or(false);
        folders.push(Folder {
            r#type: if folder {
                NodeType::Folder
            } else {
                NodeType::File
            },
            name: entry.file_name().to_string_lossy().to_string(),
        });
    }
    Ok(folders)
}
