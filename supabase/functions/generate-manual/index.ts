import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseClients.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const SYSTEM_PROMPT =
  `Eres un redactor técnico experto en sistemas ERP y software de gestión. Tu tarea es generar un manual de usuario completo, detallado y profesional para la aplicación "Lift Go" — un sistema de gestión de renta de montacargas.

El manual debe estar en español, ser extremadamente detallado, incluir ejemplos prácticos y flujos de trabajo paso a paso que un usuario real seguiría en su día a día.

Para CADA sección debes incluir:
- Descripción clara del módulo y su propósito
- Lista de campos disponibles con explicación de cada uno
- Pasos numerados para cada acción principal (crear, editar, eliminar, etc.)
- Tips, notas importantes y mejores prácticas
- Ejemplos concretos con datos ficticios realistas
- Workflows relacionados con otros módulos

Usa formato Markdown rico: encabezados ##, ###, listas numeradas, listas con viñetas, **negritas** para campos y botones, y bloques de tip con > para notas importantes.`;

const USER_PROMPT =
  `Genera un manual de usuario completo para la aplicación "Lift Go" con las siguientes 18 secciones. Cada sección debe tener al menos 400 palabras de contenido detallado.

SECCIONES:

1. **Introducción General** — Qué es Lift Go, para quién es, conceptos clave del sistema (equipo, reserva, contrato, factura), roles de usuario disponibles (admin, administrativo, dispatcher, mecánico, auditor, cliente).

2. **Panel Principal (Dashboard)** — Tarjetas de estadísticas (flota total, disponibles, rentados, en mantenimiento), gráfica de flujo de efectivo (facturado vs cobrado por mes), utilización por equipo (% de días rentado), utilización semanal (últimas 12 semanas), alertas de mantenimiento próximo, facturas vencidas. Ejemplo: "Si tienes 10 montacargas y 7 están rentados, verás 70% de utilización".

3. **Calendario** — Vista Gantt que muestra reservas activas por equipo en una línea de tiempo. Vista lista con equipos y sus reservas. Tarjetas de estadísticas: equipos disponibles hoy, reservas activas, por vencer en 7 días, próximas entregas. Cómo identificar huecos de disponibilidad.

4. **Clientes** — Crear cliente con nombre, empresa, RFC, régimen fiscal, uso CFDI, domicilio fiscal CP, representante legal, contacto, teléfono, email, dirección, notas. Editar cliente. Ver detalle con historial de reservas y facturas. Exportar listado a CSV. Datos fiscales necesarios para facturación CFDI.

5. **Cotizaciones** — Crear cotización: seleccionar cliente, equipo, fechas, agregar partidas (descripción, cantidad, precio unitario, clave SAT). Estados: borrador → enviada → aceptada/declinada. Vigencia de la cotización. Convertir cotización aceptada en reserva. Ejemplo de flujo completo.

6. **Reservas** — Crear reserva: seleccionar equipo disponible, cliente, fechas inicio/fin, activar facturación recurrente. Estados: confirmada → completada → cancelada. El equipo cambia a "rentado" automáticamente. Facturación recurrente: genera facturas automáticas cada mes. Cancelar reserva libera el equipo.

7. **Contratos** — Crear contrato vinculado a reserva: número consecutivo automático, ciudad, tarifas (diaria/semanal/mensual), depósito, horas máximas por mes, tarifa hora extra, frecuencia de pago, interés moratorio, testigos, ubicación de uso. Generar PDF con cláusulas legales, checklist de entrega (Anexo A) y pagaré (Anexo B). Plantilla editable desde Configuración. Placeholders dinámicos.

8. **Entregas y Recolecciones** — Programar entrega: fecha, hora, dirección, chofer (del catálogo), teléfono, notas. Tipos: entrega o recolección. Estados: programada → en tránsito → completada. Vincular a reserva. Registrar fecha de completado.

9. **Devoluciones (Inspección de Retorno)** — Seleccionar reserva activa, registrar condición (buena/daño menor/daño mayor), notas de daño, costo de daño, horas usadas, nivel de combustible, inspector. Al completar: reserva pasa a "completada", equipo vuelve a "disponible". Opción de generar factura por daños post-inspección.

10. **Facturas** — Crear factura: número consecutivo, cliente, partidas con clave SAT y unidad SAT, subtotal/IVA/total automáticos. Campos CFDI: serie, folio, forma de pago, método de pago, uso CFDI, moneda, tipo de cambio. Estados: borrador → enviada → pagada → vencida → cancelada. Registrar pagos parciales o totales. Generar facturas recurrentes para reservas activas. Exportar a CSV. Datos del receptor (RFC, razón social, régimen fiscal, CP).

11. **Equipos (Flota)** — Agregar montacargas: nombre, modelo (del catálogo), fabricante, año, número de serie, capacidad kg, altura de mástil, tipo de combustible, tarifas (diaria/semanal/mensual), foto, notas. Estados: disponible → rentado → en mantenimiento → retirado → vendido. Ver detalle con historial de reservas, mantenimientos y cambios de estado. Eliminar equipo (elimina dependencias).

12. **Mantenimiento** — Registrar servicio: seleccionar equipo, tipo de servicio, fecha, mecánico (del catálogo), costo, descripción, fecha de próximo servicio. Ver historial por equipo. Alertas cuando el próximo servicio está dentro de 7 días.

13. **Daños** — Registrar daño: equipo, descripción, costo estimado, costo real, cliente responsable, vincular a reserva e inspección. Estados: reportado → en reparación → reparado → facturado. Vincular a registro de mantenimiento y a factura. Flujo completo: inspección detecta daño → se registra → se repara → se factura al cliente.

14. **Reportes** — Cuatro reportes disponibles: (a) Utilización de flota — % de ocupación por equipo y periodo. (b) Ingresos — total facturado, cobrado y pendiente por periodo. (c) Costos de mantenimiento — gasto por equipo y tipo de servicio. (d) Rentabilidad por modelo — ingresos vs costos por modelo de equipo.

15. **Configuración de Operaciones** — Tres pestañas: (a) Modelos de equipo — catálogo de marcas/modelos con especificaciones default. (b) Operadores/Choferes — nombre, teléfono, email, licencia, activo/inactivo. (c) Mecánicos — nombre, teléfono, email, especialización, activo/inactivo. (d) Plantilla de Contrato — editor de cláusulas, declaraciones, checklist y pagaré con placeholders.

16. **Datos Fiscales de la Empresa** — Configurar: razón social, RFC, régimen fiscal, lugar de expedición, logo. Estos datos se usan automáticamente en facturas y contratos PDF.

17. **Gestión de Usuarios** — Ver usuarios del sistema con su rol y email. Invitar nuevo usuario por email (se le asigna rol dispatcher por default). Cambiar rol de usuario existente. Eliminar usuario. Roles disponibles: admin (acceso total), administrativo (operación completa + configuración), dispatcher (operación sin configuración), mecánico (mantenimiento), auditor (solo lectura), cliente (portal).

18. **Workflows Completos** — Documenta estos flujos de inicio a fin con pasos numerados:
(a) **Flujo de renta completo**: Cotización → Reserva → Contrato → Entrega → Uso → Devolución/Inspección → Facturación → Cobro
(b) **Flujo de facturación recurrente**: Reserva con billing recurrente → Sistema genera factura mensual automática → Registro de pago
(c) **Flujo de daños**: Inspección de retorno detecta daño → Registro de daño → Orden de mantenimiento → Reparación → Factura al cliente
(d) **Flujo de mantenimiento preventivo**: Registro de servicio con próxima fecha → Alerta en dashboard → Equipo pasa a mantenimiento → Se completa → Vuelve a disponible`;

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getAdminClient();

    // Verify user is admin or administrativo
    const token = authHeader.replace("Bearer ", "");
    const anonClient = getCallerClient(req);
    const { data: claimsData, error: claimsError } = await anonClient.auth
      .getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub as string };

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Sin permisos" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY no configurada" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Call Lovable AI with tool calling to get structured JSON
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: USER_PROMPT },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "save_manual",
                description:
                  "Guarda las secciones del manual de usuario generado",
                parameters: {
                  type: "object",
                  properties: {
                    sections: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: {
                            type: "string",
                            description: "Título de la sección",
                          },
                          icon: {
                            type: "string",
                            description:
                              "Nombre del icono lucide-react sugerido (ej: LayoutDashboard, Truck, Users)",
                          },
                          content: {
                            type: "string",
                            description:
                              "Contenido completo de la sección en formato Markdown con al menos 400 palabras",
                          },
                        },
                        required: ["title", "icon", "content"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["sections"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "save_manual" } },
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Límite de solicitudes excedido, intenta más tarde.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({
            error: "Se requieren créditos adicionales para generar el manual.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({ error: "Error al generar el manual con IA" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiData));
      return new Response(
        JSON.stringify({ error: "La IA no retornó el formato esperado" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const parsedArgs = JSON.parse(toolCall.function.arguments);
    const sections = parsedArgs.sections;

    if (!Array.isArray(sections) || sections.length === 0) {
      return new Response(
        JSON.stringify({ error: "No se generaron secciones" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Calculate next version
    const { data: latestManual } = await supabase
      .from("user_manual")
      .select("version")
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();

    let nextVersion = "1.0";
    if (latestManual?.version) {
      const major = parseInt(latestManual.version.split(".")[0], 10);
      nextVersion = `${(isNaN(major) ? 0 : major) + 1}.0`;
    }

    const { data: manual, error: insertError } = await supabase
      .from("user_manual")
      .insert({
        version: nextVersion,
        content: sections,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Error al guardar el manual" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ success: true, manual }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[generate-manual] error:", e);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
