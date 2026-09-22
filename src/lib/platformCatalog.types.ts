export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableValue[]
  | { [key: string]: SerializableValue };

export interface PlatformEquipmentModelRow {
  id: string;
  manufacturer: string;
  model: string;
  capacity_kg: number | null;
  mast_height_m: number | null;
  fuel_type: string | null;
  specifications: { [key: string]: SerializableValue };
  image_url: string | null;
  spec_sheet_url: string | null;
  is_active: boolean;
  organization_count: number;
  created_at: string;
  updated_at: string;
}

export interface EquipmentModelCatalogInput {
  id?: string;
  manufacturer: string;
  model: string;
  capacity_kg?: number | null;
  mast_height_m?: number | null;
  fuel_type?: string | null;
  specifications?: { [key: string]: SerializableValue };
  image_url?: string | null;
  spec_sheet_url?: string | null;
}

export interface SetEquipmentModelCatalogActiveInput {
  id: string;
  active: boolean;
}

export interface PlatformPartCatalogRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  manufacturer: string | null;
  oem_numbers: string[];
  category: string | null;
  unit_of_measure: string;
  image_url: string | null;
  is_active: boolean;
  equipment_model_ids: string[];
  organization_count: number;
  created_at: string;
  updated_at: string;
}

export interface PartCatalogInput {
  id?: string;
  sku: string;
  name: string;
  description?: string | null;
  manufacturer?: string | null;
  oem_numbers?: string[];
  category?: string | null;
  unit_of_measure?: string;
  image_url?: string | null;
  equipment_model_ids?: string[];
}

export interface SetPartCatalogActiveInput {
  id: string;
  active: boolean;
}
