// 文字認識のモデル（PaddleOCR PP-OCRv6 small）を back/models/ に用意する（docs の FN0202-BR15）。
// back と desktop の両方のビルドスクリプトから使う（desktop は同梱の確認がこれより先に走るため、自分でも呼ぶ）。
// 無ければ PaddlePaddle 公式の配布元から取得し、SHA-256 で改ざん・壊れを確かめる。
// 取得できなくてもビルドは止めない（文字認識だけ使えない）
use std::path::{Path, PathBuf};
use std::process::Command;

use sha2::{Digest, Sha256};

enum Convert {
    // そのまま置く
    Copy,
    // inference.yml の character_dict を 1 行 1 字の文字の一覧にする（oar-ocr が読む形）
    CharacterDict,
}

struct Output {
    // tar の中のファイル
    member: &'static str,
    // back/models/ に置く名前
    file: &'static str,
    sha256: &'static str,
    convert: Convert,
}

struct Archive {
    url: &'static str,
    outputs: &'static [Output],
}

const BASE_URL: &str =
    "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/";

const ARCHIVES: &[Archive] = &[
    // 文字の場所を見つけるモデル
    Archive {
        url: "PP-OCRv6_small_det_onnx_infer.tar",
        outputs: &[Output {
            member: "PP-OCRv6_small_det_onnx_infer/inference.onnx",
            file: "pp-ocrv6_small_det.onnx",
            sha256: "d73e0058b7a8086bbd57f3d10b8bcd4ff95363f67e06e2762b5e814fe9c9410e",
            convert: Convert::Copy,
        }],
    },
    // 文字を読むモデルと、読める文字の一覧（18,708 字）
    Archive {
        url: "PP-OCRv6_small_rec_onnx_infer.tar",
        outputs: &[
            Output {
                member: "PP-OCRv6_small_rec_onnx_infer/inference.onnx",
                file: "pp-ocrv6_small_rec.onnx",
                sha256: "5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634",
                convert: Convert::Copy,
            },
            Output {
                member: "PP-OCRv6_small_rec_onnx_infer/inference.yml",
                file: "ppocrv6_dict.txt",
                sha256: "b5f2bfe2bdd9448429e3e82b51c789775d9b42f2403d082b00662eb77e401c5d",
                convert: Convert::CharacterDict,
            },
        ],
    },
];

// back/models/ を用意する。back_dir は back/ のパス
pub fn ensure(back_dir: &Path) {
    println!("cargo:rerun-if-env-changed=ARI_DOCS_SKIP_MODELS");
    let dir = back_dir.join("models");
    for archive in ARCHIVES {
        for output in archive.outputs {
            println!("cargo:rerun-if-changed={}", dir.join(output.file).display());
        }
    }
    if std::env::var_os("ARI_DOCS_SKIP_MODELS").is_some() {
        return;
    }
    if let Err(e) = std::fs::create_dir_all(&dir) {
        println!("cargo:warning=models フォルダを作れません: {e}");
        return;
    }
    for archive in ARCHIVES {
        let ready = archive
            .outputs
            .iter()
            .all(|output| sha256_file(&dir.join(output.file)).as_deref() == Some(output.sha256));
        if ready {
            continue;
        }
        if let Err(e) = fetch(archive, &dir) {
            println!(
                "cargo:warning=文字認識のモデル（{}）を取得できませんでした（文字認識は使えません）: {e}",
                archive.url
            );
        }
    }
}

fn fetch(archive: &Archive, dir: &Path) -> Result<(), String> {
    // 同時に動くビルド（back と desktop）がぶつからないよう、ビルドごとの一時フォルダ（OUT_DIR）で作ってから置く。
    // models/ の中で作業すると、Cargo が変わったとみなして毎回作り直すため
    let out_dir = std::env::var_os("OUT_DIR").ok_or("OUT_DIR がありません")?;
    let work = PathBuf::from(out_dir).join(format!("download-{}", archive.url));
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let result = (|| {
        let tar = work.join("download.tar");
        run(Command::new("curl")
            .args(["-fsSL", "--retry", "5", "--retry-delay", "3", "-o"])
            .arg(&tar)
            .arg(format!("{BASE_URL}{}", archive.url)))?;
        let mut command = Command::new("tar");
        command.arg("-xf").arg(&tar).arg("-C").arg(&work);
        for output in archive.outputs {
            command.arg(output.member);
        }
        run(&mut command)?;
        for output in archive.outputs {
            let bytes = std::fs::read(work.join(output.member)).map_err(|e| e.to_string())?;
            let bytes = match output.convert {
                Convert::Copy => bytes,
                Convert::CharacterDict => character_dict(&String::from_utf8_lossy(&bytes))?,
            };
            let hash = sha256(&bytes);
            if hash != output.sha256 {
                return Err(format!(
                    "{} の SHA-256 が一致しません（{hash}）",
                    output.file
                ));
            }
            // 書きかけのファイルを使わないよう、別の名前で書いてから置き換える
            let path = dir.join(output.file);
            let temp = path.with_extension(format!("part{}", std::process::id()));
            std::fs::write(&temp, &bytes).map_err(|e| e.to_string())?;
            std::fs::rename(&temp, &path).map_err(|e| e.to_string())?;
        }
        Ok(())
    })();
    let _ = std::fs::remove_dir_all(&work);
    result
}

// inference.yml の「character_dict:」の下の「  - 字」の並び。'…' で囲んだもの（'' は '）とそのままのものがある
fn character_dict(yml: &str) -> Result<Vec<u8>, String> {
    let mut lines = yml
        .lines()
        .skip_while(|line| line.trim() != "character_dict:");
    lines.next().ok_or("character_dict がありません")?;
    let mut text = String::new();
    for line in lines {
        let Some(value) = line.strip_prefix("  - ") else {
            break;
        };
        let value = match value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')) {
            Some(quoted) => quoted.replace("''", "'"),
            None => value.to_string(),
        };
        text.push_str(&value);
        text.push('\n');
    }
    Ok(text.into_bytes())
}

fn run(command: &mut Command) -> Result<(), String> {
    let output = command.output().map_err(|e| format!("{command:?}: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "{command:?}: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

fn sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn sha256_file(path: &Path) -> Option<String> {
    std::fs::read(path).ok().map(|bytes| sha256(&bytes))
}
