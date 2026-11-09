// Vim モードのスクロール（FN0702-BR04）。どこをスクロールするかは Vimium と同じ考え方で決める:
// 1. フォーカスしているところ、2. 最後にクリックしたところ、3. 画面で一番大きくスクロールできるところ
type Axis = "x" | "y";

let lastClicked: Element | null = null;

// 最後にクリックしたところを覚える（VimLayer が登録する）
export function rememberClick(event: MouseEvent) {
  lastClicked = event.target instanceof Element ? event.target : null;
}

function canScroll(element: Element, axis: Axis) {
  const style = getComputedStyle(element);
  const overflow = axis === "y" ? style.overflowY : style.overflowX;
  const size = axis === "y" ? element.scrollHeight - element.clientHeight : element.scrollWidth - element.clientWidth;
  return size > 1 && (overflow === "auto" || overflow === "scroll" || element === document.scrollingElement);
}

function isVisible(element: Element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
}

function scrollableAncestor(start: Element | null, axis: Axis) {
  for (let element = start; element; element = element.parentElement) {
    if (canScroll(element, axis)) {
      return element;
    }
  }
  return null;
}

// 画面に見えている中で一番大きくスクロールできるところ（ダイアログが開いていればその中）
function largestScrollable(axis: Axis, within?: Element) {
  const root = within ?? document.querySelector('[role="dialog"]') ?? document.body;
  let best: Element | null = null;
  let bestArea = 0;
  for (const element of root.querySelectorAll("*")) {
    if (!canScroll(element, axis) || !isVisible(element)) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = element;
      bestArea = area;
    }
  }
  return best;
}

export function scrollTarget(axis: Axis) {
  const active = document.activeElement;
  // フォーカスしている領域（<C-h>・<C-l> で移ったサイドバー・メインなど）の中も探す
  const fromFocus =
    active && active !== document.body
      ? (scrollableAncestor(active, axis) ?? largestScrollable(axis, active))
      : null;
  if (fromFocus) {
    return fromFocus;
  }
  if (lastClicked?.isConnected && !document.querySelector('[role="dialog"]')) {
    const fromClick = scrollableAncestor(lastClicked, axis);
    if (fromClick && isVisible(fromClick)) {
      return fromClick;
    }
  }
  return largestScrollable(axis) ?? document.scrollingElement;
}

function behavior(repeat: boolean): ScrollBehavior {
  // 押しっぱなしは止まらず動くように、動きを減らす設定のときは動きなしで
  return repeat || document.documentElement.classList.contains("reduce-motion") ? "auto" : "smooth";
}

// 文字の大きさの設定に合わせて動く量を変える（標準 16px のときに step）
function scale() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
}

export function scrollStep(axis: Axis, step: number, count: number, repeat: boolean) {
  const target = scrollTarget(axis);
  const amount = step * scale() * count;
  target?.scrollBy({
    left: axis === "x" ? amount : 0,
    top: axis === "y" ? amount : 0,
    behavior: behavior(repeat),
  });
}

export function scrollHalfPage(direction: 1 | -1, count: number, repeat: boolean) {
  const target = scrollTarget("y");
  if (target) {
    target.scrollBy({ top: (direction * target.clientHeight * count) / 2, behavior: behavior(repeat) });
  }
}

export function scrollToEdge(edge: "top" | "bottom") {
  const target = scrollTarget("y");
  if (target) {
    target.scrollTo({ top: edge === "top" ? 0 : target.scrollHeight, behavior: behavior(false) });
  }
}
