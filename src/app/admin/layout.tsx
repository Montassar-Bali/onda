import { pageActor } from "@/server/auth";
import { Shell } from "@/components/Shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await pageActor("TEAM_LEADER");
  return (
    <Shell area="Admin" who={a.name} links={[
      { href: "/admin", label: "Events", icon: "calendar" },
      { href: "/admin/users", label: "Team & sales points", icon: "users" },
      { href: "/admin/identities", label: "Identity lookup", icon: "id" },
      { href: "/admin/audit", label: "Audit log", icon: "log" },
      { href: "/team/account", label: "My account", icon: "id" },
      { href: "/team", label: "Switch to team app", icon: "swap" },
    ]}>{children}</Shell>
  );
}
