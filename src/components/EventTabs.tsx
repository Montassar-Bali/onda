import Link from "next/link";
import { IconCash, IconScan, IconTicket, IconUsers } from "./icons";

const tabs = [
  { k: "sell", l: "Sell", I: IconCash },
  { k: "activate", l: "Printed", I: IconTicket },
  { k: "scan", l: "Gate", I: IconScan },
  { k: "reservations", l: "Reserved", I: IconUsers },
] as const;

/** Team event switcher: a rounded pill track, white pill on the active screen. */
export function EventTabs({ eventId, current }: { eventId: string; current: string }) {
  return (
    <nav className="mb-7 grid grid-cols-4 gap-1 rounded-[22px] bg-[var(--track)] p-1.5 sm:inline-grid sm:w-auto sm:rounded-full">
      {tabs.map(({ k, l, I }) => {
        const on = current === k;
        return (
          <Link key={k} href={`/team/${eventId}/${k}`} aria-current={on ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-[12.5px] font-bold transition-all sm:min-h-11 sm:flex-row sm:gap-2 sm:rounded-full sm:px-5 sm:text-[14px] ${on ? "bg-[var(--surface)] text-[var(--primary)] shadow-[0_4px_14px_rgba(40,10,15,0.14)]" : "text-zinc-500 hover:text-zinc-800"}`}>
            <I size={18} />{l}
          </Link>
        );
      })}
    </nav>
  );
}
