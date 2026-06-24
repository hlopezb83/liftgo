## Meses del Estado de Resultados en español

El RPC genera el label del mes con `to_char(..., 'TMmon yy')`, que depende del `lc_time` de Postgres y actualmente devuelve inglés ("Jun 26" en vez de "jun 26").

### Solución

Generar el label en el frontend (TypeScript) usando `Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit" })` a partir de `month_key` (`YYYY-MM`), ignorando el `month_label` que devuelve el RPC. Esto garantiza español sin depender de la configuración de locale del servidor.

### Cambio

- **`src/features/reports/hooks/incomeStatement/useMonthlyData.ts`**: reemplazar el uso de `m.month_label` por un formateador local (`formatMonthLabel(m.month_key)`), capitalizando la primera letra.

### Changelog `v6.91.3` (patch)

- Entrada en `public/changelog.json` + detalle en `public/changelog/v6.91.3.json`.

### Fuera de alcance

- No se toca el RPC; el campo `month_label` queda como string sin usar en el front.