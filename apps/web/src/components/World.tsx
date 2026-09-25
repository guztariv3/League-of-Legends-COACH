import mapUrl from "../art/runeterra-map.svg";
import { useSplash } from "../assets";

/** Fixed page backdrop: the original Runeterra map, always present behind the app. */
export function World() {
  return (
    <div className="world" aria-hidden="true">
      <div className="world-map" style={{ backgroundImage: `url(${mapUrl})` }} />
    </div>
  );
}

/** A champion's splash art fading into the page top. Renders nothing without Data Dragon art. */
export function SplashBackdrop({ champion }: { champion: string | number | null | undefined }) {
  const url = useSplash(champion);
  return url ? <div className="splash-backdrop" aria-hidden="true" style={{ backgroundImage: `url(${url})` }} /> : null;
}
