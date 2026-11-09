import { WIKI } from "@/pages/content/contentKinds";
import ContentPage from "@/pages/content/ContentPage";

// Wiki（全員で共有）。画面は Note と共通（pages/content/）
export default function Wiki() {
  return <ContentPage kind={WIKI} />;
}
