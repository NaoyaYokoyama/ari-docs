// 文字認識のモデル（back/models/）を、同梱の確認（tauri_build）より先に用意する（back と同じ処理）
#[path = "../../back/build_models.rs"]
mod build_models;

fn main() {
  println!("cargo:rerun-if-changed=../../back/build_models.rs");
  build_models::ensure(&std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../back"));
  tauri_build::build()
}
