# Scoped UI architecture

- Keep supplier-bill header actions in their focused component; this isolates menu interaction tests from payment dialogs and data hooks.
- Use the opt-in `stackedControls` layout only for lists requiring separate search and facet rows; default list geometry remains unchanged.