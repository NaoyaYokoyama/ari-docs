;; ari-docs のインストーラーの追加処理（tauri.conf.json の bundle.windows.nsis.installerHooks）
;; 使い方（個人用 / 共有サーバーに接続）を選ぶページを出し、インストール後に exe のフォルダの config.toml を書く。
;; 共有サーバーを選んだときは、次へ進む前に接続できるかを確かめる（AriCheckServer）
;; - Tauri のテンプレートはこのファイルをページの定義より前に読み込むため、このページは最初に出る
;; - config.toml が既にある（上書きインストール）・サイレントインストールのときはページを出さず、config.toml も書かない
;;   （サイレントのときはアプリの初回起動の画面で選ぶ）
;; - config.toml は Rust の toml で読むため UTF-8 で読める ASCII だけを書く（形式は src/lib.rs の DesktopConfig）

!include nsDialogs.nsh
!include LogicLib.nsh

Var AriMode
Var AriServerUrl
Var AriRadioLocal
Var AriRadioServer
Var AriUrlText

Page custom AriModePageCreate AriModePageLeave

Function AriModePageCreate
  StrCpy $AriMode ""
  ${If} ${Silent}
  ${OrIf} ${FileExists} "$INSTDIR\config.toml"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "ari-docs の使い方を選んでください。あとからアプリの設定画面でも変えられます。"
  Pop $0

  ${NSD_CreateRadioButton} 0 30u 100% 12u "個人用（この PC だけで使う。ログインは不要）"
  Pop $AriRadioLocal
  ${NSD_CreateLabel} 12u 43u 95% 12u "ファイル・Note・Wiki はインストール先のフォルダに保存します。"
  Pop $0

  ${NSD_CreateRadioButton} 0 62u 100% 12u "共有サーバーに接続する（ユーザー ID とパスワードでログイン）"
  Pop $AriRadioServer
  ${NSD_CreateLabel} 12u 77u 95% 12u "サーバーの URL（例: http://ari-server:8080）"
  Pop $0
  ${NSD_CreateText} 12u 90u 80% 12u "http://"
  Pop $AriUrlText

  ${NSD_Check} $AriRadioLocal
  nsDialogs::Show
FunctionEnd

Function AriModePageLeave
  ${NSD_GetState} $AriRadioServer $0
  ${If} $0 == ${BST_CHECKED}
    ${NSD_GetText} $AriUrlText $AriServerUrl
    StrCpy $1 $AriServerUrl 7
    StrCpy $2 $AriServerUrl 8
    ${If} $1 != "http://"
    ${AndIf} $2 != "https://"
      MessageBox MB_ICONEXCLAMATION "サーバーの URL は http:// か https:// で始めてください。"
      Abort
    ${EndIf}
    ${If} $AriServerUrl == "http://"
    ${OrIf} $AriServerUrl == "https://"
      MessageBox MB_ICONEXCLAMATION "サーバーの URL を入力してください。"
      Abort
    ${EndIf}
    ; 終わりの / を除く（アプリの設定画面と同じ形で保存する）
    ${Do}
      StrCpy $1 $AriServerUrl 1 -1
      ${If} $1 != "/"
        ${ExitDo}
      ${EndIf}
      StrCpy $AriServerUrl $AriServerUrl -1
    ${Loop}
    Call AriCheckServer
    StrCpy $AriMode "server"
  ${Else}
    StrCpy $AriMode "local"
  ${EndIf}
FunctionEnd

;; 共有サーバーに接続できるかを確かめる（FN0002-BR18）。<URL>/api/server-info が ari-docs の共有モードと答えれば OK。
;; Windows に入っている PowerShell で問い合わせる（インストーラーに部品を足さないため）。
;; URL は環境変数で渡す（入力した文字をコマンドに埋め込まないため）。確かめられなければ、進むか（あとで設定画面で直せる）を聞く
Function AriCheckServer
  System::Call 'Kernel32::SetEnvironmentVariable(t "ARI_SERVER_URL", t "$AriServerUrl")'
  ; NSIS の文字列は ` で囲む（中で " と ' を使うため）。$$ は PowerShell の $
  nsExec::ExecToStack `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $$r = Invoke-RestMethod -Uri ($$env:ARI_SERVER_URL + '/api/server-info') -TimeoutSec 5 -UseBasicParsing; if ($$r.app -ne 'ari-docs') { exit 2 }; if ($$r.mode -ne 'shared') { exit 3 }; exit 0 } catch { exit 1 }"`
  Pop $0
  Pop $1
  ${If} $0 == 0
    Return
  ${ElseIf} $0 == 2
    StrCpy $2 "この URL は ari-docs のサーバーではありません。"
  ${ElseIf} $0 == 3
    StrCpy $2 "このサーバーは共有モードで動いていません。"
  ${ElseIf} $0 == 1
    StrCpy $2 "サーバーに接続できません。URL と、サーバーが動いているか（HTTPS なら証明書）を確認してください。"
  ${Else}
    StrCpy $2 "接続を確かめられませんでした（PowerShell を使えません）。"
  ${EndIf}
  MessageBox MB_YESNO|MB_ICONEXCLAMATION "$2$\r$\n$\r$\nこのまま進めますか？（サーバーの用意がまだのときなど。あとからアプリの設定画面で変えられます）$\r$\n「いいえ」で URL を直せます。" IDYES ari_check_continue
  Abort
  ari_check_continue:
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  ${If} $AriMode != ""
  ${AndIfNot} ${FileExists} "$INSTDIR\config.toml"
    FileOpen $0 "$INSTDIR\config.toml" w
    FileWrite $0 'mode = "$AriMode"$\r$\n'
    FileWrite $0 'workspace = "."$\r$\n'
    ${If} $AriMode == "server"
      FileWrite $0 'server_url = "$AriServerUrl"$\r$\n'
    ${EndIf}
    FileClose $0
  ${EndIf}
!macroend
