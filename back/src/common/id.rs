use ulid::Ulid;

fn generate_id(prefix: &str) -> String {
    let id = Ulid::generate().to_string();
    format!("{}_{}", prefix, &id[14..])
}

pub fn generate_node_id() -> String {
    generate_id("nd")
}

pub fn generate_note_id() -> String {
    generate_id("nt")
}

pub fn generate_wiki_id() -> String {
    generate_id("wk")
}

pub fn generate_favorite_id() -> String {
    generate_id("fv")
}

pub fn generate_trash_id() -> String {
    generate_id("tr")
}

pub fn generate_image_id() -> String {
    generate_id("im")
}

pub fn generate_backup_id() -> String {
    generate_id("bk")
}

pub fn generate_content_folder_id() -> String {
    generate_id("cf")
}
