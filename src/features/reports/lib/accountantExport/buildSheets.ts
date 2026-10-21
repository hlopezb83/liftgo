import { isFxMissing } from "@/features/cash-flow";
import { roundMoney, sumMoney, toMxn } from "@/lib/money";
import { assertOptions } from "./model";
import type { Bill, ExportData, ExportOptions, ExportRow, ExportSheet, Invoice, Sections } from "./model";

const isCancelled = (row: { status: string; cfdi_status?: string | null; cancellation_status?: string }) => row.status === "cancelled" || row.cfdi_status === "cancelled" || row.cancellation_status === "accepted";
const environment = (row: Invoice) => row.is_e2e ? "Prueba E2E" : row.facturapi_env === "test" ? "Sandbox" : row.facturapi_env === "live" ? "Producción declarada" : "Desconocido";
const isTest = (row: Invoice) => row.is_e2e || row.facturapi_env === "test";
const documentStatus = (row: { status: string; cfdi_status?: string | null; cancellation_status?: string }) => isCancelled(row) ? "Cancelado" : row.status === "draft" ? "Borrador" : row.status;
const hasCurrency = (code: unknown): code is string => typeof code === "string" && /^[A-Z]{3}$/.test(code) && code !== "XXX";
const normalizedMxn = (amount: number, code: string | null, rate: number | null) =>
  (!hasCurrency((code ?? "MXN").toUpperCase()) || isFxMissing(code, rate)) ? null : roundMoney(toMxn(amount, code, rate));
const currency = (code: string | null) => code == null ? "No registrada" : code.toUpperCase();

function invoiceRow(row: Invoice): ExportRow {

  return { ID: row.id, Folio: row.invoice_number, UUID: row.cfdi_uuid, Fecha: row.issued_at, Vencimiento: row.due_date,
    Cliente: row.receptor_razon_social ?? row.customer_name, "RFC receptor": row.receptor_rfc,
    Serie: row.serie, "Folio fiscal": row.folio, Moneda: currency(row.moneda ?? "MXN"), "Moneda capturada": row.moneda, "Fuente moneda": row.moneda == null ? "MXN por contrato legado de factura" : "Capturada", "TC registrado": row.tipo_cambio,
    Subtotal: row.subtotal, IVA: row.tax_amount, "Tasa IVA capturada": row.tax_rate, "Total original": row.total,
    "Total MXN calculado": normalizedMxn(row.total, row.moneda, row.tipo_cambio),
    Estado: documentStatus(row), "Estado CFDI": row.cfdi_status, "Estado cancelación": row.cancellation_status,
    "Fecha cancelación": row.cancelled_at, "UUID sustitución": row.substitution_uuid, Ambiente: environment(row),
    "Método pago SAT": row.metodo_pago, "Forma pago SAT": row.forma_pago, "Uso CFDI": row.uso_cfdi,
    "Cobertura desde": row.billing_period_start, "Cobertura hasta": row.billing_period_end, "Actualizado UTC": row.updated_at };
}
function billRow(row: Bill): ExportRow {

  return { ID: row.id, Folio: row.bill_number, UUID: row.cfdi_uuid, "Proveedor ID": row.supplier_id,
    "Proveedor nombre actual": row.supplier?.organization_id === row.organization_id ? row.supplier.name : null,
    "Proveedor RFC actual": row.supplier?.organization_id === row.organization_id ? row.supplier.rfc : null,
    "Fuente proveedor": "Catálogo actual autorizado, no snapshot fiscal",
    Fecha: row.issue_date, Vencimiento: row.due_date, Serie: row.serie, "Folio fiscal": row.folio,
    Moneda: currency(row.currency), "TC registrado": row.exchange_rate, Subtotal: row.subtotal, Descuento: row.discount,
    IVA: row.tax_amount, "Retención ISR": row.retention_isr, "Retención IVA": row.retention_iva, "Total original": row.total,
    "Total MXN calculado": normalizedMxn(row.total, row.currency, row.exchange_rate),
    Estado: documentStatus(row), "Estado aprobación": row.approval_status, Ambiente: "No disponible en este registro",
    Categoría: row.category, Descripción: row.description, "Cobertura desde": row.coverage_start, "Cobertura hasta": row.coverage_end,
    "Método pago SAT": row.payment_method_sat, "Forma pago SAT": row.payment_form_sat, "Uso CFDI": row.cfdi_use,
    "Tipo comprobante": row.tipo_comprobante, "Gasto legado ID": row.legacy_expense_id, "Actualizado UTC": row.updated_at };
}

export function buildAccountantSheets(options: ExportOptions, data: ExportData,
  company: { razon_social: string; rfc: string }, permissions: Sections): ExportSheet[] {
  assertOptions(options, permissions);
  validateAmounts(data);
  const sheets: ExportSheet[] = [];
  const invoices = new Map([...data.invoices, ...data.invoiceReferences].map((row) => [row.id, row]));
  const bills = new Map([...data.bills, ...data.billReferences].map((row) => [row.id, row]));
  const references = new Map<string, ExportRow>();
  let omittedDrafts = 0; let omittedTests = 0;
  const allowed = (draft: boolean, test: boolean) => {
    if (test && !options.includeTest) { omittedTests++; return false; }
    if (draft && !options.includeDrafts) { omittedDrafts++; return false; }
    return true;
  };
  const addSheet = (name: string, rows: ExportRow[]) => sheets.push({ name, rows: rows.map((row) => ({ "Empresa ID": options.organizationId, Alcance: "Periodo", ...row })), headers: ["Empresa ID", "Alcance", "ID"] });
  const invoiceParent = (id: string) => { const row = invoices.get(id); if (!row) throw new Error("Factura relacionada no disponible."); return row; };
  const billParent = (id: string) => { const row = bills.get(id); if (!row) throw new Error("Factura de proveedor relacionada no disponible."); return row; };
  const addReference = (type: string, row: Invoice | Bill) => {
    const date = "issued_at" in row ? row.issued_at : row.issue_date;
    if (date >= options.start && date <= options.end) return;
    references.set(`${type}:${row.id}`, { "Empresa ID": options.organizationId, Alcance: "Referencia fuera del periodo; no sumable", Tipo: type,
      ID: row.id, Folio: "invoice_number" in row ? row.invoice_number : row.bill_number, UUID: row.cfdi_uuid,
      Fecha: date, Moneda: "moneda" in row ? currency(row.moneda) : row.currency });
  };
  if (options.sections.sales) {
    addSheet("Ventas", data.invoices.filter((row) => allowed(row.status === "draft", isTest(row))).map(invoiceRow));
    addSheet("Notas de crédito", data.credits.flatMap((row) => {
      const parent = invoiceParent(row.invoice_id);
      if (!allowed(row.status === "draft", isTest(parent))) return [];
      addReference("Factura", parent);
      return [{ ID: row.id, Folio: row.credit_note_number, "Factura ID": row.invoice_id, "Factura folio": parent.invoice_number,
        UUID: row.cfdi_uuid, Fecha: row.issued_at, Moneda: row.currency, Subtotal: row.subtotal, IVA: row.tax_amount, "Tasa IVA capturada": row.tax_rate, "Total original": row.total,
        Naturaleza: "Crédito; importes originales positivos", "TC factura referencia": parent.tipo_cambio,
        "TC propio": "No disponible; no se calcula conversión", Estado: documentStatus(row), "Estado factura": documentStatus(parent), "Estado CFDI": row.cfdi_status,
        "Estado cancelación": row.cancellation_status, "Fecha cancelación": row.cancelled_at, "UUID sustitución": row.substitution_uuid,
        Ambiente: environment(parent), "Fuente ambiente": "Heredado de factura", Motivo: row.motive, "Actualizado UTC": row.updated_at }];
    }));
    const payments = data.payments.filter((row) => {
      const parent = invoiceParent(row.invoice_id);
      return allowed(parent.status === "draft", row.is_e2e || isTest(parent));
    });
    addSheet("Cobros", payments.map((row) => {
      const parent = invoiceParent(row.invoice_id); addReference("Factura", parent);
      return { ID: row.id, "Factura ID": row.invoice_id, "Factura folio": parent.invoice_number, Fecha: row.payment_date,
        Moneda: currency(row.currency ?? parent.moneda ?? "MXN"), "Moneda capturada": row.currency, "Fuente moneda": row.currency == null ? "Heredada de factura" : "Capturada en cobro", "TC registrado": row.exchange_rate, "Total original": row.amount,
        "Importe MXN persistido": row.amount_mxn, Estado: "Cobro registrado", "Estado factura": documentStatus(parent),
        Ambiente: row.is_e2e ? "Prueba E2E" : environment(parent), "Fuente ambiente": "Heredado de factura o E2E del cobro",
        "Método pago": row.payment_method, "Forma pago SAT": row.payment_form_sat, Referencia: row.reference_number,
        Parcialidad: row.installment_number, "Saldo anterior registrado": row.prior_balance, "UUID REP": row.rep_cfdi_uuid,
        "Estado REP": row.rep_cfdi_status, "Cancelación REP": row.rep_cancellation_status };
    }));
    addSheet("REP asociados a cobros", payments.filter((row) => row.rep_cfdi_uuid || row.rep_number || row.rep_folio).map((row) => ({
      "Cobro ID": row.id, "Factura ID": row.invoice_id, "Fecha cobro": row.payment_date, "REP folio": row.rep_number ?? row.rep_folio,
      UUID: row.rep_cfdi_uuid, Estado: row.rep_cfdi_status, "Estado cancelación": row.rep_cancellation_status,
      "Fecha cancelación": row.rep_cancelled_at, "UUID sustitución": row.rep_substitution_uuid,
      "Importe referencia no sumable": row.amount, Moneda: currency(row.currency ?? invoiceParent(row.invoice_id).moneda ?? "MXN"), "Moneda capturada": row.currency, Parcialidad: row.installment_number,
    })));
  }
  if (options.sections.purchases) {
    addSheet("Compras", data.bills.filter((row) => allowed(row.status === "draft", false)).map(billRow));
    addSheet("Pagos proveedores", data.supplierPayments.filter((row) => allowed(billParent(row.bill_id).status === "draft", false)).map((row) => {
      const parent = billParent(row.bill_id); addReference("Proveedor", parent);
      return { ID: row.id, "Factura proveedor ID": row.bill_id, "Factura folio": parent.bill_number, Fecha: row.payment_date,
        Moneda: parent.currency, "Fuente moneda": "Heredada de factura", "TC factura referencia": parent.exchange_rate,
        "Total original": row.amount, Estado: "Pago registrado", "Estado factura": documentStatus(parent), Ambiente: "No disponible en este registro",
        "Método pago": row.payment_method, Referencia: row.reference, "REP requerido": row.rep_required,
        "Estado REP recibido": row.rep_status, "UUID REP recibido": row.rep_cfdi_uuid, "Fecha recepción REP": row.rep_received_at };
    }));
  }
  if (options.sections.expenses) addSheet("Gastos operativos", data.expenses.map((row) => ({
    ID: row.id, Fecha: row.expense_date, Categoría: row.category, Descripción: row.description, "Proveedor ID": row.supplier_id,
    "Factura proveedor ID": row.supplier_bill_id, UUID: row.cfdi_uuid, "Importe registrado": row.amount,
    Moneda: "No desglosada en origen", "IVA": "No desglosado en origen", "Vínculo": row.supplier_bill_id ? "Vinculado; no sumar a Compras" : "Sin vínculo explícito",
    "Actualizado UTC": row.updated_at,
  })));
  sheets.push({ name: "Referencias", rows: [...references.values()], headers: ["Empresa ID", "Alcance", "Tipo", "ID", "Folio", "UUID", "Fecha", "Moneda"] });
  for (const sheet of sheets) for (const row of sheet.rows) {
    if (typeof row["Total original"] === "number" && !hasCurrency(row.Moneda)) row["Advertencia moneda"] = "Moneda no verificable; importe excluido de totales";
  }
  const controls = buildControls(options, data, company, permissions, sheets, omittedDrafts, omittedTests);
  return [{ name: "Control", rows: controls }, { name: "Totales por hecho", rows: groupedTotals(sheets), headers: ["Hoja", "Moneda", "Estado", "Ambiente", "Registros", "Total original"] }, ...sheets];
}

function groupedTotals(sheets: ExportSheet[]): ExportRow[] {
  const groups = new Map<string, { row: ExportRow; amounts: number[] }>();
  for (const sheet of sheets) for (const row of sheet.rows) {
    if (typeof row["Total original"] !== "number") continue;
    if (!Number.isFinite(row["Total original"])) throw new Error("Importe no válido; exportación detenida.");
    if (!hasCurrency(row.Moneda)) continue;
    const key = JSON.stringify([sheet.name, row.Moneda, row.Estado, row.Ambiente]);
    const current = groups.get(key) ?? { row: { Hoja: sheet.name, Moneda: row.Moneda, Estado: row.Estado, Ambiente: row.Ambiente }, amounts: [] };
    current.amounts.push(row["Total original"]);
    groups.set(key, current);
  }
  return [...groups.values()].map(({ row, amounts }) => ({ ...row, Registros: amounts.length, "Total original": sumMoney(amounts) }));
}

function buildControls(options: ExportOptions, data: ExportData, company: { razon_social: string; rfc: string }, permissions: Sections, sheets: ExportSheet[], drafts: number, tests: number): ExportRow[] {
  const controls: ExportRow[] = [
    { Concepto: "Formato", Valor: "LiftGO paquete operativo para contador v1" },
    { Concepto: "Empresa", Valor: company.razon_social }, { Concepto: "RFC empresa", Valor: company.rfc },
    { Concepto: "Empresa ID", Valor: options.organizationId }, { Concepto: "Desde", Valor: options.start }, { Concepto: "Hasta", Valor: options.end },
    { Concepto: "Inicio extracción UTC", Valor: data.startedAt }, { Concepto: "Fin extracción UTC", Valor: data.finishedAt },
    { Concepto: "Naturaleza", Valor: "Datos operativos, no balanza ni pólizas. No garantiza importación directa a CONTPAQi." },
    { Concepto: "Consistencia", Valor: "Consulta paginada, no snapshot transaccional ni cierre bloqueado. Puede haber cambios durante la extracción; verificar antes del cierre oficial." },
    { Concepto: "Totales", Valor: "Cada hoja representa un hecho distinto. NO sumar facturas, notas, cobros, REP y pagos entre sí. Cancelados separados por estado; no representan operaciones vigentes." },
    { Concepto: "Fechas", Valor: "Fechas civiles inclusivas persistidas: ventas/NC por emisión; compras por emisión; cobros/pagos por fecha de pago; gastos por fecha del gasto. Referencias externas al periodo no sumables." },
    { Concepto: "REP", Valor: "REP asociados a cobros del periodo, no por fecha de timbrado. Cancelar REP no equivale a devolver el cobro. Folio/UUID vacío no se fabrica." },
    { Concepto: "Monedas", Valor: "Totales por moneda original. NC sin TC propio; pagos proveedor heredan moneda. Conversión MXN de ventas/compras sólo con TC válido, nunca tasa1 supuesta para divisas." },
    { Concepto: "Gastos legados", Valor: "Sólo gastos con empresa explícita verificada. No se atribuyen registros sin empresa por texto/proveedor. Importes sin IVA/moneda separados; vínculos no se suman otra vez a Compras." },
    { Concepto: "Ambiente", Valor: "Sandbox/E2E conocidos se excluyen salvo selección. Ambiente ausente permanece desconocido, no equivale a producción. Proveedores no guardan ambiente fiscal." },
    { Concepto: "Borradores omitidos por filtro", Valor: drafts }, { Concepto: "Filas prueba omitidas por filtro", Valor: tests },
    { Concepto: "Archivos", Valor: "Esta entrega contiene Excel, no XML/PDF adjuntos. No realiza llamadas al PAC ni envía información a terceros." },
  ];
  for (const sheet of sheets) {
    controls.push({ Concepto: `Importes no sumables por moneda no verificable: ${sheet.name}`, Valor: sheet.rows.filter((row) => typeof row["Total original"] === "number" && !hasCurrency(row.Moneda)).length });
    const documents = ["Ventas", "Notas de crédito", "Compras", "REP asociados a cobros"].includes(sheet.name);
    if (documents) controls.push({ Concepto: `UUID no disponible: ${sheet.name}`, Valor: sheet.rows.filter((row) => !row.UUID).length });
    if (["Ventas", "Compras"].includes(sheet.name)) controls.push({ Concepto: `Conversión MXN no disponible: ${sheet.name}`, Valor: sheet.rows.filter((row) => row["Total MXN calculado"] === null).length });
    if (sheet.name === "Cobros") {
      controls.push({ Concepto: "Cobros sin UUID REP", Valor: sheet.rows.filter((row) => !row["UUID REP"]).length });
      controls.push({ Concepto: "Cobros sin moneda efectiva", Valor: sheet.rows.filter((row) => !hasCurrency(row.Moneda)).length });
      controls.push({ Concepto: "Cobros con TC registrado no utilizable en divisa", Valor: sheet.rows.filter((row) => isFxMissing(String(row.Moneda), typeof row["TC registrado"] === "number" ? row["TC registrado"] : null)).length });
    }
    if (sheet.name === "Compras") controls.push({ Concepto: "Compras sin RFC proveedor verificable en catálogo actual", Valor: sheet.rows.filter((row) => !row["Proveedor RFC actual"]).length });
  }
  for (const key of Object.keys(options.sections) as (keyof Sections)[]) controls.push({ Concepto: `Sección ${key}`, Valor: !permissions[key] ? "No incluida: sin permiso" : options.sections[key] ? "Incluida" : "No solicitada" });
  for (const sheet of sheets) controls.push({ Concepto: `Filas ${sheet.name}`, Valor: sheet.rows.length });
  return controls;
}

function validateAmounts(data: ExportData) {
  const amounts = [
    ...data.invoices.flatMap((row) => [row.subtotal, row.tax_amount, row.total]),
    ...data.credits.flatMap((row) => [row.subtotal, row.tax_amount, row.total]),
    ...data.bills.flatMap((row) => [row.subtotal, row.tax_amount, row.discount, row.retention_isr, row.retention_iva, row.total]),
    ...data.payments.map((row) => row.amount), ...data.supplierPayments.map((row) => row.amount), ...data.expenses.map((row) => row.amount),
  ];
  if (amounts.some((value) => typeof value !== "number" || !Number.isFinite(value))) throw new Error("Importe no válido en los datos de origen. No se generó el archivo.");
}
