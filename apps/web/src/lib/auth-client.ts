import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export const authClient = createAuthClient({
  baseURL: apiBaseUrl,
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
  plugins: [twoFactorClient()],
});
