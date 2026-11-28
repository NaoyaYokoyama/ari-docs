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

// Ctrl+ホイールで 1 段を動かす量。マウスのホイールは 1 目盛りで 1 段、タッチパッドの 2 本指の広げ・つまみ（細かく届く）は
// たまってから 1 段にする。続けて回したときに飛び過ぎないよう、1 段ごとに少し間を空ける
export const WHEEL_STEP = 50;
export const WHEEL_INTERVAL_MS = 80;

// ホイールの向き（上へ回す・広げると拡大）。Ctrl（Mac は Command）を押していなければ null
export function wheelZoomDirection(event: Pick<WheelEvent, "ctrlKey" | "metaKey" | "altKey" | "deltaY" | "deltaMode">, pending: number) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return null;
  }
  // deltaMode 1 は行、2 はページで届く（マウスによる）。画素にそろえる
  const delta = event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1);
  const total = pending + delta;
  if (Math.abs(total) < WHEEL_STEP) {
    return { direction: 0 as const, pending: total };
  }
  return { direction: total < 0 ? (1 as const) : (-1 as const), pending: 0 };
}
