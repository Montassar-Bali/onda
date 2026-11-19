"use client";
import { useRouter } from "next/navigation";
import { ApiForm } from "@/components/client";
import { EventFields } from "@/components/EventFields";

export default function NewEvent() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">New event</h1>
      <div className="card"><ApiForm path="/admin/events" submitLabel="Create draft event" onDone={(e) => router.push(`/admin/events/${e.id}/settings`)}><EventFields /></ApiForm></div>
    </div>
  );
}
