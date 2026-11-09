import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { usePreferences } from "@/app/preferences";

// ボタンの一言の説明（FN0701-BR11 の「ボタンの説明を出す」）。マウスを乗せたとき（少し待って）と、
// キーで選んだとき（Tab など。クリックでは出さない）に、ボタンの下に名前と説明を出す。
// 設定で消したときは何もしない（ボタンの title で名前だけ出る）
type Props = {
  // 名前（ショートカットがあれば添える）
  title: string;
  text: string;
  children: ReactNode;
};

const SHOW_DELAY_MS = 400;
const MARGIN = 8;

export function useHintsEnabled() {
  return usePreferences().buttonHints;
}

export default function Hint({ title, text, children }: Props) {
  const enabled = useHintsEnabled();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  // 画面の端からはみ出さないように、出したあとで横の位置を寄せる
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip || !position) {
      return;
    }
    const width = tip.offsetWidth;
    const left = Math.min(Math.max(MARGIN, position.x - width / 2), window.innerWidth - width - MARGIN);
    tip.style.left = `${left}px`;
    tip.style.visibility = "visible";
  }, [position]);

  if (!enabled) {
    return <>{children}</>;
  }

  const show = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (rect) {
        setPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
      }
    }, delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPosition(null);
  };

  return (
    <span
      ref={anchorRef}
      className="inline-flex"
      onMouseEnter={() => show(SHOW_DELAY_MS)}
      onMouseLeave={hide}
      onMouseDown={hide}
      onFocus={(event) => {
        if (event.target instanceof HTMLElement && event.target.matches(":focus-visible")) {
          show(0);
        }
      }}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === "Escape" && position) {
          hide();
        }
      }}
    >
      {children}
      {position &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            // 幅を測ってから横の位置を決めるので、それまでは左端に隠して置く（右端のボタンで幅が縮まないように）
            style={{ left: 0, top: position.y, visibility: "hidden" }}
            className="pointer-events-none fixed z-[1100] w-max max-w-72 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
          >
            <p className="font-medium">{title}</p>
            <p className="mt-0.5 text-muted-foreground">{text}</p>
          </div>,
          document.body,
        )}
    </span>
  );
}
