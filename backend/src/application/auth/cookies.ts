/**
 * Cookie de sesión `sepsa_session`: HttpOnly, `SameSite=Lax` y `Secure` cuando está habilitado (producción o `COOKIE_SECURE=true`).
 */
export function parseCookie(header: string | undefined, name: string): string | undefined {
  return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || undefined;
}

export function sessionCookie(token: string, maxAge: number, secureEnabled: boolean): string {
  const secure = secureEnabled ? "; Secure" : "";
  return `sepsa_session=${encodeURIComponent(token)}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Path=/${secure}`;
}

export function clearSessionCookie(secureEnabled: boolean): string {
  const secure = secureEnabled ? "; Secure" : "";
  return `sepsa_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/${secure}`;
}
