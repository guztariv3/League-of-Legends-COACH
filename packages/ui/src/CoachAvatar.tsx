/**
 * Original Coach avatar: a small hovering crystal wisp. It is inspired by a
 * fantasy aesthetic, but it is not a Riot character and uses no Riot assets.
 */
export type Expression = "idle" | "happy" | "thinking" | "concerned";

export function CoachAvatar({ expression = "idle", quiet = false }: { expression?: Expression; quiet?: boolean }) {
  const eyes = {
    idle: <><ellipse cx="25" cy="30" rx="2.6" ry="3.4" /><ellipse cx="39" cy="30" rx="2.6" ry="3.4" /></>,
    happy: <><path d="M22 31q3-4 6 0" /><path d="M36 31q3-4 6 0" /></>,
    thinking: <><ellipse cx="25" cy="29" rx="2.6" ry="2" /><ellipse cx="39" cy="29" rx="2.6" ry="2" /></>,
    concerned: <><path d="M22 27l6 2" /><path d="M42 27l-6 2" /><ellipse cx="25" cy="31.5" rx="2.2" ry="2.8" /><ellipse cx="39" cy="31.5" rx="2.2" ry="2.8" /></>,
  }[expression];
  return (
    <svg className={`coach-avatar${quiet ? " quiet" : ""}`} viewBox="0 0 64 64" role="img" aria-label="KOI Master, tu coach">
      <defs>
        <linearGradient id="wisp-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b8fff4" />
          <stop offset="0.55" stopColor="#7fe3d6" />
          <stop offset="1" stopColor="#3987e5" />
        </linearGradient>
        <radialGradient id="wisp-glow">
          <stop offset="0" stopColor="#7fe3d6" stopOpacity="0.35" />
          <stop offset="1" stopColor="#7fe3d6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#wisp-glow)" />
      <path d="M32 6 50 22 44 52H20L14 22Z" fill="url(#wisp-body)" stroke="#e8fffb" strokeOpacity="0.5" strokeWidth="1" />
      <path d="M32 6 32 52M14 22h36" stroke="#0b0e14" strokeOpacity="0.12" strokeWidth="1" />
      <g fill="#0b0e14" stroke="#0b0e14" strokeWidth="2" strokeLinecap="round">{eyes}</g>
      <circle cx="46" cy="12" r="1.6" fill="#e3b964" />
      <circle cx="16" cy="48" r="1.2" fill="#e3b964" opacity="0.7" />
    </svg>
  );
}
