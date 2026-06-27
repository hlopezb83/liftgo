Fix unit key (ClaveUnidad) dropdown labels in invoice line items.

Problem
-------
In `EditableLineItemsTable.tsx`, the `clave_unidad` `<Select>` renders only the raw code (`c.code`) instead of the descriptive label (`c.label`). The `satCatalogs.ts` already contains Spanish descriptions (e.g., "DAY - Día", "MON - Mes"), but they are not displayed.

Change
------
Update the `SelectItem` mapping for `CLAVE_UNIDAD` in `src/features/invoices/components/invoice-form/EditableLineItemsTable.tsx` to render `c.label` instead of `c.code`, matching the `CLAVE_PROD_SERV` dropdown pattern.