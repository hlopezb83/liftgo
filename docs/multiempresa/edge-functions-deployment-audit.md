# Auditoría de Edge Functions desplegadas

Este gate compara el código versionado con el código realmente desplegado. La
fecha o el número de versión por sí solos no demuestran que ambos códigos sean
iguales.

## Evidencia requerida

- Inventario JSON de `supabase functions list`.
- Descarga del código desplegado mediante `supabase functions download`.
- Reporte sanitizado del comparador. El reporte no incluye tokens, URLs ni el
  identificador del proyecto.

El token de acceso y el identificador del proyecto deben permanecer fuera del
repositorio y del chat.

## Obtención fuera del repositorio

En una carpeta temporal y con variables de entorno definidas únicamente en la
terminal del propietario:

```powershell
supabase --output json functions list --project-ref $env:SUPABASE_PROJECT_REF |
  Set-Content -Encoding utf8 functions.json

supabase init
supabase functions download --project-ref $env:SUPABASE_PROJECT_REF --use-api
```

La documentación oficial advierte que la descarga no incluye `deno.json` ni
los import maps. Por ello el comparador excluye esos archivos y también las
pruebas; compara sólo los archivos de ejecución descargables. El directorio
`_shared` también debe estar presente y coincidir. Si la CLI no lo extrae, la
auditoría falla y se debe repetir con `--use-api` en una carpeta vacía.

Copiar `functions.json` y la carpeta temporal `supabase/functions` a un área
privada de trabajo, nunca al repositorio. Ejecutar:

```powershell
bun scripts/edge-functions-audit.ts `
  --inventory C:\ruta-privada\functions.json `
  --downloaded C:\ruta-privada\supabase\functions
```

## Criterios

- Las 16 funciones activas que procesan datos por organización deben existir y
  tener `sourceStatus: match`.
- Las cinco rutas retiradas pueden no estar desplegadas. Si existen, deben
  coincidir con la versión segura que responde `410`.
- `migrate-storage-org-prefix` puede no estar desplegada. Si existe, debe
  coincidir con la versión protegida del repositorio.
- Una función desconocida, una descarga ausente o una diferencia de código
  produce `FAIL`.
- El código compartido de `_shared` debe coincidir; una descarga que lo omita
  no sirve como evidencia.

Un resultado verde permite cerrar el inventario. No sustituye las pruebas A/B
ni autoriza por sí mismo el alta de otra organización.

