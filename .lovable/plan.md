

# Incorporar machote de contrato al modulo de contratos

Tu machote incluye 3 documentos: el contrato principal (8 clausulas legales), Anexo A (checklist de inspeccion) y Anexo B (pagare). Vamos a incorporarlos de dos formas: como texto predeterminado editable en el formulario y como PDF profesional descargable.

---

## Parte 1: Nuevos campos en la base de datos

La tabla `contracts` actualmente solo tiene `terms_text` para todo el texto legal. Tu machote requiere campos adicionales para llenar automaticamente las variables del contrato:

**Nuevas columnas en `contracts`:**
- `usage_location` (text) - Direccion donde operara el equipo (Clausula SEGUNDA)
- `max_hours_per_month` (numeric) - Horas maximas de uso mensual
- `extra_hour_rate` (numeric) - Cargo por hora extra
- `payment_frequency` (text) - Semanal / Mensual (Clausula CUARTA)
- `late_interest_rate` (numeric) - Porcentaje de interes moratorio
- `contract_city` (text, default 'San Pedro Garza Garcia, N.L.') - Ciudad del contrato
- `witness_1` (text) - Nombre del testigo 1
- `witness_2` (text) - Nombre del testigo 2

**Nueva tabla `contract_templates`:**
- `id`, `name`, `body_text`, `is_default`, `created_at`
- Se insertara el texto completo de tu machote como plantilla predeterminada
- Permitira tener multiples plantillas en el futuro

No se necesitan cambios en RLS ya que la tabla contracts ya tiene las politicas correctas. La nueva tabla `contract_templates` tendra politicas de lectura para todos los roles autenticados y escritura solo para admin.

---

## Parte 2: Formulario de contrato mejorado

**Archivo: `src/pages/ContractForm.tsx`**

Agregar una nueva seccion "Condiciones de Uso" entre "Tarifas" y "Terminos" con los campos:
- Ubicacion de uso del equipo
- Horas maximas mensuales + tarifa por hora extra
- Frecuencia de pago (select: Semanal / Mensual)
- Tasa de interes moratorio
- Ciudad del contrato
- Testigos (2 campos de texto)

**Texto predeterminado:**
Al crear un contrato nuevo, se cargara automaticamente la plantilla predeterminada de `contract_templates` en el campo `terms_text`, reemplazando los placeholders con los datos reales:
- `[Nombre de tu empresa]` -> `company_settings.razon_social`
- `[Nombre del cliente]` -> nombre del cliente seleccionado
- `[Marca]`, `[Modelo]`, `[Numero de Serie]` -> datos del forklift
- `[Fecha de inicio]`, `[Fecha de termino]` -> fechas del contrato
- `[Monto]` -> tarifas configuradas

El usuario podra editar el texto antes de guardar.

---

## Parte 3: PDF profesional con estructura del machote

**Archivo: `src/components/ContractPDFButton.tsx`** (reescritura completa)

El PDF generara un documento de multiples paginas con la estructura exacta de tu machote:

**Pagina 1-2: Contrato Principal**
- Encabezado con logo y datos de la empresa
- Titulo "CONTRATO DE ARRENDAMIENTO DE MAQUINARIA Y EQUIPO"
- Seccion I: Declaraciones (arrendador y arrendatario con datos reales)
- Seccion II: Clausulas (PRIMERA a OCTAVA) con datos llenados:
  - PRIMERA: Datos del equipo (marca, modelo, serie, capacidad, combustible del forklift)
  - SEGUNDA: Ubicacion y horas maximas
  - TERCERA: Vigencia con fechas
  - CUARTA: Precio, forma de pago, interes moratorio
  - QUINTA: Mantenimiento (texto fijo del machote)
  - SEXTA: Responsabilidad civil (texto fijo)
  - SEPTIMA: Rescision (texto fijo)
  - OCTAVA: Jurisdiccion
- Espacios de firma: Arrendador, Arrendatario, 2 Testigos

**Pagina 3: Anexo A - Checklist de Inspeccion**
- Datos generales (fecha, lugar, equipo, horometro)
- Tabla con categorias: Fluidos, Sistema Mecanico, Seguridad, Llantas, Estetica
- Cada item con casilla de verificacion (vacia para imprimir y llenar a mano)
- Espacios de firma de entrega/recepcion

**Pagina 4: Anexo B - Pagare**
- Numero de pagare, monto (valor del deposito)
- Texto legal del pagare con datos del suscriptor pre-llenados
- Espacios para firma del suscriptor y aval

Para generar el PDF se seguira usando `jsPDF` que ya esta instalado. Se obtendran los datos adicionales del equipo (`manufacturer`, `model`, `serial_number`, `capacity_kg`, `fuel_type`) y del cliente (`address`, `contact_person`, `rfc`) mediante queries adicionales al momento de generar el PDF.

---

## Parte 4: Boton de descarga con opciones

**Archivo: `src/pages/ContractDetail.tsx`**

Reemplazar el boton simple "Descargar PDF" con un dropdown que ofrezca:
- "Contrato Completo (con Anexos)" - genera las 4 paginas
- "Solo Contrato" - genera solo el contrato principal
- "Solo Checklist (Anexo A)" - util para entregas
- "Solo Pagare (Anexo B)" - para firma del pagare

---

## Secuencia de implementacion

1. Migracion de base de datos: agregar columnas a `contracts` + crear tabla `contract_templates` con el machote insertado
2. Actualizar `ContractForm.tsx`: nuevos campos + carga de plantilla predeterminada
3. Reescribir `ContractPDFButton.tsx`: PDF profesional multi-pagina con la estructura del machote
4. Actualizar `ContractDetail.tsx`: dropdown de opciones de descarga
5. Actualizar `useContracts.ts`: incluir los nuevos campos en las queries

---

## Detalles tecnicos

- **Base de datos**: 1 migracion SQL con `ALTER TABLE contracts ADD COLUMN` + `CREATE TABLE contract_templates` + `INSERT` de la plantilla
- **RLS**: La tabla `contract_templates` tendra lectura para todos los autenticados y escritura solo para admin
- **PDF**: Se usa `jsPDF` existente. Los datos del equipo y cliente se consultan al momento de generar (ya se hace algo similar con `company_settings`)
- **Sin dependencias nuevas**: Todo se resuelve con jsPDF + el stack actual

