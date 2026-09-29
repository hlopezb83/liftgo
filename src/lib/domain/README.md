# Helpers de dominio compartido

`src/lib/domain/` contiene lógica y tipos compartidos que no pertenecen a una
sola feature. La carpeta está congelada: `scripts/arch-check.sh` rechaza
archivos nuevos que no estén en su allowlist. Para lógica nueva, empieza en
`src/features/<feature>/lib/`; amplía la allowlist sólo con decisión
arquitectónica intencional.

Archivos actuales en la allowlist:

- `activityTranslations.ts`
- `bookingRates.ts`
- `contractTypes.ts`
- `customerTypes.ts`
- `errorCatalog.ts`
- `firstBillingPeriod.ts`
- `invoiceHelpers.ts`
- `invoiceStatus.ts`
- `invoiceTotals.ts`
- `lineItems.ts`
- `nonRentalLines.ts`
- `rentalCalculation.ts`
- `roles.ts`
- `satCatalogs.ts`
- `stateMachines.ts`
- `templateUtils.ts`

La allowlist de `scripts/arch-check.sh` es la fuente de verdad y debe
mantenerse sincronizada con este inventario.
