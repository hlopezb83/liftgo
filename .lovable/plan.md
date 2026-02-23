
# Unificar Gas LP y Gasolina en una sola opcion de combustible

## Contexto
Los motores que usan Gas LP tambien aceptan Gasolina, por lo que tener dos opciones separadas no tiene sentido. Se unificaran en una sola opcion.

## Cambios

### 1. Modificar constantes en `src/lib/constants.ts`
- Eliminar "Gasoline" de `FUEL_TYPES`, quedando: `["Diesel", "Electric", "LPG"]`
- Cambiar la etiqueta de "LPG" de "Gas LP" a **"Gas LP / Gasolina"** en `FUEL_TYPE_LABELS`
- Eliminar la entrada "Gasoline" de `FUEL_TYPE_LABELS`

### 2. Migrar datos existentes en la base de datos
- Actualizar cualquier registro en `forklifts` donde `fuel_type = 'Gasoline'` a `'LPG'`
- Actualizar cualquier registro en `equipment_models` donde `default_fuel_type = 'Gasoline'` a `'LPG'`

Nota: Actualmente no hay datos en ninguna de las dos tablas, pero la migracion se incluye por seguridad para cubrir datos futuros o que se agreguen antes de aplicar el cambio.

### Resultado final
Las opciones de combustible quedaran:
- Diesel (Diesel)
- Electric (Electrico)
- LPG (Gas LP / Gasolina)

### Archivos a modificar
- `src/lib/constants.ts` -- eliminar "Gasoline", renombrar label de LPG
- Migracion SQL -- actualizar registros existentes con "Gasoline" a "LPG"

No se requieren cambios en otros archivos ya que `ForkliftForm`, `EquipmentModelsTab` y demas componentes consumen las constantes de `constants.ts` dinamicamente.
