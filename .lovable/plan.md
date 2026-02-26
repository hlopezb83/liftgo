

# Agregar campo "Representante Legal" a Clientes

## Resumen
Se agregara un campo opcional `representante_legal` a la tabla de clientes. Este campo se usara automaticamente en el contrato (seccion de Declaraciones y firmas) y en el Pagare (Anexo B) al generar el PDF.

## Cambios

### 1. Base de datos
Agregar columna `representante_legal` (text, nullable) a la tabla `customers`.

### 2. Formulario de clientes (`src/pages/CustomersPage.tsx`)
- Agregar `representante_legal: ""` al objeto `emptyCustomer`
- Agregar campo de input "Representante Legal (opcional)" en la seccion de Contacto, junto al campo "Persona de Contacto"
- Incluir el campo en la logica de submit (create/update) y en la carga de datos existentes

### 3. Detalle del cliente (`src/pages/CustomerDetailPage.tsx`)
- Mostrar el campo "Representante Legal" en la tarjeta de Informacion de Contacto cuando tenga valor

### 4. PDF del contrato (`src/components/ContractPDFButton.tsx`)
- En la seccion de Declaraciones del Arrendatario: agregar una declaracion con el nombre del representante legal si existe (ej: "Representado legalmente por: [nombre]")
- En el bloque de firmas del contrato: bajo "EL ARRENDATARIO", mostrar nombre del representante legal si existe
- En el Pagare (Anexo B, linea ~415): cambiar `customer?.contact_person` por `customer?.representante_legal || customer?.contact_person` para priorizar el representante legal

### 5. Plantilla del contrato (`src/pages/ContractForm.tsx`)
- Agregar placeholder `REPRESENTANTE_LEGAL` al llamado de `replacePlaceholders` para que la plantilla de texto lo incluya automaticamente

## Seccion tecnica

**Migracion SQL:**
```sql
ALTER TABLE customers ADD COLUMN representante_legal text;
```

**Archivos a modificar:**
- `src/pages/CustomersPage.tsx` - formulario CRUD de clientes
- `src/pages/CustomerDetailPage.tsx` - vista de detalle
- `src/components/ContractPDFButton.tsx` - generacion PDF (declaraciones, firmas, pagare)
- `src/pages/ContractForm.tsx` - placeholder en plantilla

No se requieren cambios de RLS ya que la tabla `customers` ya tiene las politicas correctas.
