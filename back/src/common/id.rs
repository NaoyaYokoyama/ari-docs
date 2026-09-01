use ulid::Ulid;

fn generate_id(prefix: &str) -> String {
    let id = Ulid::generate().to_string();
    format!("{}_{}", prefix, &id[14..])
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
