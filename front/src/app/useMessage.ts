import { useEffect, useState } from "react";

export function useMessage(
  loading: boolean,
  user: unknown,
) {
  const [text, setText] = useState("");
  const [type, setType] =
    useState<"info" | "error">("info");

  const showMessage = (
    type: "info" | "error",
    text: string,
  ) => {
    setType(type);
    setText(text);
  };

  const closeMessage = () => {
    setText("");
  };

  useEffect(() => {
    if (loading) {
      return;
    }

    const storedMessage =
      sessionStorage.getItem("message");

    if (storedMessage) {
      sessionStorage.removeItem("message");

      showMessage(
        "info",
        storedMessage,
      );
    }
  }, [loading, user]);

  return {
    text,
    type,
    showMessage,
    closeMessage,
  };
}
