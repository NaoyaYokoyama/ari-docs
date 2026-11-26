use super::{request::*, response::*};
use crate::{
    api::error::ApiError,
    database::connection,
    service::{archive, auth, node, node_lock, trash},
};
use axum::{
    Json,
    extract::{Multipart, Query, State},
    http::{
        HeaderMap, StatusCode,
        header::{CONTENT_DISPOSITION, CONTENT_TYPE},
    },
    response::{IntoResponse, Response},
};

use crate::config::app_state::AppState;

use std::io::ErrorKind;
use tokio::io::AsyncWriteExt;

// ノードの操作のエラーを、画面に出す文言付きの応答にする
fn to_api_error(e: std::io::Error) -> ApiError {
    crate::elog!("node error: {:?}", e);
    match e.kind() {
        ErrorKind::InvalidInput => ApiError::new(StatusCode::BAD_REQUEST, e.to_string()),
        ErrorKind::AlreadyExists => ApiError::new(StatusCode::CONFLICT, e.to_string()),
        // ほかの人のロック（FN0301-BR38）
        ErrorKind::ResourceBusy => ApiError::new(StatusCode::LOCKED, e.to_string()),
        ErrorKind::NotFound => {
            ApiError::new(StatusCode::NOT_FOUND, "ファイル・フォルダが見つかりません")
        }
        ErrorKind::PermissionDenied => ApiError::new(
            StatusCode::FORBIDDEN,
            "ファイル・フォルダを操作する権限がありません",
        ),
        _ => ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "ファイル・フォルダを操作できませんでした",
        ),
    }
}

// 親フォルダからの相対パス（ルートは空）
fn join_path(parent: &str, name: &str) -> String {
    let parent = parent.trim_matches('/');
    if parent.is_empty() {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    }
}

fn require_login(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let conn = connection::connect();
    auth::get_login_user(&conn, state, headers)
        .map(|_| ())
        .ok_or_else(|| StatusCode::UNAUTHORIZED.into())
}

// ノード一覧を取得
pub async fn get_nodes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<NodeQuery>,
) -> Result<Json<NodeResponse>, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;

    // ノードのルートの外は読ませない。消えたフォルダは 404
    let dir = node::resolve(&state.config.folder_root, &query.path).map_err(to_api_error)?;
    if !dir.is_dir() {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "フォルダが見つかりません",
        ));
    }

    let response = node::get_nodes(&conn, &state.config.folder_root, &user.user_id, &query.path)
        .map_err(to_api_error)?;

    Ok(Json(response))
}

// ノードの作成
pub async fn create_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateNodeRequest>,
) -> Result<StatusCode, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    node::create_node(
        &state.config.folder_root,
        &request.parent_path,
        &request.node_type,
        &request.name,
    )
    .map_err(to_api_error)?;
    node::record_updates(
        &conn,
        &state.config.folder_root,
        &user.user_id,
        &[join_path(&request.parent_path, &request.name)],
    );
    Ok(StatusCode::CREATED)
}

// ノードの削除
pub async fn delete_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateNodeRequest>,
) -> Result<StatusCode, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    // ほかの人がロックしているもの（フォルダなら中のもの）は消せない（FN0301-BR38）
    node_lock::ensure_unlocked(
        &conn,
        &user.user_id,
        &[join_path(&request.parent_path, &request.name)],
    )
    .map_err(to_api_error)?;
    // すぐに消さず、ゴミ箱へ移す（FN0302-BR01）
    trash::move_to_trash(
        &conn,
        &state.config,
        &request.parent_path,
        &request.node_type,
        &request.name,
        &user.user_id,
    )
    .map_err(to_api_error)?;
    // 消したものの入っていたフォルダに、消した人を記録する（FN0301-BR34）
    node::record_updates(
        &conn,
        &state.config.folder_root,
        &user.user_id,
        &[join_path(&request.parent_path, &request.name)],
    );
    Ok(StatusCode::NO_CONTENT)
}

// ファイルを開く
pub async fn open_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<OpenNodeRequest>,
) -> Result<StatusCode, ApiError> {
    require_login(&state, &headers)?;
    if state.config.mode.is_local() {
        let file_path =
            node::resolve(&state.config.folder_root, &request.path).map_err(to_api_error)?;
        if !file_path.exists() {
            return Err(ApiError::new(
                StatusCode::NOT_FOUND,
                "ファイルが見つかりません",
            ));
        }

        open::that(file_path).map_err(|e| {
            crate::elog!("open_node error: {:?}", e);
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "ファイルを開けませんでした",
            )
        })?;
    } else {
        // サーバー上のファイルは利用者の PC の OS では開けない
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "共有サーバーのファイルはアプリから開けません",
        ));
    }
    Ok(StatusCode::OK)
}

// アップロード（FN0301-BR29）。上限はサーバーの設定（既定 1 GB、10 GB まで。FN0902）。
// メモリに読まず、データのフォルダの tmp/upload/ へ少しずつ書いてから、すべて届いたら置き場所へ移す
// （途中で切れても元のファイルを壊さない）
pub async fn upload_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<StatusCode, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let max_mb = crate::service::server_settings::get(&conn).upload_max_mb;
    let max_bytes = max_mb as u64 * 1024 * 1024;
    let too_large = || {
        ApiError::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            format!(
                "1 回にアップロードできるのは合計 {} までです（サーバーの設定）",
                format_mb(max_mb)
            ),
        )
    };
    // 送る前に分かる大きさで先に断る（multipart の区切りの分だけ少し大きい）
    if headers
        .get(axum::http::header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .is_some_and(|length| length > max_bytes + 1024 * 1024)
    {
        return Err(too_large());
    }

    let temp_dir = state.config.data_dir().join("tmp").join("upload");
    tokio::fs::create_dir_all(&temp_dir)
        .await
        .map_err(to_api_error)?;
    let mut uploads = TempFiles(Vec::new());
    let mut parent_path = None;
    let mut paths = Vec::new();
    let mut total: u64 = 0;

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        match field.name() {
            Some("parentPath") => {
                parent_path = Some(field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?);
            }

            Some("files") => {
                if field.file_name().is_none() {
                    return Err(StatusCode::BAD_REQUEST.into());
                }
                let temp = temp_dir.join(uuid::Uuid::new_v4().simple().to_string());
                uploads.0.push(temp.clone());
                let mut file = tokio::fs::File::create(&temp).await.map_err(to_api_error)?;
                while let Some(chunk) = field.chunk().await.map_err(|_| StatusCode::BAD_REQUEST)? {
                    total += chunk.len() as u64;
                    if total > max_bytes {
                        return Err(too_large());
                    }
                    file.write_all(&chunk).await.map_err(to_api_error)?;
                }
                file.flush().await.map_err(to_api_error)?;
            }

            Some("paths") => {
                let path = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;

                paths.push(path);
            }

            _ => {}
        }
    }

    let parent_path = parent_path.ok_or(StatusCode::BAD_REQUEST)?;

    if uploads.0.len() != paths.len() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "アップロードの内容が正しくありません",
        ));
    }

    // 書き込む前に、すべての書き込み先がノードのルートの中かを確かめる
    let mut targets = Vec::new();
    let mut relatives = Vec::new();
    for (temp, relative_path) in uploads.0.iter().zip(&paths) {
        let relative = join_path(&parent_path, relative_path.trim_matches('/'));
        let file_path =
            node::resolve(&state.config.folder_root, &relative).map_err(to_api_error)?;
        targets.push((temp.clone(), file_path));
        relatives.push(relative);
    }

    // ほかの人がロックしているファイルは上書きしない（FN0301-BR38）
    node_lock::ensure_unlocked(&conn, &user.user_id, &relatives).map_err(to_api_error)?;

    for (temp, file_path) in targets {
        if let Some(parent) = file_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(to_api_error)?;
        }
        // 別のドライブなら移せないので、写してから消す
        if tokio::fs::rename(&temp, &file_path).await.is_err() {
            tokio::fs::copy(&temp, &file_path)
                .await
                .map_err(to_api_error)?;
        }
    }

    // 入れたフォルダ（中のフォルダへ入れたときも）にも記録する
    relatives.push(parent_path.trim_matches('/').to_string());
    node::record_updates(&conn, &state.config.folder_root, &user.user_id, &relatives);
    Ok(StatusCode::OK)
}

// 途中の書きかけ（と、別のドライブへ写した元）を消す
struct TempFiles(Vec<std::path::PathBuf>);

impl Drop for TempFiles {
    fn drop(&mut self) {
        for path in &self.0 {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn format_mb(mb: i64) -> String {
    if mb >= 1024 && mb % 1024 == 0 {
        format!("{} GB", mb / 1024)
    } else {
        format!("{mb} MB")
    }
}

// 名前の変更（FN0301-BR18）
pub async fn rename_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RenameNodeRequest>,
) -> Result<StatusCode, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    node_lock::ensure_unlocked(
        &conn,
        &user.user_id,
        &[join_path(&request.parent_path, &request.name)],
    )
    .map_err(to_api_error)?;
    node::rename_node(
        &conn,
        &state.config.folder_root,
        &request.parent_path,
        &request.name,
        request.new_name.trim(),
    )
    .map_err(to_api_error)?;
    node::record_updates(
        &conn,
        &state.config.folder_root,
        &user.user_id,
        &[join_path(&request.parent_path, request.new_name.trim())],
    );
    Ok(StatusCode::NO_CONTENT)
}

// ファイル・フォルダの説明を書く（FN0301-BR33）。だれでも書ける
pub async fn update_description(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<NodeDescriptionRequest>,
) -> Result<StatusCode, ApiError> {
    let conn = connection::connect();
    auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    node::update_description(
        &conn,
        &state.config.folder_root,
        &request.path,
        &request.description,
    )
    .map_err(to_api_error)?;
    Ok(StatusCode::NO_CONTENT)
}

// 移動（FN0301-BR19）
pub async fn move_nodes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TransferNodesRequest>,
) -> Result<StatusCode, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    node_lock::ensure_unlocked(&conn, &user.user_id, &request.paths).map_err(to_api_error)?;
    node::move_nodes(
        &conn,
        &state.config.folder_root,
        &request.paths,
        &request.dest_path,
    )
    .map_err(to_api_error)?;
    // 移したもの・移した先・元のフォルダに記録する（元のパスはもう無いので、その親だけが記録される）
    let mut changed = request.paths.clone();
    for path in &request.paths {
        let name = path
            .trim_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or_default();
        changed.push(join_path(&request.dest_path, name));
    }
    node::record_updates(&conn, &state.config.folder_root, &user.user_id, &changed);
    Ok(StatusCode::NO_CONTENT)
}

// コピー（FN0301-BR20）
pub async fn copy_nodes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TransferNodesRequest>,
) -> Result<Json<CopyNodesResponse>, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let names = node::copy_nodes(
        &state.config.folder_root,
        &request.paths,
        &request.dest_path,
    )
    .map_err(to_api_error)?;
    let copied: Vec<String> = names
        .iter()
        .map(|name| join_path(&request.dest_path, name))
        .collect();
    node::record_updates(&conn, &state.config.folder_root, &user.user_id, &copied);
    Ok(Json(CopyNodesResponse { names }))
}

// ダウンロード（FN0301-BR21）。ファイル名は日本語でも崩れないよう RFC 5987 の形で付ける
pub async fn download_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<NodeQuery>,
) -> Result<Response, ApiError> {
    require_login(&state, &headers)?;
    let path =
        node::file_for_download(&state.config.folder_root, &query.path).map_err(to_api_error)?;
    // 大きなファイルでもメモリに全部読まないよう、少しずつ読んで送る（API0310）
    let file = tokio::fs::File::open(&path).await.map_err(to_api_error)?;
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    let body = axum::body::Body::from_stream(tokio_util::io::ReaderStream::new(file));
    Ok(attachment(&name, "application/octet-stream", body))
}

// エクスプローラー（Finder など）で、そのファイル・フォルダの場所を開く（ローカルモードだけ。FN0301-BR22）
pub async fn reveal_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<OpenNodeRequest>,
) -> Result<StatusCode, ApiError> {
    require_login(&state, &headers)?;
    if !state.config.mode.is_local() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "共有サーバーのファイルの場所は開けません",
        ));
    }
    let path = node::resolve(&state.config.folder_root, &request.path).map_err(to_api_error)?;
    if !path.exists() {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "ファイル・フォルダが見つかりません",
        ));
    }
    reveal(&path).map_err(|e| {
        crate::elog!("reveal_node error: {:?}", e);
        ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "場所を開けませんでした")
    })?;
    Ok(StatusCode::NO_CONTENT)
}

// Windows・macOS はそのファイルを選んだ状態で開く。それ以外は入っているフォルダを開く
fn reveal(path: &std::path::Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        let mut arg = std::ffi::OsString::from("/select,");
        arg.push(path);
        std::process::Command::new("explorer").arg(arg).spawn()?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()?;
        Ok(())
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let dir = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };
        open::that(dir)
    }
}

// 選んだファイル・フォルダを ZIP でダウンロード（FN0301-BR27）
pub async fn download_zip(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PathsRequest>,
) -> Result<Response, ApiError> {
    require_login(&state, &headers)?;
    let folder_root = state.config.folder_root.clone();
    // ZIP は一時ファイル（<データのフォルダ>/tmp/zip-*.zip）に作り、少しずつ読んで送る（API0312）
    let dir = state.config.data_dir().join("tmp");
    let (path, name) = tokio::task::spawn_blocking(move || -> std::io::Result<_> {
        std::fs::create_dir_all(&dir)?;
        remove_old_zips(&dir);
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let path = dir.join(format!("zip-{stamp}.zip"));
        let file = std::fs::File::create(&path)?;
        match archive::zip_nodes_into(&folder_root, &request.paths, file) {
            Ok((_, name)) => Ok((path, name)),
            Err(e) => {
                let _ = std::fs::remove_file(&path);
                Err(e)
            }
        }
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .map_err(to_api_error)?;
    let file = tokio::fs::File::open(&path).await.map_err(to_api_error)?;
    // 開いたあとは消してよい（Windows は開いているファイルを消せないので、次に ZIP を作るときに消す）
    if !cfg!(windows) {
        let _ = std::fs::remove_file(&path);
    }
    let body = axum::body::Body::from_stream(tokio_util::io::ReaderStream::new(file));
    Ok(attachment(&name, "application/zip", body))
}

// 送り終わったはずの古い一時 ZIP（1 時間より前）を消す
fn remove_old_zips(dir: &std::path::Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|time| time.elapsed().ok())
            .is_some_and(|age| age > std::time::Duration::from_secs(60 * 60));
        if name.starts_with("zip-") && name.ends_with(".zip") && old {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

// ダウンロードの応答（ファイル名は日本語でも崩れないよう RFC 5987 の形で付ける）
pub fn attachment(name: &str, content_type: &str, body: impl IntoResponse) -> Response {
    let disposition = format!("attachment; filename*=UTF-8''{}", percent_encode(name));
    (
        [
            (CONTENT_TYPE, content_type.to_string()),
            (CONTENT_DISPOSITION, disposition),
        ],
        body,
    )
        .into_response()
}

// URL のパーセントエンコード（英数字と - . _ ~ 以外）
fn percent_encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_encode_japanese_name() {
        assert_eq!(percent_encode("a b.txt"), "a%20b.txt");
        assert_eq!(
            percent_encode("議事録.xlsx"),
            "%E8%AD%B0%E4%BA%8B%E9%8C%B2.xlsx"
        );
    }
}

fn to_lock_error(error: node_lock::LockError) -> ApiError {
    match error {
        node_lock::LockError::Invalid(message) => ApiError::new(StatusCode::BAD_REQUEST, message),
        node_lock::LockError::Forbidden(message) => ApiError::new(StatusCode::FORBIDDEN, message),
        node_lock::LockError::Busy(message) => ApiError::new(StatusCode::CONFLICT, message),
        node_lock::LockError::NotFound => {
            ApiError::new(StatusCode::NOT_FOUND, "ファイルが見つかりません")
        }
        node_lock::LockError::Db(e) => {
            crate::elog!("node lock error: {e:?}");
            StatusCode::INTERNAL_SERVER_ERROR.into()
        }
    }
}

fn require_shared(state: &AppState) -> Result<(), ApiError> {
    if state.config.mode.is_local() {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "ファイルのロックは共有サーバーで使えます",
        ));
    }
    Ok(())
}

// ファイルをロックする（期限を変えるときも。FN0301-BR38）
pub async fn lock_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<LockNodeRequest>,
) -> Result<StatusCode, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    require_shared(&state)?;
    let expires_at = chrono::DateTime::parse_from_rfc3339(&request.expires_at)
        .map_err(|_| ApiError::new(StatusCode::BAD_REQUEST, "期限の日時が正しくありません"))?
        .timestamp();
    node_lock::lock(
        &conn,
        &state.config.folder_root,
        &user.user_id,
        &request.path,
        expires_at,
    )
    .map_err(to_lock_error)?;
    Ok(StatusCode::NO_CONTENT)
}

// ロックを外す。ロックした人と管理者だけ（FN0301-BR38）
pub async fn unlock_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UnlockNodeRequest>,
) -> Result<StatusCode, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    require_shared(&state)?;
    node_lock::unlock(&conn, &user.user_id, auth::is_admin(&user), &request.path)
        .map_err(to_lock_error)?;
    Ok(StatusCode::NO_CONTENT)
}

// ロック中のファイルの一覧（FN0301-BR38）。だれでも見られる（一覧の鍵の印と同じ）。外せるのは本人と管理者
pub async fn get_locks(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<NodeLockItem>>, ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, &state, &headers).ok_or(StatusCode::UNAUTHORIZED)?;
    require_shared(&state)?;
    let locks = crate::repository::node_lock::find_all(&conn, node_lock::now()).map_err(|e| {
        crate::elog!("node lock list error: {e:?}");
        ApiError::from(StatusCode::INTERNAL_SERVER_ERROR)
    })?;
    Ok(Json(
        locks
            .into_iter()
            .map(|lock| NodeLockItem {
                mine: lock.user_id == user.user_id,
                path: lock.path,
                user_name: lock.display_name,
                expires_at: node_lock::format_time(lock.expires_at),
            })
            .collect(),
    ))
}
