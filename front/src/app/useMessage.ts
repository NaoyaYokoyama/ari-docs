import { useCallback, useEffect, useState } from "react";

export function useMessage(
  loading: boolean,
  user: unknown,
) {
  const [text, setText] = useState("");
  const [type, setType] =
    useState<"info" | "error">("info");
  // 同じ文言を続けて出したときも表示し直すための番号
  const [id, setId] = useState(0);

  const showMessage = useCallback(
    (
      type: "info" | "error",
      text: string,
    ) => {
      setType(type);
      setText(text);
      setId((current) => current + 1);
    },
    [],
  );

  const closeMessage = useCallback(() => {
    setText("");
  }, []);

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
  }, [loading, user, showMessage]);

  return {
    text,
    type,
    id,
    showMessage,
    closeMessage,
  };
}
