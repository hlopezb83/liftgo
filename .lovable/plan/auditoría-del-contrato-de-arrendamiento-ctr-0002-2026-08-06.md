# Auditoría del contrato de arrendamiento (CTR-0002)

Revisé el PDF que subiste, la plantilla en base de datos y el código que genera el documento. Encontré 6 hallazgos; 3 son bugs visibles y 3 son huecos de contenido legal.

## Hallazgos

### 1. Domicilio del arrendatario mal formado (bug visible)
El PDF imprime, tanto en Declaraciones como en el Pagaré:

```text
CAZADORES AVENIDA (AV.) 223 , OTRA NO ESPECIFICADA EN EL CATALOGO, SANTA CATARINA, NUEVO LEON
```

Es el texto crudo que quedó guardado al importar la Constancia de Situación Fiscal: arrastra el relleno del catálogo del SAT ("OTRA NO ESPECIFICADA EN EL CATALOGO"), el tipo de vialidad va después del nombre, hay un espacio antes de la coma y falta el código postal (el cliente sí tiene C.P. guardado en otro campo).

### 2. Signo de pesos duplicado (bug visible)
Aparece `$$1,000.00`, `$$21,000.00`, `$$130.00` en las cláusulas Segunda, Cuarta y en el Pagaré. La plantilla escribe `$` y el valor ya viene formateado con `$`.

### 3. No hay cláusula de depósito en garantía (hueco legal)
El monto de depósito ($21,000) se captura en el contrato, pero en el documento sólo aparece indirectamente como el importe del Pagaré. No se dice en ningún lado que exista un depósito, para qué sirve, ni cuándo se devuelve.

### 4. Dos plantillas marcadas como predeterminada
En la tabla de plantillas hay dos registros marcados como "predeterminada": uno con las 8 cláusulas y otro vacío. La consulta toma "la primera" sin criterio de orden, así que el PDF puede tomar la plantilla vacía y caer a las cláusulas de respaldo del código, ignorando lo que el admin edite.

### 5. La fecha de firma es siempre "hoy"
El cierre ("lo firman en ... el día 06/08/2026") y la fecha del Pagaré usan la fecha del día en que se descarga el PDF, no la fecha de firma del contrato.

### 6. Contenido legal incompleto
Faltan datos y cláusulas estándar en un arrendamiento de maquinaria:
- RFC y domicilio de ambas partes en el proemio/declaraciones (hoy sólo aparece el domicilio del cliente).
- Depósito en garantía (hallazgo 3).
- Seguro y cobertura de responsabilidad del equipo.
- Entrega, devolución y costos de flete/maniobras.
- Facturación (IVA, CFDI, uso y forma de pago) y domicilios para notificaciones.
- El Pagaré no tiene fecha de vencimiento (un pagaré sin vencimiento se considera a la vista).

## Cambios propuestos

**A. Normalizador de domicilio**
Nuevo helper `formatLegalAddress()` que limpia direcciones provenientes de CSF: elimina frases de catálogo ("OTRA NO ESPECIFICADA EN EL CATALOGO", "NINGUNO"), corrige espacios antes de coma y comas repetidas, reordena `NOMBRE TIPO-VIALIDAD NUM` a `TIPO-VIALIDAD NOMBRE NUM` y agrega `C.P. XXXXX` usando el código postal fiscal del cliente. Se usa en el placeholder `{domicilio_cliente}` y en el Pagaré. No modifica el dato guardado del cliente, sólo la presentación.

**B. Signo de pesos**
Quitar el `$` literal de las plantillas (código y registro en base de datos), dejando que el valor formateado lo aporte.

**C. Cláusula de depósito en garantía**
Insertar como QUINTA (y recorrer la numeración de las siguientes): monto, naturaleza no reembolsable como renta, aplicación contra daños/rentas vencidas y plazo de devolución tras la inspección de retorno. Se agrega también la cláusula de seguro, entrega/devolución y facturación/notificaciones.

**D. Plantilla predeterminada única**
Migración que deja una sola plantilla predeterminada (elimina la vacía) más un índice único parcial sobre `is_default`, y ordenar explícitamente la consulta.

**E. Fecha de firma**
Usar la fecha de firma del contrato cuando exista; si no, la fecha de inicio; y sólo como último recurso la fecha actual. Agregar fecha de vencimiento al Pagaré (fin de vigencia del contrato).

**F. Nuevos placeholders**
`{rfc_arrendador}`, `{domicilio_arrendador}`, `{cp_cliente}`, `{fecha_firma}`, `{vencimiento_pagare}` agregados al registro de placeholders para que se puedan usar al editar la plantilla desde Configuración.

## Detalles técnicos

- `src/lib/format/formatLegalAddress.ts` (nuevo) + pruebas unitarias con el caso CAZADORES.
- `src/lib/pdf/contract/fetchers.ts`: agregar `domicilio_fiscal_cp` al select de clientes y `rfc`/`lugar_expedicion` ya presentes; ordenar `contract_templates` por `updated_at desc`.
- `src/lib/pdf/contract/placeholders.ts` y `placeholderRegistry.ts`: nuevos tokens, quitar `$` duplicado.
- `src/lib/pdf/contract/data-templates.ts`: nuevas cláusulas y numeración.
- `src/lib/pdf/documents/contract/ContractBody.tsx` y `PagareAnnex.tsx`: fecha de firma, vencimiento del pagaré, domicilio normalizado.
- Migración: limpiar plantilla duplicada, índice único parcial, y actualizar el texto de la plantilla existente en base de datos (cláusulas nuevas + `$` corregido).
- Changelog `v7.282.0` (minor) en `public/changelog.json` y `public/changelog/v7.282.0.json`, más bump de `package.json` y `public/version.json`.
