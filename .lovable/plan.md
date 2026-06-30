# Fix: CI `Secrets check` job rompe por warning mal redirigido

## Causa raíz

En `.github/workflows/ci.yml` (job `secrets-check`, líneas 49-64), las líneas:

```bash
echo "::warning::Faltan secrets ..."
```

están **dentro** del bloque `{ ... } >> "$GITHUB_OUTPUT"`. Eso hace que la anotación `::warning::` se escriba en el archivo de outputs de GitHub Actions en lugar de stdout, produciendo los dos errores que ves:

- `Invalid format '::warning::Faltan secrets VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY — edge-functions y e2e se saltarán.'`
- `Unable to process file command 'output' successfully.`
- `Process completed with exit code 1` → `Uno o más jobs de CI fallaron`

El resto de "errores" del log son solo *warnings* informativos de GitHub sobre Node 20 en `actions/cache@v4` y no rompen el build (verificado: `knip` corre limpio localmente).

## Cambio

Mover los `echo "::warning::..."` fuera de la redirección a `$GITHUB_OUTPUT`, dejando únicamente los pares `clave=valor` dentro del bloque.

Archivo: `.github/workflows/ci.yml`, paso `check` del job `secrets-check`:

```yaml
run: |
  set -euo pipefail
  has_supabase=false
  has_e2e=false
  if [[ -n "${SUPA_URL:-}" && -n "${SUPA_KEY:-}" ]]; then
    has_supabase=true
  else
    echo "::warning::Faltan secrets VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY — edge-functions y e2e se saltarán."
  fi
  if [[ -n "${E2E_EMAIL:-}" && -n "${E2E_PASS:-}" ]]; then
    has_e2e=true
  else
    echo "::warning::Faltan secrets E2E_TEST_EMAIL/E2E_TEST_PASSWORD — e2e se saltará."
  fi
  {
    echo "has_supabase=${has_supabase}"
    echo "has_e2e=${has_e2e}"
  } >> "$GITHUB_OUTPUT"
```

## Fuera de alcance

- Avisos de Node 20 en `actions/cache@v4`: son del propio runner de GitHub, no rompen CI. Se pueden actualizar después si quieres.
- Configurar los secrets faltantes (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`) es decisión tuya en GitHub Settings → Secrets; sin ellos los jobs dependientes simplemente se saltan (comportamiento ya correcto una vez arreglado el paso).
- No toco código de app; es 100% workflow.
