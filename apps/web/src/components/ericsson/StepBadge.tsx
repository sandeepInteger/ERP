import type { EricssonStep } from "@erp/types";

import { Badge } from "../ui/badge.js";
import { stepLabel, stepTone } from "../../lib/ericsson.js";

export function StepBadge({ step }: { step: EricssonStep }) {
  return <Badge tone={stepTone(step)}>{stepLabel(step)}</Badge>;
}
