import * as oidc from "openid-client";
import type { FastifyInstance } from "fastify";

import { issueSession, setRefreshCookie } from "./auth.service.js";

// Microsoft (Azure Entra ID) sign-in, authorization-code flow with state + nonce.
// Same flow as HRMS (apps/api/src/modules/auth/sso.route.ts).

const TENANT = process.env["AZURE_TENANT_ID"] ?? "";
const CLIENT_ID = process.env["AZURE_CLIENT_ID"] ?? "";
const CLIENT_SECRET = process.env["AZURE_CLIENT_SECRET"] ?? "";
const REDIRECT_URI = process.env["AZURE_REDIRECT_URI"] ?? "";

const STATE_COOKIE = "sso_state";

let _config: oidc.Configuration | null = null;

async function getConfig(): Promise<oidc.Configuration> {
  if (_config) return _config;
  const server = new URL(`https://login.microsoftonline.com/${TENANT}/v2.0`);
  _config = await oidc.discovery(server, CLIENT_ID, CLIENT_SECRET);
  return _config;
}

export async function ssoRoute(app: FastifyInstance) {
  if (!TENANT || !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    app.log.warn("Azure SSO env vars not configured — /api/auth/sso/azure routes disabled");
    return;
  }

  app.get("/api/auth/sso/azure", async (_req, reply) => {
    const config = await getConfig();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();

    reply.setCookie(STATE_COOKIE, JSON.stringify({ state, nonce }), {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/api/auth",
    });

    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: REDIRECT_URI,
      scope: "openid email profile",
      state,
      nonce,
      response_type: "code",
    });

    return reply.redirect(url.href);
  });

  app.get("/api/auth/sso/azure/callback", async (req, reply) => {
    const raw = req.cookies[STATE_COOKIE];
    if (!raw) return reply.redirect("/login?sso_error=missing_state");

    let saved: { state: string; nonce: string };
    try {
      saved = JSON.parse(raw) as { state: string; nonce: string };
    } catch {
      return reply.redirect("/login?sso_error=bad_state");
    }
    reply.clearCookie(STATE_COOKIE, { path: "/api/auth" });

    const config = await getConfig();
    let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
      tokens = await oidc.authorizationCodeGrant(config, new URL(req.url, REDIRECT_URI), {
        expectedState: saved.state,
        expectedNonce: saved.nonce,
        idTokenExpected: true,
      });
    } catch (err) {
      app.log.error({ err }, "Azure SSO token exchange failed");
      return reply.redirect("/login?sso_error=exchange_failed");
    }

    const claims = tokens.claims() as Record<string, unknown> | undefined;
    if (!claims) return reply.redirect("/login?sso_error=no_claims");

    const email = (claims["email"] as string | undefined) ?? (claims["preferred_username"] as string | undefined);
    const oid = (claims["oid"] as string | undefined) ?? (claims["sub"] as string | undefined) ?? null;
    if (!email) return reply.redirect("/login?sso_error=no_email");

    // Azure returns whatever casing the tenant has; match case-insensitively.
    // No auto-provisioning: an admin adds the user first, then they sign in.
    const user = await app.db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    if (!user) return reply.redirect("/login?sso_error=not_registered");
    if (!user.isActive) return reply.redirect("/login?sso_error=account_disabled");

    const linked = oid && !user.azureOid ? await app.db.user.update({ where: { id: user.id }, data: { azureOid: oid } }) : user;

    const { refreshToken } = await issueSession(app, linked, req.ip, req.headers["user-agent"] ?? "");
    setRefreshCookie(reply, refreshToken);

    // The web app exchanges the refresh cookie for an access token on load.
    return reply.redirect("/");
  });
}
