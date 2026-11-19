import { prisma } from "@/lib/db";
import { Badge, PageHeader, Section } from "@/components/ui";
import { ActionButton, ApiForm } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const [users, points] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.salesPoint.findMany({ orderBy: { name: "asc" }, include: { members: true } }),
  ]);
  return (
    <>
      <PageHeader title="Team & sales points" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Team members">
          <table className="table mb-4"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
            <tbody>{users.map((u) => <tr key={u.id}><td>{u.name}</td><td className="text-xs">{u.email}</td><td><Badge tone={u.role === "TEAM_LEADER" ? "blue" : "gray"}>{u.role}</Badge>{!u.active && <> <Badge tone="red">INACTIVE</Badge></>}</td>
              <td><ActionButton method="PATCH" path={`/admin/users/${u.id}`} body={{ active: !u.active }} label={u.active ? "Deactivate" : "Activate"} className="btn-secondary py-1 text-xs" /></td></tr>)}</tbody></table>
          <ApiForm path="/admin/users" submitLabel="Add team member" resetOnSuccess className="grid gap-2 sm:grid-cols-2" successMessage="User created">
            <div><label className="label">Name</label><input name="name" className="input" required /></div>
            <div><label className="label">Email</label><input name="email" type="email" className="input" required /></div>
            <div><label className="label">Initial password (≥10 chars)</label><input name="password" type="password" minLength={10} className="input" required autoComplete="new-password" /></div>
            <div><label className="label">Role</label><select name="role" className="input"><option value="TEAM_MEMBER">Team member (seller/scanner)</option><option value="TEAM_LEADER">Team Leader (admin)</option></select></div>
          </ApiForm>
        </Section>
        <Section title="Sales points">
          <div className="space-y-4">
            {points.map((p) => (
              <div key={p.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="font-medium">{p.name} <span className="text-xs text-zinc-500">{p.location}</span></div>
                <ApiForm method="PUT" path={`/admin/sales-points/${p.id}/members`} submitLabel="Save members" className="mt-2 space-y-2">
                  <div className="grid gap-1 sm:grid-cols-2">{users.filter((u) => u.active).map((u) => <label key={u.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="userIds[]" value={u.id} defaultChecked={p.members.some((m) => m.userId === u.id)} /> {u.name}</label>)}</div>
                </ApiForm>
              </div>
            ))}
            <ApiForm path="/admin/sales-points" submitLabel="Add sales point" resetOnSuccess className="grid gap-2 sm:grid-cols-2" successMessage="Sales point created">
              <div><label className="label">Name</label><input name="name" className="input" required /></div>
              <div><label className="label">Location</label><input name="location" className="input" /></div>
            </ApiForm>
          </div>
        </Section>
      </div>
    </>
  );
}
