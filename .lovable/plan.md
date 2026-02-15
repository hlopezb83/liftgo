

# Rename "Equipment Config" to "Operations Setup" and Add Drivers + Mechanics Tabs

## Overview

The current "Equipment Configuration" page only manages forklift models. We will rename it to **"Operations Setup"** and restructure it as a tabbed page with three sections:

1. **Equipment Models** -- the existing forklift manufacturer/model catalog (unchanged)
2. **Drivers** -- people who deliver/pick up forklifts
3. **Mechanics** -- technicians who perform maintenance

This creates a central hub for all operational resources, and later these records can be used to populate dropdowns in the Deliveries and Maintenance pages instead of free-text fields.

---

## What Changes

### 1. Database: Create `drivers` and `mechanics` tables

**`drivers` table:**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | auto-generated |
| name | text (NOT NULL) | Full name |
| phone | text | Contact number |
| email | text | Optional |
| license_number | text | Driving license |
| is_active | boolean | Default true, for soft-disable |
| notes | text | Optional |
| created_at / updated_at | timestamptz | Auto-managed |

**`mechanics` table:**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | auto-generated |
| name | text (NOT NULL) | Full name |
| phone | text | Contact number |
| email | text | Optional |
| specialization | text | e.g. "Hydraulic", "Electrical" |
| is_active | boolean | Default true |
| notes | text | Optional |
| created_at / updated_at | timestamptz | Auto-managed |

RLS policies will mirror the `equipment_models` pattern: admin full access, all authenticated users can read.

### 2. New hooks: `useDrivers.ts` and `useMechanics.ts`

Standard CRUD hooks (query + create/update/delete mutations) following the same pattern as `useEquipmentModels.ts`.

### 3. Rename and restructure the page

- Rename `EquipmentConfigPage.tsx` to `OperationsSetupPage.tsx`
- Use Tabs (Equipment Models | Drivers | Mechanics) at the top
- Each tab has its own table + add/edit dialog
- Extract the existing equipment models UI into a sub-component to keep the file manageable

### 4. Update sidebar and routing

- Sidebar label: "Equipment Config" changes to "Operations Setup"
- Route stays at `/settings/equipment` (or change to `/settings/operations`) 
- App.tsx route updated accordingly

### 5. Additional improvements for this module

- **Link drivers to deliveries**: Update the Deliveries form to offer a dropdown of active drivers instead of free-text input, with a fallback to manual entry
- **Link mechanics to maintenance**: Update the Maintenance form to offer a dropdown of active mechanics for the "Performed By" field, with a fallback to manual entry
- **Unique constraint on names**: Add unique indexes on `drivers.name` and `mechanics.name` to prevent duplicates

---

## Technical Details

### Files to create
- `src/hooks/useDrivers.ts` -- CRUD hooks for drivers table
- `src/hooks/useMechanics.ts` -- CRUD hooks for mechanics table

### Files to modify
- **Database migration** -- create `drivers` and `mechanics` tables with RLS
- `src/pages/EquipmentConfigPage.tsx` -- rename to `OperationsSetupPage.tsx`, add tabs for Drivers and Mechanics
- `src/components/AppSidebar.tsx` -- rename nav item to "Operations Setup"
- `src/App.tsx` -- update import and route
- `src/pages/DeliveriesPage.tsx` -- add driver dropdown from `useDrivers`
- `src/pages/MaintenancePage.tsx` -- add mechanic dropdown from `useMechanics`

