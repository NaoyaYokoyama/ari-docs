// 文字認識のモデルを back/models/ に用意する（build_models.rs）
#[path = "build_models.rs"]
mod build_models;

fn main() {
    println!("cargo:rerun-if-changed=build_models.rs");
    build_models::ensure(std::path::Path::new(env!("CARGO_MANIFEST_DIR")));
}
