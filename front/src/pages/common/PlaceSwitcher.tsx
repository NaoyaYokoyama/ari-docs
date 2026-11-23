import { Check, ChevronDown, Laptop, Server, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { useApp } from "@/app/AppContext";
import { useDesktop } from "@/app/DesktopContext";
import { switchPlace } from "@/app/places";
import { useGuardedNavigate } from "@/app/useGuardedNavigate";
import Kbd from "@/components/common/Kbd";
import PlaceMark from "@/components/common/PlaceMark";
import { hasOpenedFiles } from "@/lib/editSync";
import { isShortcut, SHORTCUT, shortcutLabel } from "@/shortcut/shortcut";

// ヘッダーの今の場所（自分の PC・共有サーバー。FN0002-BR20）。押すか Alt+0 で一覧を開き、選ぶと切り替える。
// 一覧では ↑↓（j・k）で選んで Enter、数字で直接選ぶ、Esc で閉じる。デスクトップアプリで、共有サーバーを登録したときだけ出す
export default function PlaceSwitcher() {
  const desktop = useDesktop();
  const enabled = !!desktop && desktop.places.length > 1;
  const { isDirty, showConfirm } = useApp();
  const navigate = useGuardedNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Alt+0 は入力中でも効かせる（Alt+数字の画面移動と同じ）
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (isShortcut(event, SHORTCUT.PLACE_SWITCH) && !event.isComposing) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [enabled]);

  // 開いたら今の場所にフォーカスする。外側のクリックで閉じる
  useEffect(() => {
    if (!open) {
      return;
    }
    listRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close, true);
    return () => window.removeEventListener("mousedown", close, true);
  }, [open]);

  if (!desktop || !enabled) {
    return null;
  }
  const { place, places } = desktop;

  // 画面を読み込み直すので、未保存の変更があれば確かめる（FN0001-BR05）
  const select = async (id: string) => {
    setOpen(false);
    if (id === place.id) {
      return;
    }
    if (isDirty && !(await showConfirm("未保存の変更があります。破棄して場所を切り替えますか？"))) {
      return;
    }
    // 共有サーバーから開いたファイル（FN0301-BR28）は、切り替えたあとに保存してもサーバーに戻らない
    if (
      hasOpenedFiles() &&
      !(await showConfirm(
        "共有サーバーから開いたファイルがあります。切り替えると、このあとそのファイルを保存してもサーバーに戻りません。切り替えますか？",
      ))
    ) {
      return;
    }
    switchPlace(id);
  };

  const handleListKey = (event: React.KeyboardEvent) => {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (["ArrowDown", "ArrowUp", "j", "k"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === "ArrowDown" || event.key === "j" ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
      return;
    }
    const number = Number(event.key);
    if (Number.isInteger(number) && number >= 1 && number <= places.length) {
      event.preventDefault();
      event.stopPropagation();
      void select(places[number - 1].id);
    }
  };

  return (
    <div ref={rootRef} className="relative mr-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={`場所: ${place.name}${place.url ? `（${place.url}）` : ""}。切り替える（${shortcutLabel(SHORTCUT.PLACE_SWITCH)}）`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 max-w-48 items-center gap-2 rounded-md border border-input px-2.5 text-sm transition-colors hover:bg-accent"
      >
        <PlaceMark color={place.color} />
        <span className="truncate font-medium">{place.name}</span>
        <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-label="場所を切り替える"
          onKeyDown={handleListKey}
          className="absolute top-full left-0 z-50 mt-1 min-w-72 rounded-lg border border-border bg-card py-1 text-sm text-card-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
        >
          <p className="px-3 pt-1 pb-1.5 text-xs text-muted-foreground">
            場所を切り替える（データ・ログインは場所ごとに別）
          </p>
          {places.map((item, index) => {
            const Icon = item.local ? Laptop : Server;
            const current = item.id === place.id;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                onClick={() => void select(item.id)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
              >
                <PlaceMark color={item.color} />
                <Icon size={15} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className={twMerge("block truncate", current && "font-medium")}>{item.name}</span>
                  {item.url && (
                    <span className="block truncate font-mono text-xs text-muted-foreground">{item.url}</span>
                  )}
                </span>
                {current && <Check size={15} className="shrink-0 text-brand" />}
                <Kbd>{index + 1}</Kbd>
              </button>
            );
          })}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void navigate("/setting?section=places");
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent"
          >
            <Settings2 size={15} className="ml-5 shrink-0" />
            場所の設定（共有サーバーの追加・名前・色・起動したときの場所）
          </button>
        </div>
      )}
    </div>
  );
}
