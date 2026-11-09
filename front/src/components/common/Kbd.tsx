import type { ReactNode } from "react";

// キーボードのキーの表示（例: <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd>）
export default function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[0.6875rem] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}
