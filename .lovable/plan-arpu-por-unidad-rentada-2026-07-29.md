# ARPU por unidad rentada

## Situación actual

La tarjeta "ARPU" en la página de MRR divide el MRR total entre los **clientes únicos**. Con los datos de hoy:

- MRR: $396,000 MXN (16 reservas recurrentes confirmadas)
- Clientes únicos: 7
- ARPU mostrado: ~$56,571

El número es alto porque un solo cliente (INDIMEX) concentra 7 unidades. No hay error de suma: es la definición la que no corresponde a lo que se espera leer.

## Cambio

Redefinir el KPI como **renta promedio por unidad rentada**:

- Fórmula: MRR total ÷ número de unidades rentadas (filas activas de MRR)
- Con los datos de hoy: 396,000 / 16 ≈ **$24,750**
- Etiqueta nueva: "Renta prom. / unidad"
- Tooltip con la fórmula explícita para que quede claro de dónde sale el número

## Detalles técnicos

- `src/features/dashboard/components/MrrKpiCluster.tsx`: sustituir el cálculo basado en `uniqueCustomers` por el conteo de unidades (`items.length`, con guardia de división entre cero), actualizar etiqueta y agregar tooltip.
- La versión móvil (`MrrMobileList`) usa el mismo cluster de KPIs, así que hereda el cambio.
- Prueba unitaria nueva para el cálculo (0 unidades → $0; N unidades → MRR/N).
- Changelog: nueva entrada patch en `public/changelog.json` + `public/changelog/v{X.Y.Z}.json`, y sincronizar `package.json` / `version.json`.

## Fuera de alcance

No se toca la RPC `get_mrr_detail` ni la definición de MRR; el total sigue igual.
