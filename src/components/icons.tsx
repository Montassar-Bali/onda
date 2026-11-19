/* One outline icon set, 16px, 1.5px stroke. Icons are grey affordances, never in tinted squares. */
type P = { className?: string; size?: number };
const base = (size = 16) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });
const make = (d: React.ReactNode) => function Icon({ className, size }: P) { return <svg {...base(size)} className={className}>{d}</svg>; };

export const IconCalendar = make(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const IconTicket = make(<><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Z" /><path d="M14 6v12" strokeDasharray="2 2" /></>);
export const IconUsers = make(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>);
export const IconId = make(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16a3 3 0 0 1 6 0M14.5 10h4M14.5 13.5h3" /></>);
export const IconLog = make(<><path d="M5 4h11l3 3v13H5z" /><path d="M9 10h6M9 14h6M9 18h3" /></>);
export const IconCash = make(<><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9.5v5M18 9.5v5" /></>);
export const IconScan = make(<><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" /></>);
export const IconSwap = make(<><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></>);
export const IconHome = make(<><path d="M4 10.5 12 4l8 6.5V20H4z" /><path d="M10 20v-5h4v5" /></>);
export const IconMenu = make(<><path d="M4 7h16M4 12h16M4 17h16" /></>);
export const IconClose = make(<><path d="M6 6l12 12M18 6 6 18" /></>);
export const IconCheck = make(<><path d="m5 12.5 4.5 4.5L19 7.5" /></>);
export const IconX = make(<><path d="M7 7l10 10M17 7 7 17" /></>);
export const IconCamera = make(<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>);
export const IconArrowLeft = make(<><path d="M19 12H5M11 6l-6 6 6 6" /></>);
export const IconArrowRight = make(<><path d="M5 12h14M13 6l6 6-6 6" /></>);
export const IconMapPin = make(<><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>);
export const IconLogout = make(<><path d="M10 5H5v14h5M15 8l4 4-4 4M19 12H9" /></>);
export const IconSettings = make(<><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>);
export const IconPlus = make(<><path d="M12 5v14M5 12h14" /></>);
export const IconPrinter = make(<><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3" /><rect x="7" y="14" width="10" height="7" /></>);

export const IconSearch = make(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>);
export const IconBookmark = make(<><path d="M6 4h12v16l-6-4-6 4z" /></>);
export const IconUser = make(<><circle cx="12" cy="8" r="4" /><path d="M4 20.5a8 8 0 0 1 16 0" /></>);
export const IconPhone = make(<><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" /></>);
export const IconMail = make(<><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>);
export const IconClock = make(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const IconSun = make(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>);
export const IconSparkle = make(<><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></>);
export const IconTag = make(<><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.5" /></>);
export const IconShield = make(<><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>);
export const IconGift = make(<><rect x="3.5" y="9" width="17" height="11" rx="1.5" /><path d="M3 9h18M12 9v11M12 9S10.5 4 8 4.5 7 9 12 9Zm0 0s1.5-5 4-4.5S17 9 12 9Z" /></>);
export const IconChart = make(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>);
export const IconBox = make(<><path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9z" /><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" /></>);
export const IconAlert = make(<><path d="M12 3 2.5 20h19z" /><path d="M12 10v4.5M12 17.5v.5" /></>);

export const IconMoon = make(<><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></>);

/** The ONDA four-point sparkle (from the logo). */
export const SPARKLE_PATH = "M12 0C12.9 7.4 16.6 11.1 24 12 16.6 12.9 12.9 16.6 12 24 11.1 16.6 7.4 12.9 0 12 7.4 11.1 11.1 7.4 12 0Z";
export function Sparkle({ size = 24, className = "", style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className} style={style}><path d={SPARKLE_PATH} fill="currentColor" /></svg>;
}

/** Compact ONDA mark for small spots (favicon, tiles): the logo's red sparkle on black. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#140b0d" />
      <path d={SPARKLE_PATH} transform="translate(5 5) scale(0.9167)" fill="#ff2944" />
      <path d={SPARKLE_PATH} transform="translate(21.5 6) scale(0.19)" fill="#ffc2ca" />
    </svg>
  );
}
