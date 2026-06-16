// IG REST API client. Server-only.
// Docs: https://labs.ig.com/rest-trading-api-reference

export type IgEnv = "demo" | "live";

export interface IgSession {
  cst: string;
  xst: string;
  apiKey: string;
  baseUrl: string;
  accountEquity: number;
  accountBalance: number;
  accountPnL: number;
  currency: string;
}

function clean(v: string | undefined) {
  return (v ?? "").replace(/^['"]|['"]$/g, "").trim();
}

function envCreds(env: IgEnv) {
  if (env === "live") {
    return {
      apiKey: clean(process.env.IG_LIVE_API_KEY),
      username: clean(process.env.IG_LIVE_USERNAME),
      password: clean(process.env.IG_LIVE_PASSWORD),
      baseUrl: "https://api.ig.com/gateway/deal",
    };
  }
  return {
    apiKey: clean(process.env.IG_API_KEY),
    username: clean(process.env.IG_USERNAME),
    password: clean(process.env.IG_PASSWORD),
    baseUrl: "https://demo-api.ig.com/gateway/deal",
  };
}

export function sanitizeIdentifier(u: string | undefined | null): string {
  const s = (u ?? "").trim();
  if (!s) return "";
  if (s.length <= 4) return "*".repeat(s.length);
  return `${s.slice(0, 2)}${"*".repeat(Math.max(2, s.length - 4))}${s.slice(-2)}`;
}

export function fingerprintKey(k: string | undefined | null): string {
  const s = (k ?? "").trim();
  if (!s) return "";
  if (s.length <= 4) return "*".repeat(s.length);
  return `••••${s.slice(-4)}`;
}

export function parseIgErrorCode(body: string): string | null {
  try {
    const j = JSON.parse(body);
    if (j && typeof j.errorCode === "string") return j.errorCode;
  } catch {
    /* not json */
  }
  const m = body.match(/error\.[a-zA-Z0-9._-]+/);
  return m ? m[0] : null;
}

export function nextStepForIgError(code: string | null, httpStatus: number, env: IgEnv): string {
  const prefix = env === "live" ? "IG_LIVE_" : "IG_";
  if (code === "error.security.invalid-details") {
    return `Update ${prefix}USERNAME and ${prefix}PASSWORD — they don't match an active ${env} IG account.`;
  }
  if (code === "error.security.client-token-invalid" || code === "error.security.api-key-invalid") {
    return `Update ${prefix}API_KEY — the key isn't valid for this username on the ${env} environment.`;
  }
  if (code === "error.security.account-migrated") {
    return `This IG account has been migrated. Sign in to IG.com once to complete the migration, then re-check.`;
  }
  if (code === "error.public-api.failure.encryption.required") {
    return `IG requires an encrypted password for this account. Contact support.`;
  }
  if (httpStatus === 403) {
    return `IG refused API access. Enable API access on the ${env} IG account.`;
  }
  if (httpStatus === 429) {
    return `IG rate-limited the login. Wait a minute and try again.`;
  }
  return `Re-check ${prefix}USERNAME, ${prefix}PASSWORD, and ${prefix}API_KEY for the ${env} environment.`;
}

export function igDiagnostics(env: IgEnv) {
  const c = envCreds(env);
  return {
    environment: env,
    identifier: sanitizeIdentifier(c.username),
    identifier_len: c.username.length,
    api_key_fingerprint: fingerprintKey(c.apiKey),
    api_key_len: c.apiKey.length,
    password_set: c.password.length > 0,
    password_len: c.password.length,
    credentials_present: !!(c.apiKey && c.username && c.password),
  };
}

export class IgLoginError extends Error {
  code: string | null;
  httpStatus: number;
  constructor(message: string, code: string | null, httpStatus: number) {
    super(message);
    this.name = "IgLoginError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function explainLoginFailure(status: number, body: string, env: IgEnv) {
  const code = parseIgErrorCode(body);
  if (status === 401 && code === "error.security.invalid-details") {
    return `IG rejected the ${env} credentials: username, password, API key, or environment do not match an active ${env} IG account.`;
  }
  if (status === 401 && code === "error.security.client-token-invalid") {
    return `IG rejected the ${env} API key. Check that the key belongs to the same ${env} account as the username.`;
  }
  if (status === 403) {
    return `IG refused API access for the ${env} account. Confirm API access is enabled on the IG account.`;
  }
  return `IG login failed (${status}${code ? ` ${code}` : ""}): ${body.slice(0, 200)}`;
}

export async function igLogin(env: IgEnv): Promise<IgSession> {
  const c = envCreds(env);
  if (!c.apiKey || !c.username || !c.password) {
    throw new Error(`IG credentials missing for ${env}`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(c.username)) {
    throw new Error(`IG username for ${env} has invalid characters (allowed: letters, digits, . _ -). Check the secret value.`);
  }
  const res = await fetch(`${c.baseUrl}/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json; charset=UTF-8",
      "X-IG-API-KEY": c.apiKey,
      Version: "2",
    },
    body: JSON.stringify({
      identifier: c.username,
      password: c.password,
      encryptedPassword: false,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    const code = parseIgErrorCode(txt);
    throw new IgLoginError(explainLoginFailure(res.status, txt, env), code, res.status);
  }
  const cst = res.headers.get("CST") ?? "";
  const xst = res.headers.get("X-SECURITY-TOKEN") ?? "";
  const body = (await res.json()) as any;
  const acct = body?.accountInfo;
  const balance = Number(acct?.balance ?? 0);
  const profit = Number(acct?.profitLoss ?? 0);
  return {
    cst,
    xst,
    apiKey: c.apiKey,
    baseUrl: c.baseUrl,
    accountBalance: balance,
    accountPnL: profit,
    accountEquity: balance + profit,
    currency: body?.currencyIsoCode ?? "USD",
  };
}

function authHeaders(s: IgSession, version = "1") {
  return {
    "X-IG-API-KEY": s.apiKey,
    CST: s.cst,
    "X-SECURITY-TOKEN": s.xst,
    Accept: "application/json; charset=UTF-8",
    "Content-Type": "application/json; charset=UTF-8",
    Version: version,
  };
}

export async function igGetMarket(s: IgSession, epic: string) {
  const r = await fetch(`${s.baseUrl}/markets/${epic}`, {
    headers: authHeaders(s, "3"),
  });
  if (!r.ok) return null;
  return (await r.json()) as any;
}

export async function igGetPrices(s: IgSession, epic: string, max = 30) {
  const r = await fetch(
    `${s.baseUrl}/prices/${epic}?resolution=MINUTE&max=${max}`,
    { headers: authHeaders(s, "3") },
  );
  if (!r.ok) return null;
  return (await r.json()) as any;
}

export async function igGetTransactions(s: IgSession, fromIso: string, toIso: string) {
  const url = new URL(`${s.baseUrl}/history/transactions`);
  url.searchParams.set("from", fromIso);
  url.searchParams.set("to", toIso);
  url.searchParams.set("pageSize", "200");
  const r = await fetch(url.toString(), { headers: authHeaders(s, "2") });
  if (!r.ok) return { transactions: [] };
  return (await r.json()) as { transactions: any[] };
}

export async function igGetPositions(s: IgSession) {
  const r = await fetch(`${s.baseUrl}/positions`, { headers: authHeaders(s, "2") });
  if (!r.ok) return { positions: [] };
  return (await r.json()) as { positions: any[] };
}

export interface IgCreateOrder {
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  stopLevel?: number;
  limitLevel?: number;
  currencyCode?: string;
}

export async function igCreatePosition(s: IgSession, o: IgCreateOrder) {
  const body = {
    epic: o.epic,
    expiry: "-",
    direction: o.direction,
    size: o.size,
    orderType: "MARKET",
    timeInForce: "FILL_OR_KILL",
    stopLevel: o.stopLevel,
    limitLevel: o.limitLevel,
    currencyCode: o.currencyCode ?? "USD",
    forceOpen: true,
    guaranteedStop: false,
  };
  const r = await fetch(`${s.baseUrl}/positions/otc`, {
    method: "POST",
    headers: authHeaders(s, "2"),
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as any;
  return { ok: r.ok, status: r.status, body: json };
}

export async function igClosePosition(
  s: IgSession,
  pos: { dealId: string; direction: "BUY" | "SELL"; size: number; epic: string },
) {
  const body = {
    dealId: pos.dealId,
    epic: pos.epic,
    expiry: "-",
    direction: pos.direction === "BUY" ? "SELL" : "BUY",
    size: pos.size,
    orderType: "MARKET",
    timeInForce: "FILL_OR_KILL",
  };
  // IG uses DELETE via POST with _method: DELETE
  const r = await fetch(`${s.baseUrl}/positions/otc`, {
    method: "POST",
    headers: { ...authHeaders(s, "1"), "_method": "DELETE" },
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as any;
  return { ok: r.ok, status: r.status, body: json };
}

export function ymdInEst(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(d); // YYYY-MM-DD
}

export function nowEstHm(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return fmt.format(d); // HH:MM
}

export function isWithinSession(start: string, end: string, d = new Date()) {
  const hm = nowEstHm(d);
  return hm >= start && hm <= end;
}
