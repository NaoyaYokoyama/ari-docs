use std::fs;
use std::io;
use std::path::Path;

// 移す。別のディスク（ドライブ）へは rename できないため、コピーしてから消す
pub fn move_path(from: &Path, to: &Path) -> io::Result<()> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent)?;
    }
    match fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(_) => {
            copy_recursive(from, to)?;
            remove_path(from)
        }
    }
}

pub fn copy_recursive(from: &Path, to: &Path) -> io::Result<()> {
    if from.is_dir() {
        fs::create_dir(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(from, to).map(|_| ())
    }
}

pub fn remove_path(path: &Path) -> io::Result<()> {
    if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

// サイズ（バイト）。フォルダは中のファイルの合計
pub fn size_of(path: &Path) -> u64 {
    if path.is_dir() {
        fs::read_dir(path)
            .map(|entries| entries.flatten().map(|entry| size_of(&entry.path())).sum())
            .unwrap_or(0)
    } else {
        fs::metadata(path).map(|m| m.len()).unwrap_or(0)
    }
}

// "memo.txt" -> ("memo", ".txt")。先頭の . だけのもの（.gitignore）と拡張子の無いものはそのまま
pub fn split_extension(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(index) if index > 0 => (&name[..index], &name[index..]),
        _ => (name, ""),
    }
}

// dir に同じ名前があれば "memo (2).txt" … にする（Windows のエクスプローラーと同じ付け方）
pub fn unique_name(dir: &Path, name: &str) -> String {
    if !dir.join(name).exists() {
        return name.to_string();
    }
    let (stem, ext) = split_extension(name);
    (2..)
        .map(|n| format!("{stem} ({n}){ext}"))
        .find(|candidate| !dir.join(candidate).exists())
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unique_name_and_size() {
        let dir = std::env::temp_dir().join(format!("ari-fsutil-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("a")).unwrap();
        fs::write(dir.join("a/x.txt"), "12345").unwrap();
        fs::write(dir.join("memo.txt"), "1").unwrap();
        assert_eq!(unique_name(&dir, "new.txt"), "new.txt");
        assert_eq!(unique_name(&dir, "memo.txt"), "memo (2).txt");
        assert_eq!(size_of(&dir), 6);
        move_path(&dir.join("a"), &dir.join("b/c")).unwrap();
        assert!(dir.join("b/c/x.txt").exists() && !dir.join("a").exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
