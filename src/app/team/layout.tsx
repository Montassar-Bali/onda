import { pageActor } from "@/server/auth";
import { Shell, type NavLink } from "@/components/Shell";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const a = await pageActor();
  const links: NavLink[] = [{ href: "/team", label: "My events", icon: "calendar", exact: false }, { href: "/team/cash", label: "My cash", icon: "cash" }, { href: "/team/account", label: "My account", icon: "id" }];
  if (a.role === "TEAM_LEADER") links.push({ href: "/admin", label: "Team Leader console", icon: "swap" });
  return <Shell area="Team" who={a.name} links={links}>{children}</Shell>;
}
