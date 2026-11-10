import * as React from "react";
import { Check, Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "./button.js";

/**
 * Button for a mutating API call (Save, Submit, Approve…). Same contract as HRMS:
 * - onClick must RETURN the promise: onClick={() => save()}
 * - the handler must reject on failure (show the error, then rethrow), or the ✓ lies.
 * Shows a spinner while pending and a brief ✓ on success. Labels stay static.
 */
export interface AsyncButtonProps extends Omit<ButtonProps, "onClick"> {
  onClick: () => Promise<unknown>;
}

export function AsyncButton({ onClick, children, disabled, ...props }: AsyncButtonProps) {
  const [state, setState] = React.useState<"idle" | "busy" | "done">("idle");
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  async function run() {
    if (state === "busy") return;
    setState("busy");
    try {
      await onClick();
      if (!mounted.current) return;
      setState("done");
      setTimeout(() => mounted.current && setState("idle"), 1200);
    } catch {
      if (mounted.current) setState("idle");
    }
  }

  return (
    <Button {...props} disabled={disabled || state === "busy"} aria-busy={state === "busy"} onClick={() => void run()}>
      {state === "busy" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {state === "done" && <Check className="size-4" aria-hidden="true" />}
      {children}
    </Button>
  );
}
