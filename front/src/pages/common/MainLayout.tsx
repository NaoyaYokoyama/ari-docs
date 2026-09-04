import type { ReactNode } from "react";

import Header from "@/pages/common/Header";

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

  return (
    <div className="h-screen">
      <Header
        displayName={displayName}
        onLogout={onLogout}
      />

      <div className="h-[calc(100vh-60px)]">
        {children}
      </div>

    </div>
  );
}

export default MainLayout;
