import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, type AppConfig, type Me } from "./api";

interface SessionState {
  config: AppConfig | null;
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Page-level hint for the Coach (brief §19: the Coach knows the current screen). */
  coachHint: string | null;
  setCoachHint: (hint: string | null) => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [coachHint, setCoachHint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMe(null);
      else throw err;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setConfig(await api.config());
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ config, me, loading, refresh, coachHint, setCoachHint }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

/** Small data-loading hook with stable error handling. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (error) => alive && setState({ error, loading: false }),
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
