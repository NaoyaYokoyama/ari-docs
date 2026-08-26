import { useEffect } from "react";

type Props = {
  currentPath: string;
  onNavigate: (path: string) => void;
};

export function useNodeShortcuts({
  currentPath,
  onNavigate,
}: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 一つ上のフォルダ
      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();

        const items = currentPath
          .split("/")
          .filter(Boolean);

        const parentPath = items
          .slice(0, -1)
          .join("/");

        onNavigate(parentPath);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentPath, onNavigate]);
}
