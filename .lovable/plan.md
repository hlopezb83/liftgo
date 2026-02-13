
# Equipment Configuration Module

## Overview
Create a configuration system where you can pre-define manufacturers, their models, and default specs (capacity, mast height, fuel type). When adding a forklift, these fields become cascading dropdowns instead of free-text inputs, eliminating typos and speeding up data entry.

## How it works

1. **Pick a Manufacturer** from a dropdown (e.g., Hyster, Toyota, Linde)
2. **Pick a Model** -- the list filters to only show models from that manufacturer
3. **Specs auto-fill** -- capacity, mast height, and fuel type populate automatically from the selected model's defaults (but remain editable)

You will still be able to type a custom serial number and name, since those are unique per unit.

## What gets built

### New database table: `equipment_models`
Stores the master catalog of manufacturer + model combinations with their default specs:
- `id` (uuid, primary key)
- `manufacturer` (text, required)
- `model` (text, required)
- `default_capacity_kg` (numeric, nullable)
- `default_mast_height_m` (numeric, nullable)
- `default_fuel_type` (text, default "Diesel")
- `created_at` / `updated_at` (timestamps)

### New page: Equipment Configuration (`/settings/equipment`)
A simple management page where you can:
- View all manufacturer/model entries in a table
- Add a new manufacturer + model with default specs via a dialog form
- Edit existing entries inline or via dialog
- Delete entries you no longer need

### Updated Add Forklift form (`/fleet/new`)
- **Manufacturer** field becomes a searchable dropdown populated from distinct manufacturers in `equipment_models`
- **Model** field becomes a filtered dropdown showing only models for the selected manufacturer
- When a model is selected, capacity, mast height, and fuel type auto-fill (user can still override)
- In edit mode, existing values are preserved and dropdowns pre-select correctly

### New sidebar link
- "Equipment Config" entry under a "Settings" group in the sidebar (using a Settings/Cog icon)

### New data hooks
- `useEquipmentModels()` -- fetch all entries
- `useCreateEquipmentModel()` -- add new entry
- `useUpdateEquipmentModel()` -- edit entry
- `useDeleteEquipmentModel()` -- remove entry

## Technical details

### Files to create
- `supabase/migrations/..._equipment_models.sql` -- table creation with RLS policy
- `src/pages/EquipmentConfigPage.tsx` -- configuration management UI
- `src/hooks/useEquipmentModels.ts` -- TanStack Query hooks for CRUD

### Files to modify
- `src/integrations/supabase/types.ts` -- auto-updated after migration
- `src/pages/ForkliftForm.tsx` -- replace manufacturer/model text inputs with cascading selects; auto-fill specs on model selection
- `src/components/AppSidebar.tsx` -- add "Equipment Config" nav item
- `src/App.tsx` -- add route for `/settings/equipment`

### Forklift form cascade logic
```text
User selects Manufacturer
  -> filter equipment_models to that manufacturer
  -> populate Model dropdown

User selects Model
  -> look up the matching equipment_model record
  -> set capacity_kg, mast_height_m, fuel_type from defaults
  -> user can still manually override any value
```

### Edge cases handled
- If no equipment models exist yet, the form falls back to free-text inputs with a hint to configure models first
- Edit mode pre-selects the correct manufacturer and model from the existing forklift data
- Deleting an equipment model does not affect existing forklifts (no foreign key constraint -- the forklift stores its own copy of manufacturer/model as text)
