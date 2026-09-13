use crate::{common::id::generate_node_id, database::connection, repository::node as node_repo};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub fn execute() -> io::Result<()> {
    println!("node_sync batch executed start");

    let root_path = Path::new("../folder");
    let paths = get_paths(root_path)?;
    let conn = connection::connect();
    let registered_paths = node_repo::find_all_paths(&conn).map_err(io::Error::other)?;

    for path in paths {
        let path = path.to_string_lossy().to_string();
        if registered_paths.contains(&path) {
            continue;
        }
        let node_id = generate_node_id();
        node_repo::create_node(&conn, &node_id, &path).map_err(io::Error::other)?;
    }

    println!("node_sync batch executed end");
    Ok(())
}

fn get_paths(root_path: &Path) -> io::Result<Vec<PathBuf>> {
    let mut paths = Vec::new();

    scan_directory(root_path, &mut paths)?;

    Ok(paths)
}

fn scan_directory(path: &Path, paths: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let entry_path = entry.path();

        paths.push(entry_path.clone());

        if entry_path.is_dir() {
            scan_directory(&entry_path, paths)?;
        }
    }

    Ok(())
}
