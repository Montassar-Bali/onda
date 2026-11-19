import { Sparkle } from "./icons";

/**
 * Every ONDA event has its own theme. Instead of a stock photo, each event gets a generated poster:
 * black chrome, a liquid swoosh like the ONDA logo, sparkles, and the theme in big type.
 * The colourway is picked from the event id, so it stays stable but differs between events.
 */
const ways = [
  { glow: "#e1102a", deep: "#5c000b", hi: "#ff9aa8" }, // crimson
  { glow: "#ff3d5a", deep: "#4a0412", hi: "#ffc2ca" }, // rose
  { glow: "#ff6a2b", deep: "#4a1405", hi: "#ffc7a8" }, // ember
  { glow: "#c2185b", deep: "#3d0016", hi: "#ff9ec4" }, // wine
  { glow: "#ff2944", deep: "#1a0003", hi: "#ffd0d6" }, // deep red
];
/** A colourway from one theme colour: the colour glows, a dark version sits underneath, a pale version highlights. */
function wayFrom(hex: string) {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const to = (k: number[]) => "#" + k.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  return { glow: hex, deep: to(c.map((v) => v * 0.28)), hi: to(c.map((v) => v + (255 - v) * 0.68)) };
}
function colourway(id: string, color?: string | null) {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? wayFrom(color) : ways[hash(id) % ways.length];
}
/** Chrome lettering in the edition's own colours (use on text shown over its poster). */
export function chromeFor(id: string, color?: string | null): React.CSSProperties {
  const w = colourway(id, color);
  return { backgroundImage: `linear-gradient(178deg, #ffffff 0%, ${w.hi} 34%, ${w.glow} 62%, ${w.hi} 88%, #ffffff 100%)`, filter: `drop-shadow(0 2px 10px ${w.glow}66)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };
}
function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

/** The logo's tapered swoosh, filled with chrome. */
export function Swoosh({ className = "", gid, hi = "#ffc2ca", glow = "#e1102a", deep = "#5c000b", style }: { className?: string; gid: string; hi?: string; glow?: string; deep?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 400 200" className={className} style={style} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.35" stopColor={glow} />
          <stop offset="0.7" stopColor={deep} />
          <stop offset="1" stopColor={glow} />
        </linearGradient>
      </defs>
      <path d="M6 168C96 52 268 10 394 44 284 30 138 74 6 168Z" fill={`url(#${gid})`} />
      <path d="M60 150C150 70 270 40 360 50 270 50 160 86 60 150Z" fill={hi} opacity="0.35" />
      <path d="M394 44C330 92 220 150 110 182 214 158 322 108 394 44Z" fill={`url(#${gid})`} opacity="0.75" />
    </svg>
  );
}

export function ThemePoster({ id, theme, color, name, size = "md", className = "", children, showName = true }: {
  id: string; theme?: string | null; color?: string | null; name: string; size?: "sm" | "md" | "lg"; className?: string; children?: React.ReactNode; showName?: boolean;
}) {
  const h = hash(id), w = colourway(id, color);
  const tilt = -18 + (h % 26);
  const title = theme?.trim() || name;
  const big = { sm: "text-[22px]", md: "text-[28px]", lg: "text-[40px] md:text-[60px]" }[size];
  return (
    <div className={`relative isolate overflow-hidden ${className}`}
      style={{ background: `radial-gradient(90% 80% at 85% 15%, ${w.glow}cc 0%, ${w.glow}00 60%), radial-gradient(80% 70% at 0% 100%, ${w.deep} 0%, transparent 70%), #0b0506` }}>
      <Swoosh gid={`sw-${h}-${size}-${w.glow.slice(1)}`} glow={w.glow} deep={w.deep} hi={w.hi}
        className="pointer-events-none absolute -right-[12%] top-[8%] w-[110%] opacity-90" style={{ transform: `rotate(${tilt}deg)` }} />
      <Sparkle size={size === "lg" ? 42 : 26} className="sparkle right-[14%] top-[18%]" />
      <Sparkle size={size === "lg" ? 18 : 12} className="sparkle left-[18%] top-[30%]" style={{ animationDelay: `${(h % 7) / 2}s` }} />
      {showName && (
        <div className={`absolute inset-x-0 bottom-0 ${size === "lg" ? "p-6 md:p-10" : "p-4"}`}>
          {theme?.trim() && <p className={`font-bold uppercase tracking-[0.14em] text-white/70 ${size === "lg" ? "text-[13px]" : "text-[10.5px]"}`}>Theme</p>}
          <p className={`line-clamp-3 font-extrabold leading-[1.02] tracking-[-0.03em] ${big}`} style={chromeFor(id, color)}>{title}</p>
        </div>
      )}
      {children}
    </div>
  );
}
