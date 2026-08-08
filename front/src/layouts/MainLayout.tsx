import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import Home from "@/pages/Home";

function MainLayout() {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <Home />
      </div>
    </div>
  );
}

export default MainLayout;
