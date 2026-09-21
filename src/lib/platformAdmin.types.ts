/**
 * Contratos públicos de la operación de plataforma (alta/suspensión de
 * empresas). Extraído de `platformAdmin.functions.ts` sin cambios de forma:
 * lo consumen tanto los server functions como la UI de plataforma.
 */
export interface PlatformOrganizationRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  internal_members: number;
  portal_accounts: number;
  customers: number;
}

export interface PlatformOperatorStatus {
  isOperator: boolean;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  admin_email: string;
  admin_full_name: string;
  /**
   * Contraseña inicial opcional del primer administrador. Si viene vacía o no
   * se envía, el servidor genera una aleatoria y entrega un enlace de acceso.
   */
  admin_password?: string;
}

export interface CreateOrganizationResult {
  success: true;
  organization_id: string;
  admin_user_id: string;
  admin_email: string;
  /** Enlace de un solo uso para que el primer administrador defina su contraseña. */
  recovery_link: string | null;
  /** `true` cuando el operador definió la contraseña inicial manualmente. */
  password_set_manually: boolean;
}


export interface SetOrganizationActiveInput {
  organization_id: string;
  active: boolean;
}
