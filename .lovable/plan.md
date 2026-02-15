

# CFDI 4.0 Compatible Invoicing

## Overview

This plan adds the data fields and workflows needed for Mexican CFDI 4.0 compliance. Full CFDI requires a PAC (authorized certification provider) for XML stamping, which is an external service integration. This plan focuses on **preparing the data model, UI, and an edge function integration point** so the system captures all required SAT information and can connect to a PAC when ready.

---

## What Changes

### Phase 1: Database -- Add CFDI Fields

**Issuer settings table** (`company_settings`): stores your business fiscal data (only one row needed).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Single row |
| rfc | text NOT NULL | Issuer RFC (e.g. "XAXX010101000") |
| razon_social | text NOT NULL | Legal business name |
| regimen_fiscal | text NOT NULL | SAT fiscal regime code (e.g. "601") |
| lugar_expedicion | text NOT NULL | Postal code where invoices are issued |
| logo_url | text | Optional logo |

**Customer table updates** -- add columns to `customers`:

| New Column | Type | Notes |
|------------|------|-------|
| rfc | text | Receiver RFC |
| regimen_fiscal | text | Receiver fiscal regime code |
| uso_cfdi | text | Default CFDI usage code (e.g. "G03" for general expenses) |
| domicilio_fiscal_cp | text | Receiver fiscal postal code |

**Invoice table updates** -- add columns to `invoices`:

| New Column | Type | Notes |
|------------|------|-------|
| serie | text | Invoice series (e.g. "A") |
| folio | text | Sequential folio within series |
| forma_pago | text | Payment form code (e.g. "01" = cash, "03" = transfer) |
| metodo_pago | text | "PUE" (single payment) or "PPD" (installments) |
| uso_cfdi | text | CFDI usage code for this invoice |
| moneda | text DEFAULT 'MXN' | Currency code |
| tipo_cambio | numeric | Exchange rate (1 if MXN) |
| receptor_rfc | text | Receiver RFC (snapshot) |
| receptor_razon_social | text | Receiver legal name (snapshot) |
| receptor_regimen_fiscal | text | Receiver fiscal regime |
| receptor_domicilio_fiscal_cp | text | Receiver fiscal postal code |
| cfdi_uuid | uuid | UUID returned by the PAC after stamping |
| cfdi_xml | text | Signed XML returned by PAC |
| cfdi_status | text DEFAULT 'pending' | pending / stamped / cancelled |
| cancelled_at | timestamptz | When cancellation was processed |
| cancellation_reason | text | SAT cancellation reason code |

**Line items** (stored in JSONB `line_items`) -- each item will gain:
- `clave_prod_serv` -- SAT product/service catalog code (e.g. "78181500" for equipment rental)
- `clave_unidad` -- SAT unit code (e.g. "E48" = service unit, "DAY" = day)
- `objeto_imp` -- Tax object code ("02" = taxable)

### Phase 2: SAT Catalog Reference Tables

Create a `sat_catalog` table (or hardcoded constants) for the most-used codes:
- Fiscal regimes (c_RegimenFiscal)
- CFDI usage codes (c_UsoCFDI)
- Payment form codes (c_FormaPago)
- Payment method codes (c_MetodoPago)
- Common product/service keys for rental equipment

These will populate dropdowns in the UI so users pick from valid SAT codes instead of typing them.

### Phase 3: UI Updates

**Company Settings page** (new, under Settings):
- Form to enter issuer RFC, legal name, fiscal regime, postal code
- Single-row table, edit-in-place

**Customer form** (`CustomersPage.tsx`):
- Add RFC, fiscal regime, CFDI usage, and fiscal postal code fields

**Invoice form** (`InvoiceForm.tsx`):
- Add section for CFDI fields: serie, folio, payment form, payment method, CFDI usage, currency
- Auto-populate receiver fields from the selected customer
- Line item table gains SAT code columns (product key, unit key)
- Default product key to "78181500" (equipment rental) and unit to "DAY"

**Invoice detail** (`InvoiceDetail.tsx`):
- Display CFDI status badge (pending / stamped / cancelled)
- Show CFDI UUID when stamped
- Add "Stamp with PAC" button (calls edge function)
- Add "Cancel CFDI" button with reason selector
- Add "Download XML" button when stamped

**PDF generation** (`InvoicePDFButton.tsx`):
- Include issuer and receiver RFC, fiscal regimes
- Show CFDI UUID, serie/folio
- Add SAT-required QR code placeholder area
- Change currency symbol from Euro to $ (MXN)

### Phase 4: PAC Integration Edge Function

Create `supabase/functions/stamp-cfdi/index.ts`:
- Accepts an invoice ID
- Reads invoice + company settings + line items
- Builds CFDI 4.0 XML structure
- Sends to PAC API for stamping (initially stubbed -- returns mock UUID)
- Stores the returned UUID and signed XML back in the invoice record
- The PAC provider (Facturama, Finkok, etc.) can be configured later via a secret

Create `supabase/functions/cancel-cfdi/index.ts`:
- Accepts invoice ID + cancellation reason code
- Calls PAC cancellation API
- Updates invoice status to "cancelled"

### Phase 5: Cancellation Workflow

- CFDI 4.0 requires cancellation requests to go through SAT
- Add cancellation reason dropdown (SAT codes: "01" = receipt with errors, "02" = receipt without need, "03" = related operation cancelled, "04" = related to global invoice)
- For invoices > $1,000 MXN, SAT requires receiver approval -- display a warning

---

## Technical Details

### Files to create
- `supabase/functions/stamp-cfdi/index.ts` -- PAC stamping edge function (initially stubbed)
- `supabase/functions/cancel-cfdi/index.ts` -- PAC cancellation edge function (initially stubbed)
- `src/lib/satCatalogs.ts` -- Hardcoded SAT catalog constants for dropdowns
- `src/hooks/useCompanySettings.ts` -- CRUD hook for company_settings table
- `src/pages/CompanySettingsPage.tsx` -- Issuer fiscal data form

### Files to modify
- **Database migration** -- add `company_settings` table, add columns to `customers` and `invoices`
- `src/pages/CustomersPage.tsx` -- add RFC and fiscal fields to customer form
- `src/pages/InvoiceForm.tsx` -- add CFDI fields section, SAT codes on line items
- `src/pages/InvoiceDetail.tsx` -- add CFDI status, stamp/cancel buttons, XML download
- `src/components/InvoicePDFButton.tsx` -- include CFDI data in PDF, fix currency to MXN
- `src/components/PostInspectionInvoiceDialog.tsx` -- pass default CFDI fields
- `src/components/AppSidebar.tsx` -- add Company Settings nav item
- `src/App.tsx` -- add route for company settings

### PAC Integration Note
The edge functions will initially use a **stub mode** that generates a mock CFDI UUID without calling a real PAC. When you are ready to go live, you will need to:
1. Choose a PAC provider (Facturama, Finkok, or Digibox are popular options)
2. Add the PAC API key as a secret
3. Upload your CSD (digital certificate) files
4. Update the edge function to call the real PAC API

This approach lets you build and test the full workflow now, and "flip the switch" to real stamping later.

