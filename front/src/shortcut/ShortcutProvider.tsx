import {
  createContext,
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";

import {
  SHORTCUT,
  type Shortcut,
} from "./shortcut";

export type FocusDirection =
  | "left"
  | "down"
  | "up"
  | "right";

type FocusHandler = (
  direction: FocusDirection,
) => void;

type ShortcutContextType = {
  setFocusHandler: (
    handler: FocusHandler | null,
  ) => void;
};

export const ShortcutContext =
  createContext<ShortcutContextType | null>(
    null,
  );

function isShortcut(
  e: KeyboardEvent,
  shortcut: Shortcut,
) {
  return (
    e.altKey === !!shortcut.alt &&
    e.ctrlKey === !!shortcut.ctrl &&
    e.shiftKey === !!shortcut.shift &&
    e.key.toLowerCase() ===
      shortcut.key.toLowerCase()
  );
}

export default function ShortcutProvider({
  children,
}: PropsWithChildren) {
  const navigate = useNavigate();

  const focusHandlerRef =
    useRef<FocusHandler | null>(null);

  const setFocusHandler = useCallback(
    (handler: FocusHandler | null) => {
      focusHandlerRef.current = handler;
    },
    [],
  );

  useEffect(() => {
    const handleKeyDown = (
      e: KeyboardEvent,
    ) => {
      // 画面移動
      if (isShortcut(e, SHORTCUT.TO_HOME)) {
        e.preventDefault();

        navigate("/", {
          state: {
            focus: "search",
          },
        });

        return;
      }

      if (
        isShortcut(e, SHORTCUT.TO_FOLDER)
      ) {
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

      if (
        isShortcut(e, SHORTCUT.TO_SETTING)
      ) {
        e.preventDefault();
        navigate("/setting");
        return;
      }

      // フォーカス移動
      if (
        isShortcut(
          e,
          SHORTCUT.FOCUS_LEFT,
        )
      ) {
        e.preventDefault();
        focusHandlerRef.current?.("left");
        return;
      }

      if (
        isShortcut(
          e,
          SHORTCUT.FOCUS_DOWN,
        )
      ) {
        e.preventDefault();
        focusHandlerRef.current?.("down");
        return;
      }

      if (
        isShortcut(
          e,
          SHORTCUT.FOCUS_UP,
        )
      ) {
        e.preventDefault();
        focusHandlerRef.current?.("up");
        return;
      }

      if (
        isShortcut(
          e,
          SHORTCUT.FOCUS_RIGHT,
        )
      ) {
        e.preventDefault();
        focusHandlerRef.current?.("right");
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [navigate]);

  return (
    <ShortcutContext.Provider
      value={{
        setFocusHandler,
      }}
    >
      {children}
    </ShortcutContext.Provider>
  );
}
