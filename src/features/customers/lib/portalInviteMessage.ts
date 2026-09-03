interface PortalInviteMessageInput {
  empresa: string;
  clienteNombre: string;
  link: string;
}

/**
 * Mensaje de invitación al portal de clientes, en español mexicano y con el
 * contexto que la plantilla por defecto de autenticación no da (qué es el
 * portal y qué puede hacer ahí el cliente). Se comparte por el canal que use
 * el staff (correo propio, WhatsApp) mientras no haya dominio de correo.
 */
export function buildPortalInviteMessage({ empresa, clienteNombre, link }: PortalInviteMessageInput): string {
  return [
    `Hola, ${clienteNombre}:`,
    "",
    `Te damos acceso al Portal de Clientes de ${empresa}. Desde ahí puedes:`,
    "• Consultar tus rentas y equipos asignados",
    "• Revisar y descargar tus facturas (PDF y XML)",
    "• Ver tu estado de cuenta y pagos aplicados",
    "",
    "Para activar tu cuenta, entra a este enlace y crea tu contraseña:",
    link,
    "",
    "El enlace es personal y de un solo uso. Si expira, pídenos uno nuevo.",
    "",
    `Equipo ${empresa}`,
  ].join("\n");
}
