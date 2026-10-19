# N7/N8: pagos por API autenticada en el gate A/B

`payment-currency-api.spec.ts` usa el Supabase local efímero del workflow
`multi-tenant-ab.yml`, con las migraciones oficiales y el arnés existente.
Cada caso inicia sesión mediante `createLocalUserClient` y realiza las
operaciones de factura y pago con el SDK normal, sujeto a RLS.

| Caso | Factura independiente | Operación | Pagado USD | Saldo USD |
| --- | --- | --- | --- | --- |
| N7 | USD 100, TC 17.5 | Dos pagos de MXN 1 | 0.12 | 99.88 |
| N8 | USD 100, TC 17.5 | Pago de MXN 175 | 10.00 | 90.00 |
| N8 | Misma factura N8 | Editar a MXN 350 | 20.00 | 80.00 |
| N8 | Misma factura N8 | Editar a MXN 1750.08 | 100.00 | 0.00 |
| N8 | Misma factura N8 | Intentar MXN 1750.09 | Rechazo `23514`; persistencia sin cambios | |

Las facturas son sintéticas, sin timbrado, REP ni llamadas a Facturapi.
El caso N8 no comparte la factura ni los pagos de N7. Los controles comprueban
identidad autenticada, organización, aislamiento de la empresa B y los valores
persistidos en pagos, factura y `v_invoices_with_balance`. La limpieza utiliza
el mismo SDK autenticado y exige confirmar los registros eliminados.

La suite conserva las guardas de producción y de loopback sin cambios. No
requiere instalar servicios en ASUS: el entorno local no dispone de Docker ni
Supabase operativo. La ejecución corresponde al gate CI existente:

```sh
bun run typecheck:browser-tests
bun run test:multitenant-ab
```

El segundo comando requiere el backend efímero y las variables locales que ya
prepara el workflow; no se debe ejecutar apuntando a un backend publicado.
El reporte JUnit/JSON y la matriz A/B del workflow registran los dos casos.
El resultado acredita integración aislada con Auth/PostgREST/RLS reales;
no acredita el QA N7/N8 del backend publicado.
