use std::fs;
use std::io::{self, Read, Seek, Write};
use std::path::Path;

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::common::fs_util::size_of;
use crate::service::node::resolve;

// ZIP でまとめてダウンロードできる大きさの上限（メモリで作るため。FN0301-BR27）
pub const MAX_ZIP_BYTES: u64 = 2 * 1024 * 1024 * 1024;

fn options(size: u64) -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .large_file(size > u32::MAX as u64)
}

// path（ファイル・フォルダ）を zip の name の場所に入れる。フォルダは中身ごと
pub fn add_path<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    path: &Path,
    name: &str,
) -> io::Result<()> {
    if path.is_dir() {
        zip.add_directory(format!("{name}/"), options(0))
            .map_err(io::Error::other)?;
        let mut entries: Vec<_> = fs::read_dir(path)?.flatten().collect();
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let child = format!("{name}/{}", entry.file_name().to_string_lossy());
            add_path(zip, &entry.path(), &child)?;
        }
        Ok(())
    } else {
        let size = fs::metadata(path)?.len();
        zip.start_file(name, options(size))
            .map_err(io::Error::other)?;
        let mut file = fs::File::open(path)?;
        io::copy(&mut file, zip)?;
        Ok(())
    }
}

// 選んだファイル・フォルダを 1 つの ZIP にする（FN0301-BR27）。戻り値は (ZIP の中身, ファイル名)
pub fn zip_nodes(folder_root: &str, paths: &[String]) -> io::Result<(Vec<u8>, String)> {
    if paths.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "対象を選んでください",
        ));
    }
    let mut targets = Vec::new();
    let mut total = 0;
    for path in paths {
        let full_path = resolve(folder_root, path)?;
        if fs::symlink_metadata(&full_path).is_err() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "ファイル・フォルダが見つかりません",
            ));
        }
        total += size_of(&full_path);
        let name = full_path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "folder".to_string());
        targets.push((full_path, name));
    }
    if total > MAX_ZIP_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "大きすぎて ZIP にできません（2 GB まで）。分けてダウンロードしてください",
        ));
    }
    let mut zip = ZipWriter::new(io::Cursor::new(Vec::new()));
    for (full_path, name) in &targets {
        add_path(&mut zip, full_path, name)?;
    }
    let data = zip.finish().map_err(io::Error::other)?.into_inner();
    // 1 件ならその名前、2 件以上なら入っているフォルダの名前
    let file_name = if targets.len() == 1 {
        format!(
            "{}.zip",
            crate::common::fs_util::split_extension(&targets[0].1).0
        )
    } else {
        let parent = targets[0]
            .0
            .parent()
            .and_then(|parent| parent.file_name())
            .map(|name| name.to_string_lossy().to_string())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "folder".to_string());
        format!("{parent}.zip")
    };
    Ok((data, file_name))
}

// ZIP の中の 1 件を、dest（フォルダ）の下の安全な場所（zip slip を防ぐ enclosed_name）に書き出す
pub fn extract_entry<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    index: usize,
    dest: &Path,
) -> io::Result<()> {
    let mut entry = archive.by_index(index).map_err(io::Error::other)?;
    let Some(relative) = entry.enclosed_name() else {
        return Ok(());
    };
    let out = dest.join(relative);
    if entry.is_dir() {
        fs::create_dir_all(&out)?;
        return Ok(());
    }
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = fs::File::create(&out)?;
    io::copy(&mut entry, &mut file)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zip_nodes_keeps_folder_structure() {
        let dir = std::env::temp_dir().join(format!("ari-zip-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("資料/sub")).unwrap();
        fs::write(dir.join("資料/sub/議事録.txt"), "議事録").unwrap();
        fs::write(dir.join("memo.txt"), "memo").unwrap();
        let root = dir.to_str().unwrap();

        let (data, name) = zip_nodes(root, &["資料".to_string()]).unwrap();
        assert_eq!(name, "資料.zip");
        let mut archive = zip::ZipArchive::new(io::Cursor::new(data)).unwrap();
        let mut text = String::new();
        archive
            .by_name("資料/sub/議事録.txt")
            .unwrap()
            .read_to_string(&mut text)
            .unwrap();
        assert_eq!(text, "議事録");

        let (_, name) = zip_nodes(root, &["資料".to_string(), "memo.txt".to_string()]).unwrap();
        assert!(name.ends_with(".zip"));
        assert!(zip_nodes(root, &["../x".to_string()]).is_err());
        assert!(zip_nodes(root, &[]).is_err());

        // 書き出し（zip slip を防ぐ）
        let (data, _) = zip_nodes(root, &["資料".to_string()]).unwrap();
        let mut archive = zip::ZipArchive::new(io::Cursor::new(data)).unwrap();
        let out = dir.join("out");
        for index in 0..archive.len() {
            extract_entry(&mut archive, index, &out).unwrap();
        }
        assert!(out.join("資料/sub/議事録.txt").exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
