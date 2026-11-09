import { NOTE } from "@/pages/content/contentKinds";
import ContentPage from "@/pages/content/ContentPage";

// Note（自分だけのメモ）。画面は Wiki と共通（pages/content/）
export default function Note() {
  return <ContentPage kind={NOTE} />;
}
