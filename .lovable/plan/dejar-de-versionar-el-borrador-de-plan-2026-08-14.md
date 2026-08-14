# Dejar de versionar el borrador de plan

## Contexto

Los commits titulados "Update plan" contienen un único archivo: `.lovable/plan.md`, el borrador de plan que se reescribe en cada iteración del modo plan. Como `.lovable/` no está en `.gitignore`, cada guardado se convierte en un commit que viaja a GitHub.

## Decisión

Ignorar el borrador `.lovable/plan.md` y conservar en el repositorio únicamente los planes aprobados que se archivan en `.lovable/plan/`.

## Cambios

1. Agregar a `.gitignore` un bloque al final:

```text
# Lovable: borrador de plan (los planes aprobados en .lovable/plan/ sí se versionan)
.lovable/plan.md
```

2. Dejar de rastrear el borrador ya versionado, sin borrar el archivo del disco:

```text
git rm --cached .lovable/plan.md
```

3. Verificar que `.lovable/plan/` siga rastreado (los archivos `<titulo>-<fecha>.md` ya existentes no se tocan).

## Resultado esperado

- Desaparecen los commits "Update plan" ruidosos.
- El historial de planes aprobados se mantiene íntegro en GitHub bajo `.lovable/plan/`.
- Ningún cambio en código de la aplicación ni en el comportamiento del preview.

## Changelog

Entrada patch al inicio de `public/changelog.json` y del MD de changelog: "Borrador de plan fuera de Git" — se deja de versionar `.lovable/plan.md` y se conservan solo los planes aprobados.
