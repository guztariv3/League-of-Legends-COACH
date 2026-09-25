import forestUrl from "../art/rift-forest.svg";
import { useSplash } from "../assets";

/** Fixed page backdrop: an original night forest in the mood of the client lobby. */
export function World() {
  return (
    <div className="world" aria-hidden="true">
      <div className="world-map" style={{ backgroundImage: `url(${forestUrl})` }} />
    </div>
  );
}

/** A champion's splash art fading into the page top. Renders nothing without Data Dragon art. */
export function SplashBackdrop({ champion }: { champion: string | number | null | undefined }) {
  const url = useSplash(champion);
  return url ? <div className="splash-backdrop" aria-hidden="true" style={{ backgroundImage: `url(${url})` }} /> : null;
}
