

## Diagnóstico

En la línea 170 de `CalendarPage.tsx`, el texto se renderiza así:

```
{b.customer_name} ({b.customer_contact})
```

Cuando `customer_contact` es `null` o vacío, se muestra `"Cliente ()"` porque los paréntesis son texto estático.

## Corrección (v3.17.3)

**`src/pages/CalendarPage.tsx` — línea 170**

Cambiar a renderizado condicional: solo mostrar `(contact)` si `customer_contact` tiene valor.

```tsx
<p className="text-xs text-muted-foreground">
  {b.customer_name}{b.customer_contact ? ` (${b.customer_contact})` : ""}
</p>
```

**`src/lib/changelog.ts`** — entrada v3.17.3

