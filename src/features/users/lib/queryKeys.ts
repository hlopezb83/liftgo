import { createEntityKeys } from "@/lib/query/createEntityKeys";
import type { AppRole } from "../hooks/useUserRole";

export interface UserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  /** Bloque 5.2 (R4): puede ser null cuando el trigger de user_roles no
   *  disparó o la fila fue removida. La UI muestra "Sin rol" con badge de
   *  advertencia — no inventamos `dispatcher` como antes. */
  role: AppRole | null;
  is_active: boolean;
}

export interface UsersFilter extends Record<string, unknown> {
  role?: AppRole;
  isActive?: boolean;
}

export const userKeys = createEntityKeys("users");
