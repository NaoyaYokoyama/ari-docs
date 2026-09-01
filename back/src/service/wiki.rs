use crate::{
    api::wiki::{response::Wiki, response::WikiResponse},
    common::id::generate_wiki_id,
    repository::wiki as wiki_repository,
};
use rusqlite::Connection;

pub fn get_wikis(conn: &Connection, user_id: &str) -> rusqlite::Result<WikiResponse> {
    let wikis = wiki_repository::find_by_user_id(conn, user_id)?;
    let wikis = wikis
        .into_iter()
        .map(|wiki| Wiki {
            wiki_id: wiki.wiki_id,
            title: wiki.title,
            content: wiki.content,
            updated_at: wiki.updated_at,
        })
        .collect();
    Ok(WikiResponse { wikis })
}

pub fn get_wiki(conn: &Connection, user_id: &str, wiki_id: &str) -> rusqlite::Result<Wiki> {
    let wiki_result = wiki_repository::find_by_wiki_id(conn, user_id, wiki_id)?;
    let wiki = Wiki {
        wiki_id: wiki_result.wiki_id,
        title: wiki_result.title,
        content: wiki_result.content,
        updated_at: wiki_result.updated_at,
    };
    Ok(wiki)
}

pub fn create_wiki(conn: &Connection, user_id: &str, title: &str) -> rusqlite::Result<Wiki> {
    let wiki_id = generate_wiki_id();
    wiki_repository::create_wiki(conn, user_id, &wiki_id, title)?;
    let wiki_result = wiki_repository::find_by_wiki_id(conn, user_id, &wiki_id)?;
    let wiki = Wiki {
        wiki_id: wiki_result.wiki_id,
        title: wiki_result.title,
        content: wiki_result.content,
        updated_at: wiki_result.updated_at,
    };
    Ok(wiki)
}

pub fn delete_wiki(conn: &Connection, user_id: &str, wiki_id: &str) -> rusqlite::Result<usize> {
    let result = wiki_repository::delete_wiki(conn, user_id, wiki_id)?;
    Ok(result)
}

pub fn update_wiki(
    conn: &Connection,
    user_id: &str,
    wiki_id: &str,
    title: &str,
    content: &str,
) -> rusqlite::Result<usize> {
    let result = wiki_repository::update_wiki(conn, user_id, wiki_id, title, content)?;
    Ok(result)
}
