

# Por qué no aparece la cotización 0013

## Causa raíz

El selector de cotizaciones filtra las opciones según el nombre de empresa del prospecto. El código actual (líneas 60-67 de `ProspectFormDialog.tsx`) hace un match parcial entre `company_name` del prospecto y `customer_name` de la cotización. Si la cotización 0013 tiene un nombre de cliente diferente al nombre de empresa del prospecto, no aparece en la lista.

Por ejemplo, si el prospecto dice "Indimex Trading" pero la cotización 0013 tiene como cliente "Indimex Trading SA de CV" o un nombre distinto, el filtro la excluye.

## Solución propuesta

Mostrar **todas** las cotizaciones en el selector, pero ordenarlas de forma que las que coincidan con el nombre de la empresa aparezcan primero. Esto da prioridad visual sin ocultar opciones válidas.

## Cambio en `src/components/crm/ProspectFormDialog.tsx`

Modificar el `useMemo` de `matchingQuotes` para que retorne **todas** las cotizaciones, ordenadas por relevancia (coincidencias primero):

```ts
const matchingQuotes = useMemo(() => {
  if (!company.trim()) return allQuotes;
  const lowerCompany = company.toLowerCase();
  return [...allQuotes].sort((a, b) => {
    const aMatch = a.customer_name?.toLowerCase().includes(lowerCompany) ||
      lowerCompany.includes(a.customer_name?.toLowerCase() ?? "");
    const bMatch = b.customer_name?.toLowerCase().includes(lowerCompany) ||
      lowerCompany.includes(b.customer_name?.toLowerCase() ?? "");
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return 0;
  });
}, [allQuotes, company]);
```

Un solo cambio, sin impacto en otras funcionalidades.

