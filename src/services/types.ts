import type { Role } from "@prisma/client";
export interface Actor { id: string; role: Role; name: string; ip?: string | null }
