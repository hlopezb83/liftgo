export interface ChangelogEntry {
  version: string;
  date: string;
  type: "major" | "minor" | "patch";
  title: string;
  description: string;
  changes: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: "3.3.0",
    date: "2026-02-26",
    type: "minor",
    title: "Manual de Usuario con IA",
    description: "Nueva sección de Ayuda con un manual de usuario completo generado por inteligencia artificial, con documentación detallada de cada módulo y workflows paso a paso.",
    changes: [
      "Nueva página /help con manual de usuario generado por IA",
      "18 secciones cubriendo todos los módulos de la app",
      "Workflows completos: flujo de renta, facturación recurrente, daños y mantenimiento",
      "Barra de búsqueda para filtrar contenido del manual",
      "Botón de regenerar manual disponible para administradores",
      "Accesible desde el sidebar para todos los roles",
    ],
  },
  {
    version: "3.2.0",
    date: "2026-02-26",
    type: "minor",
    title: "Editor de Plantilla de Contrato",
    description: "Los administradores ahora pueden editar el contenido de contratos, checklist y pagaré desde Configuración de Operaciones, sin modificar código.",
    changes: [
      "Nueva pestaña 'Plantilla de Contrato' en Configuración de Operaciones",
      "Editor de párrafo introductorio, declaraciones, cláusulas, checklist y pagaré",
      "Sistema de placeholders dinámicos ({arrendador}, {tarifa_mensual}, etc.)",
      "Generación de PDF lee la plantilla de la base de datos con fallback al contenido original",
      "Guía visual de placeholders disponibles en la interfaz de edición",
    ],
  },
  {
    version: "3.1.0",
    date: "2026-02-26",
    type: "minor",
    title: "Página de Changelog",
    description: "Nueva página dentro de la app que muestra el historial completo de cambios organizados por versión semántica.",
    changes: [
      "Historial de cambios con versionado semántico (MAJOR.MINOR.PATCH)",
      "Línea de tiempo visual con badges de color por tipo de cambio",
      "Filtros por tipo: Mayor, Menor y Parche",
      "Accesible desde el sidebar para todos los roles",
    ],
  },
  {
    version: "3.0.1",
    date: "2026-02-26",
    type: "patch",
    title: "Representante legal en clientes",
    description: "Se agregó el campo de representante legal en la ficha del cliente, y se integró automáticamente en el contrato y el pagaré.",
    changes: [
      "Nuevo campo 'Representante Legal' en el formulario de clientes",
      "El nombre del representante aparece automáticamente en el contrato PDF",
      "El pagaré (Anexo B) incluye al representante legal como firmante",
    ],
  },
  {
    version: "3.0.0",
    date: "2026-02-25",
    type: "major",
    title: "Contratos profesionales con anexos legales",
    description: "Rediseño completo del módulo de contratos con un machote profesional que incluye cláusulas legales, checklist de entrega y pagaré.",
    changes: [
      "8 cláusulas legales profesionales (objeto, vigencia, renta, obligaciones, etc.)",
      "Anexo A: Checklist de condiciones del equipo al momento de entrega",
      "Anexo B: Pagaré con datos del cliente y montos del contrato",
      "PDF multi-página generado con jsPDF",
      "Plantillas de contrato editables desde Configuración",
      "Testigos configurables por contrato",
    ],
  },
  {
    version: "2.5.1",
    date: "2026-02-24",
    type: "patch",
    title: "Actividad en español",
    description: "El feed de actividad ahora muestra todos los eventos traducidos al español en lugar de inglés.",
    changes: [
      "Traducciones completas del feed de actividad al español",
      "Tipos de evento y descripciones en lenguaje natural",
    ],
  },
  {
    version: "2.5.0",
    date: "2026-02-24",
    type: "minor",
    title: "Rol de auditor",
    description: "Nuevo rol 'auditor' que permite ver toda la información del sistema sin poder modificar nada.",
    changes: [
      "Rol 'auditor' con acceso de solo lectura a todas las secciones",
      "Visible en la gestión de usuarios para asignar a nuevos miembros",
    ],
  },
  {
    version: "2.4.1",
    date: "2026-02-23",
    type: "patch",
    title: "Corrección de permisos de perfil",
    description: "Se corrigió un problema donde los clientes del portal podían ver información de perfiles internos.",
    changes: [
      "Separación de permisos entre perfiles de clientes y personal interno",
      "Los clientes solo ven su propia información",
    ],
  },
  {
    version: "2.4.0",
    date: "2026-02-23",
    type: "minor",
    title: "Rol administrativo",
    description: "Nuevo rol 'administrativo' con permisos completos de operación, similar al dispatcher pero con acceso a configuración.",
    changes: [
      "Rol 'administrativo' con acceso completo a operaciones",
      "Acceso a configuración de empresa y operaciones",
      "Puede gestionar reservas, contratos, facturas y entregas",
    ],
  },
  {
    version: "2.3.1",
    date: "2026-02-23",
    type: "patch",
    title: "Mejoras al dashboard",
    description: "El panel principal ahora muestra información más precisa sobre la flota y su utilización.",
    changes: [
      "Nuevo estado 'vendido' para equipos retirados de la flota activa",
      "Gráfica de utilización semanal en el dashboard",
      "Los equipos retirados ya no se cuentan en las estadísticas de flota",
    ],
  },
  {
    version: "2.3.0",
    date: "2026-02-23",
    type: "minor",
    title: "Portal de clientes",
    description: "Los clientes ahora pueden iniciar sesión en su propio portal para ver sus rentas, facturas y contratos.",
    changes: [
      "Nuevo rol 'customer' para clientes con cuenta",
      "Pantalla de login dedicada para clientes en /portal/login",
      "Dashboard del portal con resumen de cuenta",
      "Vista de facturas y contratos desde la perspectiva del cliente",
      "Invitación de clientes por correo electrónico",
    ],
  },
  {
    version: "2.2.0",
    date: "2026-02-15",
    type: "minor",
    title: "Contratos, pagos y auditoría",
    description: "Se agregaron contratos de renta, registro de pagos parciales/totales, y auditoría detallada de cambios.",
    changes: [
      "Módulo de contratos con número consecutivo automático",
      "Registro de pagos con método, referencia y notas",
      "Auditoría detallada que registra qué campos cambiaron y sus valores anteriores",
      "Estado de factura se actualiza automáticamente al registrar pagos",
    ],
  },
  {
    version: "2.1.0",
    date: "2026-02-15",
    type: "minor",
    title: "Choferes, mecánicos y datos fiscales",
    description: "Nuevos catálogos de choferes y mecánicos, más integración con datos fiscales del SAT para facturación.",
    changes: [
      "Catálogo de choferes con licencia y datos de contacto",
      "Catálogo de mecánicos con especialización",
      "Configuración de datos fiscales de la empresa (RFC, razón social, régimen)",
      "Campos de CFDI en facturas (uso CFDI, forma de pago, método de pago)",
    ],
  },
  {
    version: "2.0.3",
    date: "2026-02-15",
    type: "patch",
    title: "Cancelación de reservas y validaciones",
    description: "Ahora se pueden cancelar reservas activas, y se validó que no haya equipos con nombres o series duplicadas.",
    changes: [
      "Botón de cancelar reserva con confirmación",
      "Validación de nombres únicos en equipos",
      "Validación de números de serie únicos",
    ],
  },
  {
    version: "2.0.2",
    date: "2026-02-14",
    type: "patch",
    title: "Optimización de base de datos",
    description: "Se agregaron índices en las tablas principales para mejorar la velocidad de las consultas.",
    changes: [
      "Índices de rendimiento en reservas, facturas, mantenimiento y más",
      "Mejora en tiempos de carga de listados grandes",
    ],
  },
  {
    version: "2.0.1",
    date: "2026-02-14",
    type: "patch",
    title: "Procedimientos atómicos",
    description: "Las operaciones críticas ahora se ejecutan como transacciones atómicas para evitar datos inconsistentes.",
    changes: [
      "Crear reserva: valida disponibilidad y cambia estado del equipo en una sola transacción",
      "Eliminar equipo: limpia dependencias automáticamente",
      "Completar inspección: cierra reserva y libera equipo de forma atómica",
    ],
  },
  {
    version: "2.0.0",
    date: "2026-02-14",
    type: "major",
    title: "Autenticación, roles y nuevos módulos",
    description: "Gran actualización que agrega sistema de usuarios con roles, cotizaciones, actividad y registro de daños.",
    changes: [
      "Sistema de autenticación con login y registro",
      "Roles de usuario: admin, dispatcher, mecánico",
      "Control de acceso por rol en todas las secciones",
      "Módulo de cotizaciones con número consecutivo",
      "Feed de actividad en tiempo real",
      "Registro de daños vinculado a equipos y reservas",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-02-13",
    type: "minor",
    title: "Devoluciones, entregas y documentos",
    description: "Se completó el flujo operativo con inspecciones de devolución, programación de entregas y adjuntos.",
    changes: [
      "Inspecciones de devolución con checklist de condición",
      "Programación de entregas y recolecciones",
      "Documentos adjuntos en reservas, equipos y clientes",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-02-13",
    type: "minor",
    title: "Clientes, mantenimiento y facturas",
    description: "Se agregaron los módulos de clientes, registro de mantenimiento, facturación y catálogo de modelos.",
    changes: [
      "Catálogo de clientes con datos de contacto",
      "Registro de mantenimiento por equipo",
      "Módulo de facturación con partidas y totales",
      "Catálogo de modelos de equipo con especificaciones por defecto",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-02-12",
    type: "major",
    title: "Lanzamiento inicial",
    description: "Primera versión del sistema con los módulos básicos para gestionar una flota de montacargas en renta.",
    changes: [
      "Catálogo de equipos (montacargas) con estado y especificaciones",
      "Reservas con fechas de inicio y fin",
      "Calendario visual de disponibilidad",
      "Panel principal con estadísticas generales",
    ],
  },
];

export const CURRENT_VERSION = changelog[0].version;
