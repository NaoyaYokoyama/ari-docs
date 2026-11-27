// 画面の拡大・縮小のキー（FN0701-BR17）。ブラウザと同じ決まったキーで、設定では変えない。
// 拡大は Ctrl++（日本語のキーボードは Shift なしの「;」のキー）・Ctrl+=・テンキーの +、縮小は Ctrl+-、Ctrl+0 で 100% に戻す
export function zoomDirection(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "key" | "code">): 1 | -1 | 0 | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return null;
  }
  if (["+", "=", ";"].includes(event.key) || event.code === "NumpadAdd") {
    return 1;
  }
  if (event.key === "-" || event.code === "NumpadSubtract") {
    return -1;
  }
  if (event.key === "0" || event.code === "Numpad0") {
    return 0;
  }
  return null;
}
