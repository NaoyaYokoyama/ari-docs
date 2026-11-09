import type { VimActionId } from "@/vim/actions";

// Vim モードの領域の移動（FN0702-BR13）。サイドバーは data-vim-pane="sidebar"、メインは <main>（または data-vim-pane="main"）。
// サイドバーの中の行は data-vim-item を付ける。ツリーの行は data-vim-expanded（開いているか）・data-vim-depth（深さ）、
// 開け閉めのボタンが別にあれば、同じ行（data-vim-row）の中の data-vim-toggle
const SIDEBAR = '[data-vim-pane="sidebar"]';
const MAIN = '[data-vim-pane="main"], main';

function visible(element: Element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function visiblePane(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(visible) ?? null;
}

function items(pane: Element) {
  return [...pane.querySelectorAll<HTMLElement>("[data-vim-item]")].filter(visible);
}

// 最後にいた行（領域へ戻ったときにそこへ戻る）
const lastItem = new WeakMap<Element, HTMLElement>();

function focusItem(pane: Element, item: HTMLElement) {
  lastItem.set(pane, item);
  item.focus({ preventScroll: true });
  item.scrollIntoView({ block: "nearest" });
}

export function focusPane(side: "sidebar" | "main") {
  const pane = visiblePane(side === "sidebar" ? SIDEBAR : MAIN);
  if (!pane) {
    return false;
  }
  if (side === "sidebar") {
    const list = items(pane);
    // 前にいた行 → 選んでいる行（強調しているもの）→ 先頭の行
    const remembered = lastItem.get(pane);
    const item =
      (remembered?.isConnected && visible(remembered) ? remembered : null) ??
      list.find((element) => element.matches('[aria-current="page"], [aria-current="true"], [data-vim-selected]')) ??
      list[0];
    if (item) {
      focusItem(pane, item);
      return true;
    }
  }
  if (pane.tabIndex < 0 && !pane.hasAttribute("tabindex")) {
    pane.tabIndex = -1;
  }
  pane.focus({ preventScroll: true });
  return true;
}

// サイドバーにフォーカスしているか（画面の一覧の操作より、サイドバーの行の移動を優先するため）
export function inSidebar() {
  return document.activeElement?.closest(SIDEBAR) != null;
}

function toggleOf(item: HTMLElement) {
  return item.closest("[data-vim-row]")?.querySelector<HTMLElement>("[data-vim-toggle]") ?? item;
}

// サイドバーの行の中を動く。動いたら true（行の無いところでは false にして、スクロールなどに回す）
export function moveInPane(id: VimActionId, count: number) {
  const active = document.activeElement;
  const pane = active?.closest(SIDEBAR);
  if (!pane || !(active instanceof HTMLElement)) {
    return false;
  }
  const list = items(pane);
  if (list.length === 0) {
    return false;
  }
  const index = list.indexOf(active);
  const current = index === -1 ? null : list[index];
  const go = (next: number) => focusItem(pane, list[Math.min(Math.max(next, 0), list.length - 1)]);

  switch (id) {
    case "down":
      go(index === -1 ? 0 : index + count);
      return true;
    case "up":
      go(index === -1 ? list.length - 1 : index - count);
      return true;
    case "halfDown":
      go(index + 10 * count);
      return true;
    case "halfUp":
      go(index - 10 * count);
      return true;
    case "top":
      go(0);
      return true;
    case "bottom":
      go(list.length - 1);
      return true;
    case "right": {
      if (!current) {
        return false;
      }
      // 閉じたフォルダは開く。開いている（開け閉めの無い）行は押す（開く・移る）
      if (current.dataset.vimExpanded === "false") {
        toggleOf(current).click();
      } else if (current.dataset.vimExpanded === "true" && toggleOf(current) === current) {
        go(index + 1);
      } else {
        current.click();
      }
      return true;
    }
    case "left": {
      if (!current) {
        return false;
      }
      // 開いたフォルダは閉じ、それ以外は 1 つ上の階層の行へ
      if (current.dataset.vimExpanded === "true") {
        toggleOf(current).click();
        return true;
      }
      const depth = Number(current.dataset.vimDepth ?? 0);
      for (let other = index - 1; other >= 0; other--) {
        if (Number(list[other].dataset.vimDepth ?? 0) < depth) {
          go(other);
          return true;
        }
      }
      return true;
    }
    default:
      return false;
  }
}
