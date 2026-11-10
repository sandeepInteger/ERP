import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Page, PageHeader } from "../../components/PageHeader.js";
import { EMPTY_SITE, SiteForm, toSiteBody, type SiteFormValues } from "../../components/ericsson/SiteForm.js";
import { Card } from "../../components/ui/card.js";
import { usePageBack } from "../../context/PageBackContext.js";
import { useToast } from "../../context/ToastContext.js";
import { api, errMsg } from "../../lib/api.js";

export default function NewSitePage() {
  usePageBack("/ericsson/sites", "Site tracker");
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  async function create(v: SiteFormValues) {
    if (!v.siteCode.trim() || !v.venueName.trim()) {
      setError("Site ID and venue name are required.");
      throw new Error("validation");
    }
    setError(null);
    try {
      const { data } = await api.post<{ id: string; siteCode: string }>("/ericsson/sites", toSiteBody(v, false));
      toast(`${data.siteCode} created. Upload the SOV, BOM and RFDS next.`);
      navigate(`/ericsson/sites/${data.id}?tab=documents`);
    } catch (e) {
      setError(errMsg(e));
      throw e;
    }
  }

  return (
    <Page>
      <PageHeader
        kicker="Step 1 of 9 · SOV, BOM, RFDS received"
        title="New site assignment"
        description="Log the Ericsson assignment. You'll upload the three source documents on the next screen."
      />
      <Card className="max-w-4xl p-6">
        <SiteForm initial={EMPTY_SITE} mode="create" onSubmit={create} onCancel={() => navigate("/ericsson/sites")} error={error} />
      </Card>
    </Page>
  );
}
