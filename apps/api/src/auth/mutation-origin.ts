import { ForbiddenException } from "@nestjs/common";

type CookieRequest = {
  method: string;
  headers: { cookie?: string | undefined; origin?: string | undefined };
};

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

// CORS controls which responses a browser may read; it does not prevent a
// simple POST from performing a mutation. SameSite cookies also span sibling
// origins. Cookie-authenticated mutations therefore require WEB_ORIGIN.
// Direct service calls have no HTTP request. Requests without a cookie still
// have to pass the ordinary authentication check in SessionGuard.
export function assertCookieMutationOrigin(request: CookieRequest, webOrigin: string): void {
  if (safeMethods.has(request.method.toUpperCase()) || !request.headers.cookie?.trim()) return;
  if (request.headers.origin !== new URL(webOrigin).origin) {
    throw new ForbiddenException({ code: "REQUEST_ORIGIN_NOT_ALLOWED" });
  }
}
