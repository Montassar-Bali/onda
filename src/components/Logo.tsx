import Image from "next/image";

/** The ONDA logo (transparent PNG, 1615×794). Pass a height; the width follows the logo's 2.03:1 ratio. */
export function Logo({ height = 40, className = "", priority = false }: { height?: number; className?: string; priority?: boolean }) {
  return <Image src="/brand/onda-logo.png" alt="ONDA" width={Math.round(height * 2.034)} height={height} priority={priority} className={`select-none ${className}`} draggable={false} />;
}
