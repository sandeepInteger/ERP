import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { ROLE_LABELS, type Role } from "@erp/types";
import { api, errMsg, setAccessToken } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { SelectField } from "../components/ui/input.js";
import { Field, FormError } from "../components/ui/field.js";
import { EmailCodeLogin } from "../components/EmailCodeLogin.js";

const SSO_ERRORS: Record<string, string> = {
  missing_state: "Your sign-in session expired. Please try again.",
  bad_state: "Your sign-in session was invalid. Please try again.",
  exchange_failed: "Microsoft sign-in failed. Please try again.",
  no_claims: "Microsoft did not return your account details. Please try again.",
  no_email: "Your Microsoft account has no email address visible to this app.",
  not_registered: "You don't have access yet. Ask an admin to add your email in Users & roles.",
  account_disabled: "Your access has been switched off. Contact an admin.",
};

interface Options { microsoft: boolean; devLogin: boolean; emailCode: boolean }
interface DevUser { email: string; firstName: string; lastName: string; role: string }

export default function LoginPage() {
  const { accessToken, isLoading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [options, setOptions] = useState<Options | null>(null);
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const [devEmail, setDevEmail] = useState("");
  const [error, setError] = useState<string | null>(() => {
    const code = params.get("sso_error");
    return code ? (SSO_ERRORS[code] ?? "Microsoft sign-in failed. Please try again.") : null;
  });

  useEffect(() => {
    api.get<Options>("/auth/options").then((r) => {
      setOptions(r.data);
      if (r.data.devLogin) {
        void api.get<DevUser[]>("/auth/dev-users").then((u) => {
          setDevUsers(u.data);
          setDevEmail(u.data[0]?.email ?? "");
        });
      }
    }).catch(() => setError("The server is not reachable. Is the API running?"));
  }, []);

  if (!isLoading && accessToken) return <Navigate to="/dashboard" replace />;

  async function devSignIn() {
    setError(null);
    try {
      const { data } = await api.post<{ accessToken: string }>("/auth/dev-login", { email: devEmail });
      setAccessToken(data.accessToken);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 p-4">
      <Card className="flex w-full max-w-sm flex-col gap-6 p-8 shadow-md">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white" aria-hidden="true">I</div>
          <div>
            <h1 className="text-xl font-bold">Integer ERP</h1>
            <p className="text-sm text-surface-500">Project tracker · Integer Telecom Services</p>
          </div>
        </div>

        <FormError message={error} />

        <Button
          size="lg"
          className="w-full"
          disabled={options !== null && !options.microsoft}
          onClick={() => { window.location.href = "/api/auth/sso/azure"; }}
        >
          <MicrosoftIcon /> Sign in with Microsoft
        </Button>
        {options && !options.microsoft && (
          <p className="-mt-3 text-center text-xs text-surface-500">Microsoft sign-in is not configured on this server yet.</p>
        )}

        {options?.emailCode && (
          <div className="border-t border-surface-200 pt-5">
            <EmailCodeLogin />
          </div>
        )}

        {options?.devLogin && (
          <div className="flex flex-col gap-3 border-t border-dashed border-surface-300 pt-5">
            <Field label="Developer sign-in (local only)">
              <SelectField value={devEmail} onChange={(e) => setDevEmail(e.target.value)}>
                {devUsers.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.firstName} {u.lastName} · {ROLE_LABELS[u.role as Role] ?? u.role}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Button variant="outline" disabled={!devEmail} onClick={() => void devSignIn()}>Sign in as this user</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
