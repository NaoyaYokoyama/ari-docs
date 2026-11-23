export interface DictionaryWord {
  word: string;
  // 登録したユーザーの表示名
  createdBy: string;
  // 登録日時（UTC の "YYYY-MM-DD HH:MM:SS"）
  createdAt: string;
}

export interface DictionaryResponse {
  words: DictionaryWord[];
  // 登録・削除できる（ローカルモード、または共有モードの管理者）
  canEdit: boolean;
}

export interface IndexStatus {
  // 今の辞書で取り込み済みのファイル数
  indexed: number;
  // 辞書が変わり、取り込み直しを待っているファイル数
  outdated: number;
  failed: number;
  tooLarge: number;
  // 登録した単語の種類の数
  keywords: number;
  lastRun: {
    processed: number;
    pending: number;
    finishedAt: string;
  } | null;
  // 文字認識している途中のファイル（folder/ からのパス）と進み具合。していなければ null
  ocrProgress: { path: string; done: number; total: number; unit: string } | null;
}

// 中身で検索できるファイルの形式（FN0202-BR02）
export interface FormatsResponse {
  groups: { name: string; extensions: string[] }[];
  // これを超えるファイルは取り込まない
  maxFileBytes: number;
  // 取り出した文字のうち使う文字数
  maxChars: number;
  // 文字認識を使えるか（モデルがあるか）。使えるときは message がモデルの名前、使えないときは理由
  ocr: { available: boolean; message: string };
  // 文字認識する画像ファイルの拡張子
  ocrImageExtensions: string[];
}

// 検索の対象外（FN0202-BR16・BR17）。path: Folder の一番上からのパス（そのフォルダ・ファイルと中のもの）。
// name: 名前の型（* と ? を使える。どこにあっても）
export type ExclusionKind = "path" | "name";

export interface Exclusion {
  exclusionId: string;
  kind: ExclusionKind;
  value: string;
  // 登録したユーザーの表示名
  createdBy: string;
  createdAt: string;
}

export interface ExclusionsResponse {
  // 全員の対象外（中身の取り込みもしない）
  all: Exclusion[];
  // 本人だけの対象外
  mine: Exclusion[];
  // 全員の対象外を変えられる（ローカルモード、または共有モードの管理者）
  canEditAll: boolean;
  // 本人だけの対象外を使う（共有モード）
  personal: boolean;
}
