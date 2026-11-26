use super::request::*;
use crate::{
    api::error::ApiError,
    config::app_state::AppState,
    database::connection,
    service::{
        auth,
        task::{self, Task, TaskError},
    },
};
use axum::{Json, extract::State, http::HeaderMap, http::StatusCode};

// 個人のタスク（FN0602）。ログインした本人のものだけを扱う

fn to_error(error: TaskError) -> ApiError {
    match error {
        TaskError::Invalid(message) => ApiError::new(StatusCode::BAD_REQUEST, message),
        TaskError::NotFound => ApiError::new(StatusCode::NOT_FOUND, "タスクが見つかりません"),
        TaskError::Db(e) => {
            crate::elog!("task error: {e:?}");
            StatusCode::INTERNAL_SERVER_ERROR.into()
        }
    }
}

fn login(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(rusqlite::Connection, String), ApiError> {
    let conn = connection::connect();
    let user = auth::get_login_user(&conn, state, headers).ok_or(StatusCode::UNAUTHORIZED)?;
    Ok((conn, user.user_id))
}

pub async fn get_tasks(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Task>>, ApiError> {
    let (conn, user_id) = login(&state, &headers)?;
    task::list(&conn, &user_id)
        .map(Json)
        .map_err(|e| to_error(TaskError::Db(e)))
}

pub async fn create_task(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TaskRequest>,
) -> Result<Json<Task>, ApiError> {
    let (conn, user_id) = login(&state, &headers)?;
    task::create(&conn, &user_id, request.input())
        .map(Json)
        .map_err(to_error)
}

pub async fn update_task(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TaskRequest>,
) -> Result<Json<Task>, ApiError> {
    let (conn, user_id) = login(&state, &headers)?;
    let task_id = request.task_id.clone();
    task::update(&conn, &user_id, &task_id, request.input())
        .map(Json)
        .map_err(to_error)
}

pub async fn reorder_tasks(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TaskOrderRequest>,
) -> Result<StatusCode, ApiError> {
    let (conn, user_id) = login(&state, &headers)?;
    task::reorder(&conn, &user_id, &request.status, &request.task_ids).map_err(to_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_task(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TaskIdRequest>,
) -> Result<StatusCode, ApiError> {
    let (conn, user_id) = login(&state, &headers)?;
    task::delete(&conn, &user_id, &request.task_id).map_err(to_error)?;
    Ok(StatusCode::NO_CONTENT)
}

// 完了したものをまとめて消す
pub async fn delete_done_tasks(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let (conn, user_id) = login(&state, &headers)?;
    task::delete_done(&conn, &user_id).map_err(to_error)?;
    Ok(StatusCode::NO_CONTENT)
}

// WBS の中で動かす（FN0602-BR14）
pub async fn move_task(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<TaskMoveRequest>,
) -> Result<StatusCode, ApiError> {
    let (conn, user_id) = login(&state, &headers)?;
    task::move_in_wbs(
        &conn,
        &user_id,
        &request.task_id,
        &request.parent_id,
        request.index,
    )
    .map_err(to_error)?;
    Ok(StatusCode::NO_CONTENT)
}
