import { PropsWithChildren, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { SHORTCUT } from "./shortcut";

function isShortcut(
  e: KeyboardEvent,
  shortcut: Shortcut,
) {
  return (
    e.altKey === !!shortcut.alt &&
    e.ctrlKey === !!shortcut.ctrl &&
    e.shiftKey === !!shortcut.shift &&
    e.key === shortcut.key
  );
}

export default function ShortcutProvider({
  children,
}: PropsWithChildren) {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcut(e, SHORTCUT.TO_HOME)) {
        e.preventDefault();
        navigate("/", {
          state: {
            focus: "search",
          },
        });
        return;
      }
      if (isShortcut(e, SHORTCUT.TO_FOLDER)) {
        e.preventDefault();
        navigate("/folder");
        return;
      }
      if (isShortcut(e, SHORTCUT.TO_NOTE)) {
        e.preventDefault();
        navigate("/note");
        return;
      }
      if (isShortcut(e, SHORTCUT.TO_WIKI)) {
        e.preventDefault();
        navigate("/wiki");
        return;
      }
      if (isShortcut(e, SHORTCUT.TO_SETTING)) {
        e.preventDefault();
        navigate("/setting");
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigate]);

  return <>{children}</>;
}
