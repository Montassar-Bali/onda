"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconCalendar, IconCash, IconClose, IconHome, IconId, IconLog, IconLogout, IconMenu, IconScan, IconSwap, IconTicket, IconUsers } from "./icons";
import { Logo } from "./Logo";
import type { NavLink, NavIcon } from "./Shell";
import { ThemeButton, ThemeSwitch } from "./ThemeToggle";

const icons: Record<NavIcon, React.ComponentType<{ size?: number }>> = { home: IconHome, calendar: IconCalendar, cash: IconCash, users: IconUsers, id: IconId, log: IconLog, swap: IconSwap, scan: IconScan, ticket: IconTicket };

const screens: Record<string, string> = { sell: "Sell ticket", activate: "Printed ticket", scan: "Gate check-in", reservations: "Reservations", physical: "Printed tickets", cash: "Cash", tickets: "Tickets & comps", settings: "Event settings" };
function screenName(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 3 && (parts[0] === "team" || parts[1] === "events")) return screens[parts[parts.length - 1]];
  return undefined;
}

export function ShellNav({ who, area, links }: { who: string; area: "Admin" | "Team"; links: NavLink[] }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const isActive = (l: NavLink) => (l.exact ? path === l.href : path === l.href || path.startsWith(l.href + "/"));
  const current = [...links].sort((a, b) => b.href.length - a.href.length).find(isActive);
  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); };

  const nav = (
    <>
      <Link href={area === "Admin" ? "/admin" : "/team"} className="flex items-center gap-3 px-2">
        <span className="leading-tight"><Logo height={48} priority className="logo-auto" /><span className="mt-1 block text-[12.5px] font-semibold text-zinc-500">{area === "Admin" ? "Team Leader console" : "Team app"}</span></span>
      </Link>
      <nav className="mt-9 flex flex-col gap-1.5">
        {links.map((l) => {
          const Icon = icons[l.icon];
          const active = current?.href === l.href;
          return (
            <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
              className={`flex h-12 items-center gap-3.5 rounded-2xl px-4 text-[15px] font-semibold transition-all ${active ? "bg-[var(--primary)] text-white shadow-[var(--shadow-primary)]" : "text-zinc-600 hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"}`}>
              <Icon size={20} />{l.label}
            </Link>
          );
        })}
      </nav>
      <ThemeSwitch className="mb-3 mt-auto" />
      <div className="flex items-center gap-3 rounded-2xl bg-[var(--ground)] p-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[15px] font-bold text-white">{who.trim().charAt(0).toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{who}</span><span className="block text-[12px] text-zinc-500">{area === "Admin" ? "Team Leader" : "Signed in"}</span></span>
        <button onClick={signOut} className="grid h-9 w-9 place-items-center rounded-xl text-zinc-500 transition-colors hover:bg-[var(--surface)] hover:text-[var(--negative)]" aria-label="Sign out" title="Sign out"><IconLogout size={18} /></button>
      </div>
    </>
  );

  const teamTabs = [
    { href: "/team", label: "Events", I: IconCalendar, exact: true },
    { href: "/team/go/sell", label: "Sell", I: IconTicket },
    { href: "/team/go/scan", label: "Scan", I: IconScan, fab: true },
    { href: "/team/cash", label: "Cash", I: IconCash },
  ];

  return (
    <>
      {/* phone top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 bar px-4 shadow-[0_2px_16px_rgba(40,10,15,0.06)] md:hidden">
        <Logo height={28} priority className="logo-auto" />
        <span className="truncate text-[16px] font-bold">{screenName(path) ?? current?.label ?? ""}</span>
        <span className="ml-auto"><ThemeButton /></span>
        <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--ground)] text-zinc-700" aria-label="Open menu"><IconMenu size={20} /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)] p-5 md:hidden">
          <button onClick={() => setOpen(false)} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-xl bg-[var(--ground)]" aria-label="Close menu"><IconClose size={20} /></button>
          {nav}
        </div>
      )}

      {/* phone bottom nav (team app) with the floating scan button */}
      {area === "Team" && (
        <nav className="fixed inset-x-0 bottom-0 z-40 rounded-t-[28px] bg-[var(--surface)] px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(40,10,15,0.12)] md:hidden">
          <div className="grid grid-cols-4 items-end">
            {teamTabs.map(({ href, label, I, fab, exact }) => {
              const leaf = href.split("/").pop()!;
              const active = exact ? path === href : href === "/team/cash" ? path.startsWith("/team/cash") : path.endsWith("/" + leaf);
              if (fab) return (
                <Link key={href} href={href} className="flex flex-col items-center gap-1" aria-label="Scan a ticket at the gate">
                  <span className="-mt-8 grid h-16 w-16 place-items-center rounded-full bg-[var(--primary)] text-white shadow-[0_12px_26px_rgba(225,16,42,0.45)] ring-[6px] ring-[var(--surface)] transition-transform active:scale-95"><I size={26} /></span>
                  <span className="text-[12px] font-semibold text-zinc-500">{label}</span>
                </Link>
              );
              return (
                <Link key={href} href={href} className={`flex flex-col items-center gap-1 py-1.5 text-[12px] font-semibold ${active ? "text-[var(--primary)]" : "text-zinc-400"}`}>
                  <I size={23} />{label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-[var(--surface)] px-4 py-7 shadow-[4px_0_30px_rgba(40,10,15,0.05)] md:flex">{nav}</aside>
    </>
  );
}
