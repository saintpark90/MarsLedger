const CONNECTION_KEY = "marsledger.connection";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export function normalizeSupabaseUrl(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function readConnection(): SupabaseConfig | null {
  const stored = readStored();
  if (stored) return stored;
  const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL ?? "");
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  if (url && anonKey.length >= 20) return { url, anonKey };
  return null;
}

export function saveConnection(config: SupabaseConfig): void {
  localStorage.setItem(CONNECTION_KEY, JSON.stringify(config));
}

export function clearConnection(): void {
  localStorage.removeItem(CONNECTION_KEY);
}

function readStored(): SupabaseConfig | null {
  try {
    const raw = localStorage.getItem(CONNECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SupabaseConfig>;
    const url = normalizeSupabaseUrl(parsed.url ?? "");
    const anonKey = parsed.anonKey?.trim() ?? "";
    if (!url || anonKey.length < 20) return null;
    return { url, anonKey };
  } catch {
    return null;
  }
}

export function explainError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(message)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (/email not confirmed/i.test(message)) return "이메일 인증이 필요합니다. 메일함을 확인해 주세요.";
  if (/already registered/i.test(message)) return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (/relation .* does not exist|schema cache|could not find the table/i.test(message)) {
    return "Supabase 테이블이 없습니다. SQL 마이그레이션을 SQL Editor에서 실행해 주세요.";
  }
  if (/Failed to fetch|NetworkError|load failed/i.test(message)) {
    return "서버에 연결하지 못했습니다. 주소와 네트워크를 확인해 주세요.";
  }
  return message;
}
