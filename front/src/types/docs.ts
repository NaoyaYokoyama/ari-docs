export interface DocEntry {
  path: string;
  name: string;
  hasFrontMatter: boolean;
  frontMatter: Record<string, string>;
}

export interface DocsIndexResponse {
  root: string;
  // 設定の初期フォルダが使えなかったときの説明（無ければ空文字）
  notice: string;
  docs: DocEntry[];
}

export interface DocFileResponse {
  path: string;
  content: string;
}
