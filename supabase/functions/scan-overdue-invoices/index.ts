// Edge function: scan-overdue-invoices
// Recorre facturas vencidas y, según los días transcurridos desde la fecha de vencimiento,
// crea notificaciones in-app a los administradores y (cuando email infra esté lista)
// envía recordatorios al cliente. Idempotente vía tabla collection_reminders_log.
//
// Programada con pg_cron diariamente a las 9:00 AM hora Monterrey.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const REMINDER_THRESHOLDS = [
  { type: "reminder_3", days: 3, label: "+3 días" },
  { type: "reminder_7", days: 7, label: "+7 días" },
  { type: "reminder_15", days: 15, label: "+15 días" },
];

interface OverdueInvoice {
  id: string;
  invoice_number: string;
  total: number;
  due_date: string;
  customer_id: string | null;
  customer_name: string | null;
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Hora Monterrey
    const now = new Date();
    const today = new Date(now.toLocaleString("en-US", { timeZone: "America/Monterrey" }));
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString().split("T")[0];

    // Cargar todas las facturas vencidas (sent o partial con due_date < hoy)
    const { data: invoices, error } = await adminClient
      .from("invoices")
      .select("id, invoice_number, total, due_date, customer_id, customer_name")
      .in("status", ["sent", "partial"])
      .lt("due_date", todayIso)
      .order("due_date", { ascending: true });

    if (error) throw error;

    const overdueList = (invoices ?? []) as OverdueInvoice[];
    let remindersCreated = 0;
    let notificationsCreated = 0;
    const errors: string[] = [];

    for (const inv of overdueList) {
      const dueDate = new Date(inv.due_date + "T00:00:00");
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      // Verificar qué umbrales aplican
      for (const threshold of REMINDER_THRESHOLDS) {
        if (daysOverdue < threshold.days) continue;

        // Idempotencia: ya enviado?
        const { data: existing } = await adminClient
          .from("collection_reminders_log")
          .select("id")
          .eq("invoice_id", inv.id)
          .eq("reminder_type", threshold.type)
          .maybeSingle();

        if (existing) continue;

        // Buscar email del cliente
        let customerEmail: string | null = null;
        if (inv.customer_id) {
          const { data: cust } = await adminClient
            .from("customers")
            .select("email")
            .eq("id", inv.customer_id)
            .maybeSingle();
          customerEmail = cust?.email ?? null;
        }

        // Crear notificación in-app a admins
        await adminClient.rpc("notify_admins", {
          p_type: "invoice_overdue",
          p_title: `Factura vencida ${threshold.label}`,
          p_message: `${inv.invoice_number} de ${inv.customer_name ?? "Cliente"} — $${Number(inv.total).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN — ${daysOverdue} días vencida`,
          p_link: `/invoices/${inv.id}`,
          p_entity_type: "invoice",
          p_entity_id: inv.id,
        });
        notificationsCreated++;

        // Intentar enviar email transaccional al cliente
        let emailStatus = "skipped_no_email";
        let errorMessage: string | null = null;

        if (customerEmail) {
          try {
            // Llamar a send-transactional-email si existe; si no, solo log.
            const { error: invokeErr } = await adminClient.functions.invoke(
              "send-transactional-email",
              {
                body: {
                  templateName: "collection-reminder",
                  recipientEmail: customerEmail,
                  idempotencyKey: `${threshold.type}-${inv.id}`,
                  templateData: {
                    customerName: inv.customer_name ?? "Cliente",
                    invoiceNumber: inv.invoice_number,
                    amount: Number(inv.total).toLocaleString("es-MX", { minimumFractionDigits: 2 }),
                    daysOverdue,
                    dueDate: inv.due_date,
                  },
                },
              }
            );
            if (invokeErr) {
              emailStatus = "failed";
              errorMessage = invokeErr.message;
            } else {
              emailStatus = "sent";
            }
          } catch (e) {
            emailStatus = "failed";
            errorMessage = e instanceof Error ? e.message : String(e);
            errors.push(`${inv.invoice_number}: ${errorMessage}`);
          }
        }

        // Registrar en log
        await adminClient.from("collection_reminders_log").insert({
          invoice_id: inv.id,
          reminder_type: threshold.type,
          recipient_email: customerEmail ?? "",
          email_status: emailStatus,
          error_message: errorMessage,
        });

        remindersCreated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: overdueList.length,
        reminders_created: remindersCreated,
        notifications_created: notificationsCreated,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("scan-overdue-invoices error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
