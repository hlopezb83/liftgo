# Pruebas E2E con Playwright

La suite completa vive en `tests/e2e/` y usa `playwright.config.ts`. Los flujos
autenticados requieren cuentas de prueba y un backend aislado.

## Requisitos

Configura las variables en el entorno local o en secretos de CI. Los valores
son marcadores, no credenciales válidas:

```dotenv
E2E_TEST_EMAIL=<cuenta-de-prueba>
E2E_TEST_PASSWORD=<secreto-de-prueba>
VITE_SUPABASE_URL=<url-del-backend-aislado>
VITE_SUPABASE_PUBLISHABLE_KEY=<clave-publica-del-backend-aislado>

# Opcionales para flujos específicos por rol:
E2E_VENTAS_EMAIL=<cuenta-de-prueba>
E2E_VENTAS_PASSWORD=<secreto-de-prueba>
E2E_ADMINISTRATIVO_EMAIL=<cuenta-de-prueba>
E2E_ADMINISTRATIVO_PASSWORD=<secreto-de-prueba>
E2E_MECANICO_EMAIL=<cuenta-de-prueba>
E2E_MECANICO_PASSWORD=<secreto-de-prueba>
E2E_PORTAL_EMAIL=<cuenta-de-prueba>
E2E_PORTAL_PASSWORD=<secreto-de-prueba>
```

No copies credenciales a fixtures ni al repositorio. Revisa el guard de producción en
`tests/e2e/fixtures/`: la suite aborta si detecta producción o
no puede demostrar que el backend sea de prueba. Mantén este comportamiento
fail-closed.

## Comandos

```bash
bun run test:e2e          # suite completa configurada en playwright.config.ts
bun run test:e2e:ui       # depuración interactiva
bun run test:e2e:report   # abrir el reporte disponible
bun run test:e2e:smoke    # smoke aislado, sin login ni datos
```

El smoke de CI usa `playwright.smoke.config.ts`, backend placeholder y el
build de preview. No reemplaza la suite E2E completa; consulta
[docs/ci.md](../../docs/ci.md).

## Aislamiento de datos

- Cada spec que
siembra datos debe usar scopes, fixtures y cleanup definidos en `tests/e2e/`;
no hardcodees IDs compartidos ni limpies datos fuera de su scope.
- El gate A/B y las suites SQL de RLS son carriles separados con backend
  local efímero. No sustituyas ese backend por una URL remota.
- No generes CFDI real. Si se requiere Facturapi, usa sandbox aislado y confirma
  el modo antes de habilitar el flujo.
- Revisa los guards si cambian variables o la resolución del backend.
- Conciliación bancaria requiere PostgreSQL local efímero (`DB_URL` del runner)
  y `psql`: su limpieza elimina sólo la cuenta y las cargas propias del caso,
  con contexto de empresa. Nunca cambia permisos ni triggers de producción.
