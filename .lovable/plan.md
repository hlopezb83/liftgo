# Ejecutar todos los tests

Correr la suite completa de Vitest del frontend con `bunx vitest run` y, en caso de fallar algo relacionado a los cambios recientes de Gastos (eliminación de `is_recurring` y de `recurringExpensesHelpers`), reportarlos.

No se modifica código en este paso — solo se ejecutan los tests y se reporta el resultado.

Si hay fallas atribuibles a los cambios recientes (por ejemplo tests que esperaban `is_recurring` o el helper eliminado), te muestro el detalle para decidir si los actualizamos en un paso siguiente.
