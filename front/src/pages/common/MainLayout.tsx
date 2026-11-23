import { type ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useApp } from "@/app/AppContext";
import { rememberLastPage, startPath } from "@/app/preferences";
import { hasPendingAriLink, useAriLinkPlace } from "@/app/useAriLink";
import Header from "@/pages/common/Header";
import UpdateNotice from "@/pages/common/UpdateNotice";
import VimLayer from "@/vim/VimLayer";

// 起動したときの画面へは 1 回だけ移る（あとで Home を開いたときは移らない）
let started = false;
// 管理者の PC でない旨は、起動したときに 1 回だけ知らせる
let adminNoticeShown = false;

type Props = {
  children: ReactNode;
  displayName: string;
  onLogout: () => void;
};

function MainLayout({
  children,
  displayName,
  onLogout,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, showMessage } = useApp();
  const docsEnabled = !!user?.docsEnabled;
  // リンクに入れる今の場所と、場所を切り替えて開くリンク（FN0004-BR07）
  useAriLinkPlace();

  // 起動したときに開く画面（設定の「操作」。FN0701）。URL で画面を指定して開いたときはそのまま
  useEffect(() => {
    if (started) {
      return;
    }
    started = true;
    // 場所を切り替えてリンクを開くときは、起動したときの画面へ移らない
    if (hasPendingAriLink()) {
      return;
    }
    const path = startPath(docsEnabled);
    if (location.pathname === "/" && !location.search && path !== "/") {
      void navigate(path, { replace: true });
    }
  }, [docsEnabled, location.pathname, location.search, navigate]);

  useEffect(() => {
    rememberLastPage(location.pathname, location.search);
  }, [location.pathname, location.search]);

  // 管理者だが、この PC を管理者の PC に登録していない（FN0102-BR12）
  useEffect(() => {
    if (user?.adminElsewhere && !adminNoticeShown) {
      adminNoticeShown = true;
      showMessage(
        "info",
        "この PC は管理者の PC ではないため、利用者として使っています。管理者の操作は、設定の「管理者の PC」でこの PC を登録するとできます",
      );
    }
  }, [user?.adminElsewhere, showMessage]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header
        displayName={displayName}
        onLogout={onLogout}
      />

      <UpdateNotice />

      <div className="min-h-0 flex-1">
        {children}
      </div>

      <VimLayer />
    </div>
  );
}

export default MainLayout;
