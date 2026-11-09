import { type ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useApp } from "@/app/AppContext";
import { rememberLastPage, startPath } from "@/app/preferences";
import Header from "@/pages/common/Header";
import VimLayer from "@/vim/VimLayer";

// 起動したときの画面へは 1 回だけ移る（あとで Home を開いたときは移らない）
let started = false;

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
  const { user } = useApp();
  const docsEnabled = !!user?.docsEnabled;

  // 起動したときに開く画面（設定の「操作」。FN0701）。URL で画面を指定して開いたときはそのまま
  useEffect(() => {
    if (started) {
      return;
    }
    started = true;
    const path = startPath(docsEnabled);
    if (location.pathname === "/" && !location.search && path !== "/") {
      void navigate(path, { replace: true });
    }
  }, [docsEnabled, location.pathname, location.search, navigate]);

  useEffect(() => {
    rememberLastPage(location.pathname, location.search);
  }, [location.pathname, location.search]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header
        displayName={displayName}
        onLogout={onLogout}
      />

      <div className="min-h-0 flex-1">
        {children}
      </div>

      <VimLayer />
    </div>
  );
}

export default MainLayout;
