import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Send } from "lucide-react";

import { RaiseCrForm } from "../../components/ericsson/RaiseCrForm.js";
import { Button } from "../../components/ui/button.js";
import { useApi } from "../../hooks/useApi.js";
import { usePageBack } from "../../context/PageBackContext.js";
import type { FieldSite } from "./FieldTodayPage.js";

/** Phone-first: raise a change request from site the moment work goes beyond the SOV. */
export default function FieldCrPage() {
  usePageBack("/field", "Today");
  const { id } = useParams<{ id: string }>();
  const { data: site } = useApi<FieldSite>(`/field/sites/${id}`);
  const [sent, setSent] = useState(false);
  const pm = site?.pmName ?? "the PM";

  if (sent) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <Send size={48} className="text-brand-600" aria-hidden="true" />
        <h1 className="text-xl font-bold">CR sent to {pm}</h1>
        <p className="text-sm text-surface-500">After the PM's review it goes to the Ericsson PM for approval. You'll see the decision on the site.</p>
        <Button asChild size="lg" className="w-full"><Link to="/field">Back to today</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5">
      <div>
        <h1 className="text-xl font-bold">Raise change request</h1>
        <p className="text-[13px] text-surface-500">{site ? `${site.siteCode} · ${site.venueName}` : "Loading…"}</p>
      </div>
      <RaiseCrForm siteId={id!} compact onRaised={async () => setSent(true)} />
    </div>
  );
}
