import { Navigate, useSearchParams } from "react-router";
import { Challenges } from "../components/Challenges";

/**
 * Improve: your challenges. Champion pool, matchups, LP and activity live on your profile
 * (the home page); old links to those tabs land there.
 */
export function Improve() {
  const [params] = useSearchParams();
  const tab = params.get("tab");
  if (tab && ["champions", "matchups", "lp", "activity"].includes(tab)) {
    const next = new URLSearchParams(params);
    next.set("tab", tab === "activity" ? "overview" : tab);
    return <Navigate to={`/?${next}`} replace />;
  }
  return (
    <div className="stack" style={{ gap: 20 }}>
      <header>
        <h1 className="page-title">Improve</h1>
        <p className="page-sub" style={{ margin: 0 }}>Short challenges built from your own games.</p>
      </header>
      <Challenges />
    </div>
  );
}
