export interface SearchItem {
  // note / wiki / node
  viewType: string;
  // Note・Wiki はタイトル、ノードは folder/ からの相対パス
  name: string;
  nodeId: string;
  noteId: string;
  wikiId: string;
  // ノードの種類（folder / file）。Note・Wiki は空文字
  nodeType: string;
  // ノードの一致した場所。name（ファイル名・パス）/ content（ファイルの中身）。Note・Wiki は空文字
  matchType: string;
}

export interface SearchResponse {
  searchItems: SearchItem[];
}
