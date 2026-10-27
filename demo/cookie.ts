// Stand-in for hono/cookie in the in-browser demo: browsers drop Cookie and Set-Cookie headers on
// constructed Requests and Responses, so the session token lives in memory instead.
let jar: Record<string, string> = {};

export function getCookie(_c: unknown, name?: string) {
  return name === undefined ? { ...jar } : jar[name];
}

export function setCookie(_c: unknown, name: string, value: string) {
  jar[name] = value;
}

export function deleteCookie(_c: unknown, name: string) {
  delete jar[name];
}

export function clearCookies() {
  jar = {};
}
