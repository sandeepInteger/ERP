import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";

import { AsyncButton } from "./ui/async-button.js";
import { Button } from "./ui/button.js";
import { Field, FormError } from "./ui/field.js";
import { Input } from "./ui/input.js";
import { api, errMsg, setAccessToken } from "../lib/api.js";

/** Field engineer (FE) sign-in: work email → 6-digit code by email → signed in. */
export function EmailCodeLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function requestCode() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Enter your work email."); throw new Error("validation"); }
    setError(null);
    try {
      const { data } = await api.post<{ sent: boolean; devCode?: string }>("/auth/otp/request", { email: email.trim() });
      setDevCode(data.devCode ?? null);
      setCode("");
      setStage("code");
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  async function verify() {
    if (!/^\d{6}$/.test(code.trim())) { setError("Enter the 6-digit code from the email."); throw new Error("validation"); }
    setError(null);
    try {
      const { data } = await api.post<{ accessToken: string }>("/auth/otp/verify", { email: email.trim(), code: code.trim() });
      setAccessToken(data.accessToken);
      navigate("/field", { replace: true });
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><Mail size={16} aria-hidden="true" /> Field engineers: sign in with an email code</div>
      {stage === "email" ? (
        <>
          <Field label="Work email">
            <Input type="email" autoComplete="email" inputMode="email" className="h-11 text-base" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="name@integertel.com" />
          </Field>
          <FormError message={error} />
          <AsyncButton variant="outline" size="lg" className="w-full" onClick={() => requestCode()}>Email me a code</AsyncButton>
        </>
      ) : (
        <>
          <p className="text-[13px] text-surface-600">
            If <strong>{email.trim()}</strong> is set up for field access, a 6-digit code is on its way. It works once, for 10 minutes.
          </p>
          {devCode && (
            <p className="rounded-md bg-[var(--color-info-bg)] px-3 py-2 text-[13px] text-[var(--color-info-fg)]">
              Test server without email: your code is <strong className="tracking-widest">{devCode}</strong>
            </p>
          )}
          <Field label="Code">
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="h-11 text-center text-xl tracking-[0.4em]"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <FormError message={error} />
          <AsyncButton size="lg" className="w-full" onClick={() => verify()}>Sign in</AsyncButton>
          <Button variant="ghost" size="sm" onClick={() => { setStage("email"); setError(null); }}>Use a different email or resend</Button>
        </>
      )}
    </div>
  );
}
