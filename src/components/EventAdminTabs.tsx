import Link from "next/link";
export function EventAdminTabs({ id, current }: { id: string; current: string }) {
  const tabs = [["", "Overview"], ["cash", "Cash reconciliation"], ["physical", "Printed tickets"], ["tickets", "Tickets & comps"], ["settings", "Settings"]];
  return (
    <nav className="tabs mb-7">
      {tabs.map(([k, l]) => <Link key={k} href={`/admin/events/${id}${k ? "/" + k : ""}`} aria-current={current === k ? "page" : undefined}>{l}</Link>)}
    </nav>
  );
}
