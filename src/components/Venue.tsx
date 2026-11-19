import Image from "next/image";

/** ONDA always happens at Tropical Bar. */
export const HOME_VENUE = "Tropical Bar";

/** Tropical Bar's round logo. */
export function VenueLogo({ size = 48, className = "" }: { size?: number; className?: string }) {
  return <Image src="/brand/tropical-bar.png" alt="Tropical Bar" width={size} height={size} className={`shrink-0 select-none rounded-full ${className}`} draggable={false} />;
}

/** "at Tropical Bar" pill used on dark headers. */
export function AtVenue({ venue = HOME_VENUE, className = "" }: { venue?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 rounded-full bg-white/10 py-1.5 pl-1.5 pr-4 text-[14px] font-semibold text-white ${className}`}>
      <VenueLogo size={30} />at {venue}
    </span>
  );
}
