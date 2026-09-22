import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rpcError } from "./platformAdmin.helpers";
import type {
  EquipmentModelCatalogInput,
  PartCatalogInput,
  PlatformEquipmentModelRow,
  PlatformPartCatalogRow,
  SetEquipmentModelCatalogActiveInput,
  SetPartCatalogActiveInput,
} from "./platformCatalog.types";

export type {
  EquipmentModelCatalogInput,
  PartCatalogInput,
  PlatformEquipmentModelRow,
  PlatformPartCatalogRow,
  SetEquipmentModelCatalogActiveInput,
  SetPartCatalogActiveInput,
};

function validateModel(
  g: typeof import("./server/adminGuards.server"),
  data: EquipmentModelCatalogInput,
) {
  if (!data.manufacturer?.trim() || !data.model?.trim()) {
    throw new g.HttpError(400, "Fabricante y modelo son obligatorios");
  }
  for (const [value, label] of [
    [data.capacity_kg, "La capacidad"],
    [data.mast_height_m, "La altura de mástil"],
  ] as const) {
    if (value != null && (!Number.isFinite(value) || value <= 0)) {
      throw new g.HttpError(400, `${label} debe ser mayor que cero`);
    }
  }
  if (data.id != null && !g.isUUID(data.id)) {
    throw new g.HttpError(400, "Identificador de modelo inválido");
  }
}

const rpcArgs = (actorId: string, data: EquipmentModelCatalogInput) => ({
  p_actor: actorId,
  p_manufacturer: data.manufacturer.trim(),
  p_model: data.model.trim(),
  p_capacity_kg: data.capacity_kg ?? null,
  p_mast_height_m: data.mast_height_m ?? null,
  p_fuel_type: data.fuel_type?.trim() || null,
  p_specifications: data.specifications ?? {},
  p_image_url: data.image_url?.trim() || null,
  p_spec_sheet_url: data.spec_sheet_url?.trim() || null,
});

export const listPlatformEquipmentModelsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformEquipmentModelRow[]> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(
      context.supabase,
      context.userId,
    );
    const { data, error } = await g.asUntypedRpc(admin).rpc(
      "platform_list_equipment_model_catalog",
      { p_actor: userId },
    );
    if (error) rpcError(g, "platform_list_equipment_model_catalog", error);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      manufacturer: String(row["manufacturer"] ?? ""),
      model: String(row["model"] ?? ""),
      capacity_kg: row["capacity_kg"] == null ? null : Number(row["capacity_kg"]),
      mast_height_m: row["mast_height_m"] == null ? null : Number(row["mast_height_m"]),
      fuel_type: row["fuel_type"] == null ? null : String(row["fuel_type"]),
      specifications: (row["specifications"] ?? {}) as PlatformEquipmentModelRow["specifications"],
      image_url: row["image_url"] == null ? null : String(row["image_url"]),
      spec_sheet_url: row["spec_sheet_url"] == null ? null : String(row["spec_sheet_url"]),
      is_active: row["is_active"] === true,
      organization_count: Number(row["organization_count"] ?? 0),
      created_at: String(row["created_at"] ?? ""),
      updated_at: String(row["updated_at"] ?? ""),
    }));
  });

export const savePlatformEquipmentModelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: EquipmentModelCatalogInput) => data)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(
      context.supabase,
      context.userId,
    );
    await g.enforceRateLimit(admin, "platform-save-equipment-model", userId, 20, 60);
    validateModel(g, data);
    const rpc = g.asUntypedRpc(admin);
    if (data.id) {
      const { error } = await rpc.rpc("platform_update_equipment_model_catalog", {
        p_id: data.id,
        ...rpcArgs(userId, data),
      });
      if (error) rpcError(g, "platform_update_equipment_model_catalog", error);
      return { id: data.id };
    }
    const { data: id, error } = await rpc.rpc(
      "platform_create_equipment_model_catalog",
      rpcArgs(userId, data),
    );
    if (error) rpcError(g, "platform_create_equipment_model_catalog", error);
    return { id: String(id) };
  });

export const setPlatformEquipmentModelActiveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: SetEquipmentModelCatalogActiveInput) => data)
  .handler(async ({ data, context }): Promise<{ success: true }> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(
      context.supabase,
      context.userId,
    );
    if (!g.isUUID(data.id) || typeof data.active !== "boolean") {
      throw new g.HttpError(400, "Datos de modelo inválidos");
    }
    const { error } = await g.asUntypedRpc(admin).rpc(
      "platform_set_equipment_model_catalog_active",
      { p_actor: userId, p_id: data.id, p_active: data.active },
    );
    if (error) rpcError(g, "platform_set_equipment_model_catalog_active", error);
    return { success: true };
  });

function validatePart(
  g: typeof import("./server/adminGuards.server"),
  data: PartCatalogInput,
) {
  if (!data.sku?.trim() || !data.name?.trim()) {
    throw new g.HttpError(400, "SKU y nombre son obligatorios");
  }
  if (!data.unit_of_measure?.trim()) {
    throw new g.HttpError(400, "La unidad de medida es obligatoria");
  }
  if (data.id != null && !g.isUUID(data.id)) {
    throw new g.HttpError(400, "Identificador de SKU inválido");
  }
  if ((data.equipment_model_ids ?? []).some((id) => !g.isUUID(id))) {
    throw new g.HttpError(400, "Modelo compatible inválido");
  }
}

const partRpcArgs = (actorId: string, data: PartCatalogInput) => ({
  p_actor: actorId,
  p_sku: data.sku.trim(),
  p_name: data.name.trim(),
  p_description: data.description?.trim() || null,
  p_manufacturer: data.manufacturer?.trim() || null,
  p_oem_numbers: data.oem_numbers ?? [],
  p_category: data.category?.trim() || null,
  p_unit_of_measure: data.unit_of_measure?.trim() || "pieza",
  p_image_url: data.image_url?.trim() || null,
  p_equipment_model_ids: data.equipment_model_ids ?? [],
});

export const listPlatformPartsCatalogFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformPartCatalogRow[]> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(
      context.supabase,
      context.userId,
    );
    const { data, error } = await g.asUntypedRpc(admin).rpc(
      "platform_list_parts_catalog",
      { p_actor: userId },
    );
    if (error) rpcError(g, "platform_list_parts_catalog", error);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      sku: String(row["sku"] ?? ""),
      name: String(row["name"] ?? ""),
      description: row["description"] == null ? null : String(row["description"]),
      manufacturer: row["manufacturer"] == null ? null : String(row["manufacturer"]),
      oem_numbers: Array.isArray(row["oem_numbers"])
        ? row["oem_numbers"].map(String)
        : [],
      category: row["category"] == null ? null : String(row["category"]),
      unit_of_measure: String(row["unit_of_measure"] ?? "pieza"),
      image_url: row["image_url"] == null ? null : String(row["image_url"]),
      is_active: row["is_active"] === true,
      equipment_model_ids: Array.isArray(row["equipment_model_ids"])
        ? row["equipment_model_ids"].map(String)
        : [],
      organization_count: Number(row["organization_count"] ?? 0),
      created_at: String(row["created_at"] ?? ""),
      updated_at: String(row["updated_at"] ?? ""),
    }));
  });

export const savePlatformPartCatalogFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: PartCatalogInput) => data)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(
      context.supabase,
      context.userId,
    );
    await g.enforceRateLimit(admin, "platform-save-part-catalog", userId, 20, 60);
    validatePart(g, data);
    const rpc = g.asUntypedRpc(admin);
    if (data.id) {
      const { error } = await rpc.rpc("platform_update_parts_catalog", {
        p_id: data.id,
        ...partRpcArgs(userId, data),
      });
      if (error) rpcError(g, "platform_update_parts_catalog", error);
      return { id: data.id };
    }
    const { data: id, error } = await rpc.rpc(
      "platform_create_parts_catalog",
      partRpcArgs(userId, data),
    );
    if (error) rpcError(g, "platform_create_parts_catalog", error);
    return { id: String(id) };
  });

export const setPlatformPartCatalogActiveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: SetPartCatalogActiveInput) => data)
  .handler(async ({ data, context }): Promise<{ success: true }> => {
    const g = await import("./server/adminGuards.server");
    const { admin, userId } = await g.requirePlatformOperator(
      context.supabase,
      context.userId,
    );
    if (!g.isUUID(data.id) || typeof data.active !== "boolean") {
      throw new g.HttpError(400, "Datos de SKU inválidos");
    }
    const { error } = await g.asUntypedRpc(admin).rpc(
      "platform_set_parts_catalog_active",
      { p_actor: userId, p_id: data.id, p_active: data.active },
    );
    if (error) rpcError(g, "platform_set_parts_catalog_active", error);
    return { success: true };
  });
