import { pageActor } from "@/server/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Section, fmtDateTime } from "@/components/ui";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const actor = await pageActor();
  const sessions = await prisma.session.findMany({ where: { userId: actor.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 10 });
  return (
    <>
      <PageHeader title="My account" subtitle={actor.name} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Change password"><PasswordForm /></Section>
        <Section title={`Signed-in devices (${sessions.length})`}>
          <ul className="space-y-3 text-[14px]">
            {sessions.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 border-b border-[var(--rule)] pb-3 last:border-0">
                <span className="truncate text-zinc-600">{s.userAgent?.replace(/\(.*?\)/g, "").slice(0, 60) || "Unknown device"}</span>
                <span className="shrink-0 text-zinc-500">{fmtDateTime(s.createdAt)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-zinc-500">Changing your password signs out every other device.</p>
        </Section>
      </div>
    </>
  );
}
