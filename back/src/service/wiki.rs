use crate::{
    api::wiki::{response::Wiki, response::WikiResponse},
    common::id::{generate_favorite_id, generate_wiki_id},
    repository::{favorite as favorite_repo, wiki as wiki_repo},
};
use rusqlite::Connection;

pub fn get_wikis(conn: &Connection, user_id: &str) -> rusqlite::Result<WikiResponse> {
    let wikis = wiki_repo::find_by_user_id(conn, user_id)?;
    let wikis = wikis
        .into_iter()
        .map(|wiki| Wiki {
            wiki_id: wiki.wiki_id,
            title: wiki.title,
            content: wiki.content,
            updated_at: wiki.updated_at,
            favorite_id: "".to_string(),
        })
        .collect();
    Ok(WikiResponse { wikis })
}

pub fn get_wiki(conn: &Connection, user_id: &str, wiki_id: &str) -> rusqlite::Result<Wiki> {
    let wiki_result = wiki_repo::find_by_wiki_id(conn, user_id, wiki_id)?;
    let favorite_result = favorite_repo::find_by_wiki_id(conn, user_id, wiki_id)?;

    let mut wiki = Wiki {
        wiki_id: wiki_result.wiki_id,
        title: wiki_result.title,
        content: wiki_result.content,
        updated_at: wiki_result.updated_at,
        favorite_id: String::new(),
    };

    if let Some(favorite) = favorite_result {
        wiki.favorite_id = favorite.favorite_id;
    }

    Ok(wiki)
}

pub fn create_wiki(conn: &Connection, user_id: &str, title: &str) -> rusqlite::Result<Wiki> {
    let wiki_id = generate_wiki_id();
    wiki_repo::create_wiki(conn, user_id, &wiki_id, title)?;
    let wiki_result = wiki_repo::find_by_wiki_id(conn, user_id, &wiki_id)?;
    let wiki = Wiki {
        wiki_id: wiki_result.wiki_id,
        title: wiki_result.title,
        content: wiki_result.content,
        updated_at: wiki_result.updated_at,
        favorite_id: "".to_string(),
    };
    Ok(wiki)
}

pub fn delete_wiki(conn: &Connection, user_id: &str, wiki_id: &str) -> rusqlite::Result<usize> {
    let result = wiki_repo::delete_wiki(conn, user_id, wiki_id)?;
    Ok(result)
}

pub fn update_wiki(
    conn: &Connection,
    user_id: &str,
    wiki_id: &str,
    title: &str,
    content: &str,
) -> rusqlite::Result<usize> {
    let result = wiki_repo::update_wiki(conn, user_id, wiki_id, title, content)?;
    Ok(result)
}

pub fn favorite_wiki(conn: &Connection, user_id: &str, wiki_id: &str) -> rusqlite::Result<()> {
    let favorite_id = generate_favorite_id();
    let mut node_path = "".to_string();
    let mut note_id = "".to_string();
    let result = favorite_repo::create_favorite(
        conn,
        user_id,
        &favorite_id,
        &node_path,
        &note_id,
        &wiki_id,
    )?;
    Ok(())
}
