use std::collections::HashMap;

use rusqlite::Connection;

use crate::{
    common::id::generate_content_folder_id,
    repository::{content_folder as folder_repo, note as note_repo, wiki as wiki_repo},
};

// Note・Wiki のフォルダ（FN0403）
// Note のフォルダは本人だけが使い、Wiki のフォルダは全員で使う（Note・Wiki 本体と同じ）
#[derive(Clone, Copy)]
pub enum Kind {
    Note,
    Wiki,
}

impl Kind {
    pub fn parse(value: &str) -> Option<Kind> {
        match value {
            "note" => Some(Kind::Note),
            "wiki" => Some(Kind::Wiki),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Kind::Note => "note",
            Kind::Wiki => "wiki",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Kind::Note => "Note",
            Kind::Wiki => "Wiki",
        }
    }

    fn owner(self, user_id: &str) -> Option<&str> {
        match self {
            Kind::Note => Some(user_id),
            Kind::Wiki => None,
        }
    }
}

#[derive(Debug)]
pub enum FolderError {
    Invalid(String),
    NotFound,
    Conflict(String),
    Db(rusqlite::Error),
}

impl From<rusqlite::Error> for FolderError {
    fn from(error: rusqlite::Error) -> Self {
        FolderError::Db(error)
    }
}

pub struct Folders {
    pub folders: Vec<folder_repo::FolderRow>,
    // (item_id, folder_id)。一番上にあるものは含めない
    pub items: Vec<(String, String)>,
}

pub fn list(conn: &Connection, kind: Kind, user_id: &str) -> Result<Folders, FolderError> {
    let owner = kind.owner(user_id);
    Ok(Folders {
        folders: folder_repo::find_all(conn, kind.as_str(), owner)?,
        items: folder_repo::find_items(conn, kind.as_str(), owner)?,
    })
}

// 親（'' は一番上）があり、使えるフォルダか
fn check_folder(
    conn: &Connection,
    kind: Kind,
    user_id: &str,
    folder_id: &str,
) -> Result<(), FolderError> {
    if folder_id.is_empty() {
        return Ok(());
    }
    folder_repo::find(conn, kind.as_str(), kind.owner(user_id), folder_id)?
        .map(|_| ())
        .ok_or(FolderError::NotFound)
}

fn check_name(
    conn: &Connection,
    kind: Kind,
    user_id: &str,
    parent_id: &str,
    name: &str,
    except: &str,
) -> Result<(), FolderError> {
    if folder_repo::name_exists(
        conn,
        kind.as_str(),
        kind.owner(user_id),
        parent_id,
        name,
        except,
    )? {
        return Err(FolderError::Conflict(format!(
            "同じ場所に「{name}」というフォルダがあります"
        )));
    }
    Ok(())
}

pub fn create(
    conn: &Connection,
    kind: Kind,
    user_id: &str,
    parent_id: &str,
    name: &str,
) -> Result<String, FolderError> {
    let name = name.trim();
    check_folder(conn, kind, user_id, parent_id)?;
    check_name(conn, kind, user_id, parent_id, name, "")?;
    let folder_id = generate_content_folder_id();
    folder_repo::create(conn, kind.as_str(), user_id, &folder_id, parent_id, name)?;
    Ok(folder_id)
}

pub fn rename(
    conn: &Connection,
    kind: Kind,
    user_id: &str,
    folder_id: &str,
    name: &str,
) -> Result<(), FolderError> {
    let name = name.trim();
    let folder = folder_repo::find(conn, kind.as_str(), kind.owner(user_id), folder_id)?
        .ok_or(FolderError::NotFound)?;
    check_name(conn, kind, user_id, &folder.parent_id, name, folder_id)?;
    folder_repo::rename(conn, folder_id, name)?;
    Ok(())
}

// 中が空のフォルダだけ削除できる（Note・Wiki にはゴミ箱が無く、まとめて消すと戻せないため）
pub fn delete(
    conn: &Connection,
    kind: Kind,
    user_id: &str,
    folder_id: &str,
) -> Result<(), FolderError> {
    folder_repo::find(conn, kind.as_str(), kind.owner(user_id), folder_id)?
        .ok_or(FolderError::NotFound)?;
    if folder_repo::has_children(conn, kind.as_str(), folder_id)? {
        return Err(FolderError::Conflict(format!(
            "中にフォルダや{}があるため削除できません。先に中身を移すか削除してください",
            kind.label()
        )));
    }
    folder_repo::delete(conn, folder_id)?;
    Ok(())
}

// フォルダと Note・Wiki を dest_id のフォルダ（'' は一番上）へ移す。1 つでも移せなければ何も移さない
pub fn move_to(
    conn: &Connection,
    kind: Kind,
    user_id: &str,
    folder_ids: &[String],
    item_ids: &[String],
    dest_id: &str,
) -> Result<(), FolderError> {
    check_folder(conn, kind, user_id, dest_id)?;
    let parents: HashMap<String, String> =
        folder_repo::find_all(conn, kind.as_str(), kind.owner(user_id))?
            .into_iter()
            .map(|folder| (folder.folder_id, folder.parent_id))
            .collect();

    for folder_id in folder_ids {
        let folder = folder_repo::find(conn, kind.as_str(), kind.owner(user_id), folder_id)?
            .ok_or(FolderError::NotFound)?;
        if is_inside(&parents, dest_id, folder_id) {
            return Err(FolderError::Invalid(
                "フォルダをその中へは移動できません".to_string(),
            ));
        }
        check_name(conn, kind, user_id, dest_id, &folder.name, folder_id)?;
    }
    for item_id in item_ids {
        let exists = match kind {
            Kind::Note => note_repo::find_by_note_id(conn, user_id, item_id).is_ok(),
            Kind::Wiki => wiki_repo::find_by_wiki_id(conn, item_id).is_ok(),
        };
        if !exists {
            return Err(FolderError::NotFound);
        }
    }

    let tx = conn.unchecked_transaction()?;
    for folder_id in folder_ids {
        folder_repo::set_parent(&tx, folder_id, dest_id)?;
    }
    for item_id in item_ids {
        folder_repo::place_item(&tx, kind.as_str(), item_id, dest_id)?;
    }
    tx.commit()?;
    Ok(())
}

// target が folder_id 自身かその中か（親をたどる。壊れたデータで回り続けないよう数で止める）
fn is_inside(parents: &HashMap<String, String>, target: &str, folder_id: &str) -> bool {
    let mut current = target;
    for _ in 0..=parents.len() {
        if current.is_empty() {
            return false;
        }
        if current == folder_id {
            return true;
        }
        match parents.get(current) {
            Some(parent) => current = parent,
            None => return false,
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connect() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        for sql in [
            include_str!("../data/migration/T006_create_note.sql"),
            include_str!("../data/migration/T007_create_wiki.sql"),
            include_str!("../data/migration/T013_add_wiki_updated_by.sql"),
            include_str!("../data/migration/T016_create_content_folder.sql"),
        ] {
            conn.execute_batch(sql).unwrap();
        }
        conn
    }

    #[test]
    fn create_rename_and_delete() {
        let conn = connect();
        let a = create(&conn, Kind::Wiki, "taro", "", "手順書").unwrap();
        // 同じ場所に同じ名前は作れない。別の場所なら作れる
        assert!(matches!(
            create(&conn, Kind::Wiki, "hanako", "", "手順書"),
            Err(FolderError::Conflict(_))
        ));
        let b = create(&conn, Kind::Wiki, "hanako", &a, "手順書").unwrap();
        assert!(matches!(
            create(&conn, Kind::Wiki, "taro", "nothing", "x"),
            Err(FolderError::NotFound)
        ));
        rename(&conn, Kind::Wiki, "taro", &b, "サーバー").unwrap();
        // 中にフォルダがあれば消せない
        assert!(matches!(
            delete(&conn, Kind::Wiki, "taro", &a),
            Err(FolderError::Conflict(_))
        ));
        delete(&conn, Kind::Wiki, "taro", &b).unwrap();
        delete(&conn, Kind::Wiki, "taro", &a).unwrap();
        assert!(list(&conn, Kind::Wiki, "taro").unwrap().folders.is_empty());
    }

    #[test]
    fn note_folders_are_private() {
        let conn = connect();
        let a = create(&conn, Kind::Note, "taro", "", "メモ").unwrap();
        // ほかの人の Note のフォルダは見えず、使えない
        assert!(
            list(&conn, Kind::Note, "hanako")
                .unwrap()
                .folders
                .is_empty()
        );
        assert!(matches!(
            rename(&conn, Kind::Note, "hanako", &a, "x"),
            Err(FolderError::NotFound)
        ));
        // 同じ名前でも人が違えば作れる
        create(&conn, Kind::Note, "hanako", "", "メモ").unwrap();
        note_repo::create_note(&conn, "hanako", "nt_1", "花子のメモ").unwrap();
        // ほかの人の Note は移せない
        assert!(matches!(
            move_to(&conn, Kind::Note, "taro", &[], &["nt_1".to_string()], &a),
            Err(FolderError::NotFound)
        ));
    }

    #[test]
    fn move_folders_and_items() {
        let conn = connect();
        let a = create(&conn, Kind::Wiki, "taro", "", "a").unwrap();
        let b = create(&conn, Kind::Wiki, "taro", &a, "b").unwrap();
        wiki_repo::create_wiki(&conn, "taro", "wk_1", "はじめに").unwrap();
        // 自分の中へは移せない
        assert!(matches!(
            move_to(&conn, Kind::Wiki, "taro", &[a.clone()], &[], &b),
            Err(FolderError::Invalid(_))
        ));
        move_to(&conn, Kind::Wiki, "taro", &[], &["wk_1".to_string()], &b).unwrap();
        let items = list(&conn, Kind::Wiki, "hanako").unwrap().items;
        assert_eq!(items, vec![("wk_1".to_string(), b.clone())]);
        // 中に Wiki があるフォルダは消せない
        assert!(matches!(
            delete(&conn, Kind::Wiki, "taro", &b),
            Err(FolderError::Conflict(_))
        ));
        // 一番上へ戻す
        move_to(
            &conn,
            Kind::Wiki,
            "taro",
            &[b.clone()],
            &["wk_1".to_string()],
            "",
        )
        .unwrap();
        assert!(list(&conn, Kind::Wiki, "taro").unwrap().items.is_empty());
        delete(&conn, Kind::Wiki, "taro", &a).unwrap();
    }
}
