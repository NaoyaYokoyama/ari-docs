export interface SearchItem {
  viewType: string;
  name: string;
  nodeId: string;
  noteId: string;
  wikiId: string;
}

export interface SearchResponse {
  searchItems: SearchItem[];
}
