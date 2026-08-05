const BASE_URL = "http://localhost:8080";

export async function get<T>(url: string): Promise<T> {
  const response = await fetch(BASE_URL + url);

  if (!response.ok) {
    throw new Error(response.statusText);
  }

  return response.json();
}
