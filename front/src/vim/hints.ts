// Vim モードのヒント（Vimium の f。FN0702-BR05）。押せるところに文字を出し、打った文字のところを押す

const CLICKABLE = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[contenteditable='true']",
  "[role='button']",
  "[role='tab']",
  "[role='option']",
  "[role='radio']",
  "[role='checkbox']",
  "[role='switch']",
  "[role='menuitem']",
  "[role='treeitem']",
  "[role='link']",
  // Folder の一覧の行（クリックで選び、ダブルクリックで開く）
  "tr[data-path]",
  "[data-vim-hint]",
].join(",");

export type HintTarget = { element: HTMLElement; label: string; x: number; y: number };

function isDisabled(element: HTMLElement) {
  return (
    element.matches(":disabled") ||
    element.getAttribute("aria-disabled") === "true" ||
    element.closest("[inert], [aria-hidden='true']") !== null
  );
}

// 見えていて、ほかのもの（ダイアログの影など）に隠れていないか
function isReachable(element: HTMLElement, rect: DOMRect) {
  if (rect.width < 2 || rect.height < 2) {
    return false;
  }
  if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) {
    return false;
  }
  const style = getComputedStyle(element);
  if (style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  // 見えている部分の真ん中に、そのもの（か中身）があるか
  const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
  const y = Math.min(Math.max(rect.top + Math.min(rect.height / 2, 12), 0), window.innerHeight - 1);
  const top = document.elementFromPoint(x, y);
  return !!top && (element === top || element.contains(top) || top.contains(element));
}

// labels: 文字の組み合わせを同じ長さで作る（どれもほかの先頭にならないので、打ち切った時点で決まる）
export function makeLabels(count: number, chars: string) {
  const letters = [...chars];
  let length = 1;
  while (letters.length ** length < count) {
    length += 1;
  }
  const labels: string[] = [];
  for (let index = 0; labels.length < count; index++) {
    let label = "";
    let rest = index;
    for (let position = 0; position < length; position++) {
      label = letters[rest % letters.length] + label;
      rest = Math.floor(rest / letters.length);
    }
    labels.push(label);
  }
  return labels;
}

export function collectHints(chars: string): HintTarget[] {
  const found: { element: HTMLElement; rect: DOMRect }[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(CLICKABLE)) {
    if (isDisabled(element) || element.closest("[data-vim-nohint]")) {
      continue;
    }
    // 押せるものの中の押せるもの（行の中のボタンなど）は両方出す。同じ場所に重なるものは外側だけ
    const rect = element.getBoundingClientRect();
    if (!isReachable(element, rect)) {
      continue;
    }
    if (found.some((other) => other.element.contains(element) && sameBox(other.rect, rect))) {
      continue;
    }
    found.push({ element, rect });
    if (found.length >= 500) {
      break;
    }
  }
  // 上から下、左から右の順に文字を振る
  found.sort((a, b) => Math.round(a.rect.top - b.rect.top) || a.rect.left - b.rect.left);
  const labels = makeLabels(found.length, chars);
  return found.map(({ element, rect }, index) => ({
    element,
    label: labels[index],
    x: Math.max(rect.left, 0),
    y: Math.max(rect.top, 0),
  }));
}

function sameBox(a: DOMRect, b: DOMRect) {
  return Math.abs(a.left - b.left) < 2 && Math.abs(a.top - b.top) < 2 && Math.abs(a.width - b.width) < 2;
}

// 選んだところを押す。open のときはダブルクリック（ファイルを開く・フォルダに入る）
export function activateHint(element: HTMLElement, open: boolean) {
  const textInput =
    element.isContentEditable ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLInputElement &&
      !["button", "submit", "reset", "checkbox", "radio", "file", "image", "range", "color"].includes(element.type));
  if (textInput) {
    element.focus();
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.select();
    }
    return;
  }
  const rect = element.getBoundingClientRect();
  const init = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: rect.left + Math.min(rect.width / 2, 24),
    clientY: rect.top + rect.height / 2,
  };
  // React の onClick と、Folder の一覧のクリックの回数（detail）の両方に届くよう、マウスの出来事を順に送る
  element.dispatchEvent(new MouseEvent("mousedown", { ...init, detail: 1 }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...init, detail: 1 }));
  element.dispatchEvent(new MouseEvent("click", { ...init, detail: 1 }));
  if (open) {
    element.dispatchEvent(new MouseEvent("mousedown", { ...init, detail: 2 }));
    element.dispatchEvent(new MouseEvent("mouseup", { ...init, detail: 2 }));
    element.dispatchEvent(new MouseEvent("click", { ...init, detail: 2 }));
    element.dispatchEvent(new MouseEvent("dblclick", { ...init, detail: 2 }));
  }
  if (element.tabIndex >= 0 && element !== document.activeElement && !open) {
    element.focus({ preventScroll: true });
  }
}
