// バックエンドの URL。個人用（と開発時）は同じ PC のバックエンド。
// デスクトップアプリで共有サーバーに接続するときは、起動時に setBaseUrl で接続先に変える（DesktopGate）
let baseUrl = "http://localhost:8080";

export function setBaseUrl(url: string) {
  baseUrl = url;
}

export function getBaseUrl() {
  return baseUrl;
}

// ログインのトークン。デスクトップアプリは画面とサーバーのオリジンが違い Cookie が届かないため、
// Authorization ヘッダーで送る。この PC（localStorage）に保存して、次の起動でもログインしたままにする
const TOKEN_KEY = "ari-docs-token";
let memoryToken: string | null = null;

export function setToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // 保存できなくても、この起動の間はログインできるようにする
  }
  memoryToken = token;
}

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// API のエラー。status で見分ける（409 の保存の食い違いなど）
export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// エラーの応答（{ message }）から文言を取り出す。JSON でなければ HTTP ステータスを使う
async function toError(response: Response) {
  const text = await response.text();
  console.error(response.status, text);
  try {
    const body = JSON.parse(text);
    if (body && typeof body.message === "string" && body.message) {
      return new HttpError(body.message, response.status);
    }
  } catch {
    // JSON ではない
  }
  return new HttpError("Request failed", response.status);
}

// 未ログイン（401）ならログイン画面へ移る。ログインの確認（/api/me）では移らないように false を渡す
export async function get<T>(url: string, redirectOnUnauthorized = true): Promise<T> {
  const response = await fetch(baseUrl + url, {
    credentials: "include",
    headers: authHeaders(),
  });

  if (response.status === 401 && redirectOnUnauthorized) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw await toError(response);
  }

  return response.json();
}

export async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(baseUrl + url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await toError(response);
  }

  if (
    response.status === 204 ||
    response.headers.get("content-length") === "0"
  ) {
    return undefined as T;
  }

  return response.json();
}

export async function postForm<T>(
  url: string,
  body: FormData,
): Promise<T> {
  const response = await fetch(baseUrl + url, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(),
    body,
  });

  if (!response.ok) {
    throw await toError(response);
  }
  return undefined as T;
}

// 本文にファイルの中身をそのまま入れて送る（Note・Wiki の画像など）
export async function postBinary<T>(url: string, body: Blob): Promise<T> {
  const response = await fetch(baseUrl + url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": body.type || "application/octet-stream", ...authHeaders() },
    body,
  });
  if (!response.ok) {
    throw await toError(response);
  }
  return response.json();
}

// ファイルのダウンロード（本文をそのまま受け取る）
export async function getBlob(url: string): Promise<Blob> {
  const response = await fetch(baseUrl + url, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw await toError(response);
  }
  return response.blob();
}

// 送った割合（0〜1）を onProgress で知らせるアップロード。fetch では送信の進み具合が取れないため XMLHttpRequest を使う
export function postFormWithProgress(
  url: string,
  body: FormData,
  onProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", baseUrl + url);
    xhr.withCredentials = true;
    for (const [name, value] of Object.entries(authHeaders())) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = "Request failed";
      try {
        const parsed = JSON.parse(xhr.responseText);
        if (typeof parsed?.message === "string" && parsed.message) {
          message = parsed.message;
        }
      } catch {
        // JSON ではない
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("サーバーに接続できません"));
    xhr.send(body);
  });
}

// JSON を送り、本文をそのまま受け取る（ZIP のダウンロードなど）
export async function postBlob(url: string, body: unknown): Promise<Blob> {
  const response = await fetch(baseUrl + url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await toError(response);
  }
  return response.blob();
}
