

# Editor de Contenido de Contratos y Anexos

## Resumen

Actualmente las 8 clausulas del contrato, las secciones del checklist (Anexo A) y el texto del pagare (Anexo B) estan escritos directamente en el codigo. Esto significa que cualquier cambio requiere modificar el codigo fuente.

La solucion es mover todo ese contenido a la base de datos y crear una interfaz en el modulo de Configuracion donde el admin pueda editar cada seccion.

---

## Estructura de Datos

Se reutilizara y expandira la tabla `contract_templates` existente, agregando campos estructurados para cada seccion del documento:

### Migracion SQL

```sql
ALTER TABLE contract_templates
  ADD COLUMN intro_text text,
  ADD COLUMN declarations_landlord jsonb DEFAULT '[]',
  ADD COLUMN declarations_tenant jsonb DEFAULT '[]',
  ADD COLUMN clauses jsonb DEFAULT '[]',
  ADD COLUMN checklist_sections jsonb DEFAULT '[]',
  ADD COLUMN pagare_text text,
  ADD COLUMN updated_at timestamptz DEFAULT now();
```

Donde:
- `intro_text`: Parrafo introductorio del contrato (con placeholders como `{arrendador}`, `{arrendatario}`)
- `declarations_landlord`: Array de strings con declaraciones del arrendador
- `declarations_tenant`: Array de strings con declaraciones del arrendatario  
- `clauses`: Array de objetos `{title, body}` para las clausulas
- `checklist_sections`: Array de objetos `{title, items: string[]}` para el Anexo A
- `pagare_text`: Texto del pagare con placeholders

### Seed de datos por defecto

Se insertara una plantilla "default" con todo el contenido actual hardcodeado, para que funcione identico al dia de hoy sin perder nada.

---

## Interfaz de Edicion

Nueva pestana **"Plantilla de Contrato"** en la pagina de **Configuracion de Operaciones** (`/operations-setup`), disponible solo para roles admin y administrativo.

### Diseno de la pestana

La pestana mostrara secciones colapsables (Accordion) para cada parte del documento:

1. **Parrafo Introductorio** - Textarea con el texto de apertura. Placeholders disponibles: `{arrendador}`, `{arrendatario}`.

2. **Declaraciones del Arrendador** - Lista editable de textos. Botones para agregar/eliminar declaraciones.

3. **Declaraciones del Arrendatario** - Igual que arriba.

4. **Clausulas** - Lista de clausulas, cada una con campo de titulo y textarea para el cuerpo. Boton para agregar/eliminar clausulas. Placeholders disponibles documentados: `{ubicacion}`, `{horas_max}`, `{tarifa_extra}`, etc.

5. **Checklist (Anexo A)** - Secciones con titulo y lista de items a revisar. El admin puede agregar/eliminar secciones e items.

6. **Texto del Pagare (Anexo B)** - Textarea con el texto legal del pagare.

Boton **"Guardar Plantilla"** al final.

### Placeholders

Los textos soportaran placeholders que se reemplazaran automaticamente al generar el PDF:
- `{arrendador}` - Razon social de la empresa
- `{arrendatario}` - Nombre del cliente
- `{ubicacion}` - Ubicacion de uso
- `{horas_max}` - Horas maximas por mes
- `{tarifa_extra}` - Tarifa por hora extra
- `{fecha_inicio}`, `{fecha_fin}` - Fechas del contrato
- `{tarifa_diaria}`, `{tarifa_semanal}`, `{tarifa_mensual}`
- `{deposito}`, `{interes_moratorio}`, `{frecuencia_pago}`
- `{marca}`, `{modelo}`, `{serie}`, `{capacidad}`, `{combustible}`
- `{ciudad}`, `{rfc_cliente}`, `{domicilio_cliente}`, `{representante_legal}`

Se mostrara una referencia visual de placeholders disponibles en la interfaz.

---

## Integracion con Generacion PDF

`ContractPDFButton.tsx` se modificara para:
1. Cargar la plantilla default de `contract_templates`
2. Si existe plantilla en BD, usar ese contenido; si no, usar los valores hardcodeados actuales como fallback
3. Reemplazar placeholders con los datos reales del contrato, cliente, equipo y empresa

---

## Archivos a crear/modificar

1. **Migracion SQL** - Expandir tabla `contract_templates` con nuevos campos
2. **Crear** `src/components/operations/ContractTemplateTab.tsx` - Componente del editor de plantilla
3. **Modificar** `src/hooks/useContractTemplates.ts` - Agregar mutacion para guardar, y expandir tipo de datos
4. **Modificar** `src/pages/OperationsSetupPage.tsx` - Agregar pestana "Plantilla de Contrato"
5. **Modificar** `src/components/ContractPDFButton.tsx` - Leer plantilla de BD y reemplazar placeholders
6. **Modificar** `src/lib/changelog.ts` - Agregar entrada v3.2.0

---

## Consideraciones

- **Fallback seguro**: Si no hay plantilla en BD, el PDF usa el contenido hardcodeado actual. Nada se rompe.
- **Roles**: Solo admin y administrativo pueden editar la plantilla. Todos los demas la ven reflejada en los PDFs.
- **Validacion**: Se valida que las clausulas tengan titulo y cuerpo antes de guardar.
- **Sin riesgo de perdida**: El seed initial carga exactamente el contenido actual.

