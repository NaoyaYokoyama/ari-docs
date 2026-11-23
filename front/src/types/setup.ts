// デスクトップアプリ（desktop/src-tauri/src/lib.rs）の起動の状態
export interface SetupStatus {
  // 自分の PC の作業フォルダの準備ができ、バックエンドが動いている
  configured: boolean;
  // 初回起動（設定ファイルが無い）
  firstRun: boolean;
  // 作業フォルダの絶対パス（デバッグビルドでは空文字）
  workspace: string;
  // 作業フォルダが見つからないなど、表示するエラー（無ければ空文字）
  error: string;
  // 作業フォルダを変えられる。デバッグビルドと、exe のフォルダに書き込めないときは false
  canChangeWorkspace: boolean;
  // 場所（自分の PC と共有サーバー。FN0002-BR20）
  places: PlacesConfig;
  // 場所を変えられる
  canChangePlaces: boolean;
  // この PC の公開（FN0005）
  host: HostStatus;
  // 自分の PC のバックエンドの待ち受けポート（ふつうは 8080。ほかのアプリが使っていれば 8081〜8099。FN0002-BR22）
  apiPort: number;
}

// この PC を共有サーバーとして公開しているか（FN0005）
export interface HostStatus {
  // 共有サーバーとして使っている（ログインあり）
  shared: boolean;
  // ほかの PC からつなげる
  published: boolean;
  port: number;
  // ほかの PC に伝える URL（PC の名前と IP アドレス）
  urls: string[];
}

// 場所の色（global.css の --place-*）。空は既定の色
export type PlaceColor = "" | "gray" | "blue" | "green" | "amber" | "red" | "violet";

export interface ServerPlace {
  name: string;
  // 例: http://ari-server:8080（末尾の / を付けない）
  url: string;
  color: PlaceColor;
}

export interface PlacesConfig {
  // 自分の PC の名前（空なら「自分の PC」）と色
  localName: string;
  localColor: PlaceColor;
  // 起動したときの場所。last（前回の場所）/ local（自分の PC）/ 共有サーバーの URL
  startPlace: string;
  // 5 つまで
  servers: ServerPlace[];
}

export interface WorkspaceInfo {
  // 既に ari-docs のデータ（.ari-docs/）がある
  hasAriDocs: boolean;
}
