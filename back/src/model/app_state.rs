use crate::model::session::Sessions;

#[derive(Clone)]
pub struct AppState {
    pub sessions: Sessions,
}
