import { useCallback, useEffect, useRef, useState } from "react";

import { type EditingStatus, reportEditing } from "@/api/wiki";

// 同時編集のお知らせとロック（FN0501-BR11・BR12）。共有サーバーの Wiki で使う。
// - 開いている間: 開いたときと 1 分ごとに、書いている人を確かめる（後から開いた人にもすぐ分かるように）
// - 未保存の変更がある間: 書き始めたときと 2 分ごとに「書いている」と知らせる。ロックの設定なら、先に書いている人がいれば書けない
// - 保存した・変更を捨てた・ほかの Wiki に移った・画面を離れたら「やめた」を知らせる（届かなくてもサーバーは 10 分で忘れる）
// つなぎっぱなしにはしない（重くしないため）
const CHECK_MS = 60 * 1000;
const EDIT_MS = 2 * 60 * 1000;

export type EditingNotice = {
  // ほかに書いている人の表示名
  editors: string[];
  // 開いたあとにほかの人が保存していれば、その人の表示名
  savedBy: string | null;
  // ロックしている人（自分のほか）と書き始めた時刻。ロックの設定でなければ null
  lockedBy: string | null;
  lockedSince: string | null;
};

const NONE: EditingNotice = { editors: [], savedBy: null, lockedBy: null, lockedSince: null };

export function useEditingNotice(wikiId: string | null, baseUpdatedAt: string | undefined, dirty: boolean) {
  const [notice, setNotice] = useState<EditingNotice>(NONE);
  const baseRef = useRef(baseUpdatedAt);
  baseRef.current = baseUpdatedAt;

  const apply = useCallback((response: EditingStatus) => {
    const saved = !!baseRef.current && response.updatedAt !== baseRef.current;
    setNotice({
      editors: response.editors,
      savedBy: saved ? response.updatedBy : null,
      lockedBy: response.lock ? response.lockedBy : null,
      lockedSince: response.lock ? response.lockedSince : null,
    });
  }, []);

  // 開いたら前の Wiki のお知らせを消す
  useEffect(() => {
    setNotice(NONE);
  }, [wikiId]);

  useEffect(() => {
    if (!wikiId) {
      return;
    }
    let alive = true;
    const send = () =>
      reportEditing(wikiId, dirty, { check: !dirty })
        .then((response) => alive && apply(response))
        // 知らせられなくても読み書きはできる（ロックはサーバーが保存のときに確かめる）
        .catch(() => undefined);
    void send();
    const timer = window.setInterval(() => void send(), dirty ? EDIT_MS : CHECK_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
      if (dirty) {
        void reportEditing(wikiId, false).catch(() => undefined);
      }
    };
  }, [wikiId, dirty, apply]);

  // 管理者がロックを外す（FN0501-BR12）
  const release = useCallback(async () => {
    if (wikiId) {
      apply(await reportEditing(wikiId, false, { release: true }));
    }
  }, [wikiId, apply]);

  return { ...notice, release };
}
