// デスクトップアプリ（desktop/src-tauri/src/lib.rs）の起動の状態
export interface SetupStatus {
  // 作業フォルダの準備ができ、バックエンドが動いている
  configured: boolean;
  // 作業フォルダの絶対パス（デバッグビルドでは空文字）
  workspace: string;
  // 作業フォルダが見つからないなど、表示するエラー（無ければ空文字）
  error: string;
  // 作業フォルダを変えられる。デバッグビルドと、exe のフォルダに書き込めないときは false
  canChangeWorkspace: boolean;
  // 使い方。local（個人用）/ server（共有サーバーに接続）。まだ選んでいなければ空文字
  mode: string;
  // 共有サーバーの URL（mode が server のとき）
  serverUrl: string;
  // 使い方を変えられる。デバッグビルドでは false
  canChangeMode: boolean;
}

export interface WorkspaceInfo {
  // 既に ari-docs のデータ（.ari-docs/）がある
  hasAriDocs: boolean;
}
