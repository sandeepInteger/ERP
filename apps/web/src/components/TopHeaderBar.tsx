import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { usePageBackTarget } from "../context/PageBackContext.js";
import { Button } from "./ui/button.js";

export function TopHeaderBar() {
  const navigate = useNavigate();
  const back = usePageBackTarget();

  return (
    <div className="sticky top-0 z-30 flex h-[var(--app-header-h)] shrink-0 items-center gap-2 border-b border-surface-200 bg-surface-0 px-4">
      {/* The one place a page-level Back button lives; pages register it with usePageBack. */}
      {back && (
        <Button variant="ghost" size="sm" onClick={() => navigate(back.to)}>
          <ArrowLeft size={14} aria-hidden="true" /> {back.label}
        </Button>
      )}
    </div>
  );
}
