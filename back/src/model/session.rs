use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

pub type Sessions = Arc<RwLock<HashMap<String, String>>>;

pub fn new_sessions() -> Sessions {
    Arc::new(RwLock::new(HashMap::new()))
}
