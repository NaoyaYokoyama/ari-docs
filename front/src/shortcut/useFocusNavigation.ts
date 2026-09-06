import {
  useContext,
  useEffect,
  useRef,
} from "react";

import {
  ShortcutContext,
  type FocusDirection,
} from "./ShortcutProvider";

type FocusNavigation = Partial<
  Record<FocusDirection, () => void>
>;

export function useFocusNavigation(
  navigation: FocusNavigation,
) {
  const context =
    useContext(ShortcutContext);

  if (!context) {
    throw new Error(
      "useFocusNavigation must be used within ShortcutProvider",
    );
  }

  const navigationRef =
    useRef(navigation);

  navigationRef.current = navigation;

  useEffect(() => {
    context.setFocusHandler(
      (direction) => {
        navigationRef.current[
          direction
        ]?.();
      },
    );

    return () => {
      context.setFocusHandler(null);
    };
  }, [context.setFocusHandler]);
}
