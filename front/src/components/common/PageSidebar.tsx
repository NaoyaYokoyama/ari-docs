import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

type Props = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  // 見出し（左）と、見出しの右に置くボタン
  title?: ReactNode;
  actions?: ReactNode;
  // 見出しの下に置く検索欄など（スクロールしない）
  toolbar?: ReactNode;
  children: ReactNode;
};

// 各画面の左側の一覧（Folder のツリー、Note・Wiki の一覧、お気に入り、設定のメニュー）
const PageSidebar = forwardRef<HTMLElement, Props>(function PageSidebar(
  { title, actions, toolbar, children, className, ...props },
  ref,
) {
  return (
    <aside
      ref={ref}
      // Vim モードの領域の移動（<C-h>）で移る先（FN0702）
      data-vim-pane="sidebar"
      {...props}
      className={twMerge(
        "flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground outline-none",
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex h-12 shrink-0 items-center gap-2 px-4">
          <div className="min-w-0 flex-1 truncate text-sm font-semibold">
            {title}
          </div>
          {actions}
        </div>
      )}
      {toolbar && <div className="shrink-0 px-3 pb-2">{toolbar}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">{children}</div>
    </aside>
  );
});

export default PageSidebar;
