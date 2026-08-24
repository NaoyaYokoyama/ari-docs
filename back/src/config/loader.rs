use std::fs;

use crate::config::app::AppConfig;

pub fn load() -> AppConfig {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/config.toml");

    println!("config path = {}", path);

    let content =
        fs::read_to_string(path)
            .expect("Failed to read config.toml");

    toml::from_str(&content)
        .expect("Failed to parse config.toml")
}
