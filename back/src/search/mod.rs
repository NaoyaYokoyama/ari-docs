//! ファイルの中身の検索（FN0202）。ファイルから文字を取り出し（extract）、単語に区切って（tokenizer）、
//! 単語ごとに DB に登録する（index。取り込みバッチ BAT0302 から呼ぶ）。
//! 名前のあいまい検索（fuzzy。探して開く FN0003）もここに置く
pub mod extract;
pub mod fuzzy;
pub mod index;
pub mod kind;
pub mod ocr;
pub mod pdf_ocr;
pub mod tokenizer;
