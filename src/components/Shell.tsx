import { ShellNav } from "./ShellNav";

export type NavIcon = "home" | "calendar" | "cash" | "users" | "id" | "log" | "swap" | "scan" | "ticket";
export interface NavLink { href: string; label: string; icon: NavIcon; exact?: boolean }

export function Shell({ who, links, children, area }: { who: string; area: "Admin" | "Team"; links: NavLink[]; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[256px_minmax(0,1fr)]">
      <ShellNav who={who} area={area} links={links} />
      <main className={`min-w-0 px-4 pt-5 md:px-10 md:pb-16 md:pt-9 ${area === "Team" ? "pb-32" : "pb-16"}`}>
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
