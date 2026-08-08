import { Routes, Route } from "react-router-dom";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";

import Home from "@/pages/Home";
import Folder from "@/pages/Folder";

function App() {
  return (
    <div className="h-screen">
      <Header />

      <div className="flex h-[calc(100vh-60px)]">
        <Sidebar />

        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/folder" element={<Folder />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
