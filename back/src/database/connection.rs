use rusqlite::Connection;

pub fn connect() -> Connection {
    std::fs::create_dir_all("data").expect("Failed to create data directory");
    Connection::open("data/ari.db").expect("Failed to open database")
}
