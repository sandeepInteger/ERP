import { useEffect, useState } from "react";

import { getAccessToken, refreshAccessToken, setAccessToken, subscribeAccessToken } from "../lib/api.js";

interface AuthState {
  accessToken: string | null;
  isLoading: boolean;
}

export function useAuth(): AuthState & { setToken: (t: string | null) => void } {
  const initialToken = getAccessToken();
  const [state, setState] = useState<AuthState>({ accessToken: initialToken, isLoading: !initialToken });

  useEffect(() => {
    const unsubscribe = subscribeAccessToken((token) => setState({ accessToken: token, isLoading: false }));
    if (!getAccessToken()) {
      void refreshAccessToken().then((token) => setState({ accessToken: token, isLoading: false }));
    }
    return unsubscribe;
  }, []);

  return { ...state, setToken: setAccessToken };
}
