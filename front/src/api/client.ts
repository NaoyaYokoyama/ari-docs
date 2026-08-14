const BASE_URL = "http://localhost:8080";

export async function get<T>(url: string): Promise<T> {
  const response = await fetch(BASE_URL + url, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(response.statusText);
  }

  return response.json();
}

export async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(BASE_URL + url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(response.statusText);
  }

  if (
    response.status === 204 ||
    response.headers.get("content-length") === "0"
  ) {
    return undefined as T;
  }

  return response.json();
}
