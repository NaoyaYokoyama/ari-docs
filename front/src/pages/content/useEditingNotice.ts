import { useEffect, useRef, useState } from "react";

import { reportEditing } from "@/api/wiki";

// 同時編集のお知らせ（FN0501-BR11）。Wiki に未保存の変更がある間だけ、書き始めたときと 5 分ごとにサーバーへ知らせ、
// ほかに書いている人・ほかの人が保存したことを返す。つなぎっぱなしにはしない（重くしないため）。
// 保存した・ほかの Wiki に移った・画面を離れたら「やめた」を知らせる（届かなくてもサーバーは 11 分で忘れる）
const INTERVAL_MS = 5 * 60 * 1000;

export type EditingNotice = {
  // ほかに書いている人の表示名
  editors: string[];
  // 開いたあとにほかの人が保存していれば、その人の表示名
  savedBy: string | null;
};

const NONE: EditingNotice = { editors: [], savedBy: null };

export function useEditingNotice(wikiId: string | null, baseUpdatedAt: string | undefined, dirty: boolean) {
  const [notice, setNotice] = useState<EditingNotice>(NONE);
  const baseRef = useRef(baseUpdatedAt);
  baseRef.current = baseUpdatedAt;

  useEffect(() => {
    setNotice(NONE);
    if (!wikiId || !dirty) {
      return;
    }
    let alive = true;
    const send = () =>
      reportEditing(wikiId, true)
        .then((response) => {
          if (alive) {
            const saved = !!baseRef.current && response.updatedAt !== baseRef.current;
            setNotice({ editors: response.editors, savedBy: saved ? response.updatedBy : null });
          }
        })
        // 知らせられなくても書くことはできる
        .catch(() => undefined);
    void send();
    const timer = window.setInterval(() => void send(), INTERVAL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
      void reportEditing(wikiId, false).catch(() => undefined);
    };
  }, [wikiId, dirty]);

  return notice;
}
