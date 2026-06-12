export interface ShortenResponse {
  short_url: string;
  long_url: string;
  alias: string;
  expires_at: string | null;
  is_custom: boolean;
  has_password: boolean;
}

export interface UrlHistoryItem {
  alias: string;
  long_url: string;
  short_url: string;
  is_custom: boolean;
  has_password: boolean;
  expires_at: string | null;
  created_at: string | null;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  email: string;
}

const BASE = '';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${url}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || 'Something went wrong');
  }

  return data as T;
}

export async function shortenUrl(longUrl: string, customAlias?: string, expiresInDays?: number, password?: string): Promise<ShortenResponse> {
  return request<ShortenResponse>('/api/shorten', {
    method: 'POST',
    body: JSON.stringify({
      long_url: longUrl,
      custom_alias: customAlias || undefined,
      expires_in_days: expiresInDays || undefined,
      password: password || undefined,
    }),
  });
}

export async function register(email: string, password: string): Promise<TokenResponse> {
  return request<TokenResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  return request<TokenResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getMyUrls(): Promise<UrlHistoryItem[]> {
  const data = await request<{ urls: UrlHistoryItem[] }>('/api/urls');
  return data.urls;
}

export async function deleteUrl(alias: string): Promise<void> {
  await request<{ detail: string }>(`/api/urls/${alias}`, { method: 'DELETE' });
}
