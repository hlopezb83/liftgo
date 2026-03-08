

## Plan: Diferenciar colores de "Confirmado" y "Completado" en badges (v3.19.5)

### Problema
`confirmed` y `completed` usan el mismo color verde (`bg-status-available`), lo que dificulta distinguir reservas activas de finalizadas.

### Solución
Asignar a `completed` un color propio — un tono gris-azul oscuro que comunique "finalizado" sin confundirse con otros estados.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `src/index.css` | Agregar variable `--status-completed: 220 15% 40%` (gris-azul oscuro) en `:root` y `.dark` |
| `tailwind.config.ts` | Agregar `completed` al mapa de colores de status |
| `src/components/StatusBadge.tsx` | Cambiar `completed` de `bg-status-available` a `bg-status-completed` |
| `src/lib/changelog.ts` | v3.19.5 |

### Resultado visual
- **Confirmado** → Verde (sin cambio)
- **Completado** → Gris-azul oscuro (nuevo, comunica "terminado")

