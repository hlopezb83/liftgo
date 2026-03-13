
-- Create role_permissions table
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  module text NOT NULL,
  access_level text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, module)
);

-- Enable RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read role_permissions"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can manage role_permissions"
  ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed with current static permissions
INSERT INTO public.role_permissions (role, module, access_level) VALUES
  -- Admin: full access to everything
  ('admin', 'Dashboard', 'full'), ('admin', 'Flota', 'full'), ('admin', 'Reservas', 'full'),
  ('admin', 'Calendario', 'full'), ('admin', 'Entregas', 'full'), ('admin', 'Facturas', 'full'),
  ('admin', 'Pagos', 'full'), ('admin', 'Contratos', 'full'), ('admin', 'Cotizaciones', 'full'),
  ('admin', 'Clientes', 'full'), ('admin', 'CRM / Prospectos', 'full'), ('admin', 'Mantenimiento', 'full'),
  ('admin', 'Daños', 'full'), ('admin', 'Refacciones', 'full'), ('admin', 'Gastos', 'full'),
  ('admin', 'Proveedores', 'full'), ('admin', 'Reportes', 'full'), ('admin', 'Configuración', 'full'),
  ('admin', 'Gestión de Usuarios', 'full'),

  -- Administrativo
  ('administrativo', 'Dashboard', 'read'), ('administrativo', 'Flota', 'read'),
  ('administrativo', 'Reservas', 'read'), ('administrativo', 'Calendario', 'full'),
  ('administrativo', 'Entregas', 'full'), ('administrativo', 'Facturas', 'full'),
  ('administrativo', 'Pagos', 'full'), ('administrativo', 'Contratos', 'full'),
  ('administrativo', 'Cotizaciones', 'full'), ('administrativo', 'Clientes', 'full'),
  ('administrativo', 'CRM / Prospectos', 'full'), ('administrativo', 'Mantenimiento', 'full'),
  ('administrativo', 'Daños', 'full'), ('administrativo', 'Refacciones', 'full'),
  ('administrativo', 'Gastos', 'full'), ('administrativo', 'Proveedores', 'full'),
  ('administrativo', 'Reportes', 'read'), ('administrativo', 'Configuración', 'full'),
  ('administrativo', 'Gestión de Usuarios', 'none'),

  -- Ventas
  ('ventas', 'Dashboard', 'read'), ('ventas', 'Flota', 'read'),
  ('ventas', 'Reservas', 'read'), ('ventas', 'Calendario', 'read'),
  ('ventas', 'Entregas', 'none'), ('ventas', 'Facturas', 'none'),
  ('ventas', 'Pagos', 'none'), ('ventas', 'Contratos', 'none'),
  ('ventas', 'Cotizaciones', 'full'), ('ventas', 'Clientes', 'full'),
  ('ventas', 'CRM / Prospectos', 'full'), ('ventas', 'Mantenimiento', 'none'),
  ('ventas', 'Daños', 'none'), ('ventas', 'Refacciones', 'none'),
  ('ventas', 'Gastos', 'none'), ('ventas', 'Proveedores', 'none'),
  ('ventas', 'Reportes', 'read'), ('ventas', 'Configuración', 'none'),
  ('ventas', 'Gestión de Usuarios', 'none'),

  -- Despachador
  ('dispatcher', 'Dashboard', 'read'), ('dispatcher', 'Flota', 'read'),
  ('dispatcher', 'Reservas', 'full'), ('dispatcher', 'Calendario', 'full'),
  ('dispatcher', 'Entregas', 'full'), ('dispatcher', 'Facturas', 'read'),
  ('dispatcher', 'Pagos', 'none'), ('dispatcher', 'Contratos', 'read'),
  ('dispatcher', 'Cotizaciones', 'full'), ('dispatcher', 'Clientes', 'read'),
  ('dispatcher', 'CRM / Prospectos', 'full'), ('dispatcher', 'Mantenimiento', 'none'),
  ('dispatcher', 'Daños', 'none'), ('dispatcher', 'Refacciones', 'none'),
  ('dispatcher', 'Gastos', 'none'), ('dispatcher', 'Proveedores', 'none'),
  ('dispatcher', 'Reportes', 'read'), ('dispatcher', 'Configuración', 'none'),
  ('dispatcher', 'Gestión de Usuarios', 'none'),

  -- Mecánico
  ('mechanic', 'Dashboard', 'none'), ('mechanic', 'Flota', 'read'),
  ('mechanic', 'Reservas', 'none'), ('mechanic', 'Calendario', 'none'),
  ('mechanic', 'Entregas', 'none'), ('mechanic', 'Facturas', 'none'),
  ('mechanic', 'Pagos', 'none'), ('mechanic', 'Contratos', 'none'),
  ('mechanic', 'Cotizaciones', 'none'), ('mechanic', 'Clientes', 'none'),
  ('mechanic', 'CRM / Prospectos', 'none'), ('mechanic', 'Mantenimiento', 'full'),
  ('mechanic', 'Daños', 'full'), ('mechanic', 'Refacciones', 'full'),
  ('mechanic', 'Gastos', 'none'), ('mechanic', 'Proveedores', 'none'),
  ('mechanic', 'Reportes', 'none'), ('mechanic', 'Configuración', 'none'),
  ('mechanic', 'Gestión de Usuarios', 'none'),

  -- Auditor: read-only everything
  ('auditor', 'Dashboard', 'read'), ('auditor', 'Flota', 'read'),
  ('auditor', 'Reservas', 'read'), ('auditor', 'Calendario', 'read'),
  ('auditor', 'Entregas', 'read'), ('auditor', 'Facturas', 'read'),
  ('auditor', 'Pagos', 'read'), ('auditor', 'Contratos', 'read'),
  ('auditor', 'Cotizaciones', 'read'), ('auditor', 'Clientes', 'read'),
  ('auditor', 'CRM / Prospectos', 'read'), ('auditor', 'Mantenimiento', 'read'),
  ('auditor', 'Daños', 'read'), ('auditor', 'Refacciones', 'read'),
  ('auditor', 'Gastos', 'read'), ('auditor', 'Proveedores', 'read'),
  ('auditor', 'Reportes', 'read'), ('auditor', 'Configuración', 'read'),
  ('auditor', 'Gestión de Usuarios', 'read');
