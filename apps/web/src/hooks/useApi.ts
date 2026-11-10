import { useCallback, useEffect, useState } from "react";

import { api, errMsg } from "../lib/api.js";

/** GET with loading/error state and a reload(). Pass null to skip the request. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));

  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const r = await api.get<T>(url);
      setData(r.data);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { void reload(); }, [reload]);

  return { data, setData, error, loading, reload };
}
