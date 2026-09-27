import { NextResponse, type NextRequest } from "next/server";

/** Read per request, unlike next.config (frozen at build):
 * - NOTALE_API_TOKEN: notale-ts refuses writes without it. The browser never sees it; it is added
 *   here on the way through the /notale-api and /notale-session rewrites.
 * - NOTALE_FRAME_ANCESTORS: who may put the viewer in an iframe, e.g. "'self' https://host.example".
 *   Unset sends no policy. */
export function proxy(request: NextRequest) {
  const token = process.env.NOTALE_API_TOKEN, ancestors = process.env.NOTALE_FRAME_ANCESTORS;
  const api = /^\/notale-(api|session)\//.test(request.nextUrl.pathname);
  let response = NextResponse.next();
  if (api && token) {
    const headers = new Headers(request.headers);
    headers.set("authorization", `Bearer ${token}`);
    response = NextResponse.next({ request: { headers } });
  }
  if (ancestors) response.headers.set("content-security-policy", `frame-ancestors ${ancestors}`);
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
