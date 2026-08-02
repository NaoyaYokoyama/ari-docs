import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
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
