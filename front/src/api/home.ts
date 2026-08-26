import { get, post } from "@/api/client";

export function search(
  keyword: string,
) {
  return post("/api/home/search", {
    keyword,
  });
}
