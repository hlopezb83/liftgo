-- =====================================================================
-- Multi-organización · Fase 0 (aditiva, sin cambiar comportamiento actual)
-- Crea: organizations, organization_memberships, organization_customers,
--       customer_portal_accounts + helpers current_organization_id() /
--       current_portal_customer_id(), y hace backfill de la organización
--       existente (HERREN ENERGY), sus usuarios internos, sus clientes y
--       el único acceso de portal.
-- No toca ninguna tabla de negocio existente.
-- =====================================================================

-- ── 1. organizations ─────────────────────────────────────────────────
CREATE TABLE public.organizations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_key UNIQUE (slug),
  CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;

-- ── 2. organization_memberships ──────────────────────────────────────
-- Regla dura: auth_user_id UNIQUE GLOBAL. Ningún auth user (interno o de
-- portal) puede pertenecer a dos organizaciones. Por eso no hay selector.
CREATE TABLE public.organization_memberships (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  auth_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_type      text NOT NULL DEFAULT 'internal',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_memberships_user_unique UNIQUE (auth_user_id),
  CONSTRAINT organization_memberships_type_chk CHECK (member_type IN ('internal', 'portal')),
  CONSTRAINT organization_memberships_org_user_key UNIQUE (organization_id, auth_user_id)
);

CREATE INDEX idx_org_memberships_org ON public.organization_memberships (organization_id);

GRANT SELECT ON public.organization_memberships TO authenticated;
GRANT ALL ON public.organization_memberships TO service_role;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships FORCE ROW LEVEL SECURITY;

-- ── 3. Helper: organización del usuario autenticado ──────────────────
-- SECURITY DEFINER para evitar recursión en las policies que la usan.
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.organization_id
  FROM public.organization_memberships m
  WHERE m.auth_user_id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_organization_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated, service_role;

-- ── 4. organization_customers (puente M:N con datos por relación) ────
-- `customers` queda como identidad global del cliente comercial; los datos
-- comerciales/fiscales propios de cada organización viven aquí.
CREATE TABLE public.organization_customers (
  organization_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  customer_id              uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  organization_customer_id uuid NOT NULL DEFAULT gen_random_uuid(),
  alias                    text,
  razon_social             text,
  rfc                      text,
  regimen_fiscal           text,
  uso_cfdi                 text,
  domicilio_fiscal_cp      text,
  representante_legal      text,
  contact_person           text,
  email                    text,
  phone                    text,
  billing_address          text,
  tax_rate                 numeric NOT NULL DEFAULT 16,
  credit_limit             numeric,
  status                   text NOT NULL DEFAULT 'active',
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_customers_pkey PRIMARY KEY (organization_id, customer_id),
  CONSTRAINT organization_customers_surrogate_key UNIQUE (organization_customer_id),
  CONSTRAINT organization_customers_status_chk CHECK (status IN ('active', 'inactive', 'archived'))
);

CREATE INDEX idx_org_customers_customer ON public.organization_customers (customer_id);
CREATE INDEX idx_org_customers_org ON public.organization_customers (organization_id);

GRANT SELECT, INSERT, UPDATE ON public.organization_customers TO authenticated;
GRANT ALL ON public.organization_customers TO service_role;
ALTER TABLE public.organization_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_customers FORCE ROW LEVEL SECURITY;

-- ── 5. customer_portal_accounts ──────────────────────────────────────
-- Sustituye a customers.user_id. Un email por organización ⇒ un auth user
-- distinto por organización. Una cuenta pertenece a UNA sola organización.
CREATE TABLE public.customer_portal_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  customer_id      uuid NOT NULL,
  auth_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text NOT NULL,
  status           text NOT NULL DEFAULT 'active',
  invited_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_portal_accounts_user_unique UNIQUE (auth_user_id),
  CONSTRAINT customer_portal_accounts_status_chk CHECK (status IN ('active', 'suspended', 'revoked')),
  CONSTRAINT customer_portal_accounts_org_customer_fk
    FOREIGN KEY (organization_id, customer_id)
    REFERENCES public.organization_customers (organization_id, customer_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX customer_portal_accounts_email_unique
  ON public.customer_portal_accounts (lower(email));
CREATE INDEX idx_portal_accounts_org_customer
  ON public.customer_portal_accounts (organization_id, customer_id);

GRANT SELECT ON public.customer_portal_accounts TO authenticated;
GRANT ALL ON public.customer_portal_accounts TO service_role;
ALTER TABLE public.customer_portal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_portal_accounts FORCE ROW LEVEL SECURITY;

-- ── 6. Helper: cliente del portal autenticado ────────────────────────
CREATE OR REPLACE FUNCTION public.current_portal_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.customer_id
  FROM public.customer_portal_accounts a
  WHERE a.auth_user_id = auth.uid()
    AND a.status = 'active'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_portal_customer_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_portal_customer_id() TO authenticated, service_role;

-- ── 7. Trigger: coherencia organización ↔ membresía del portal ───────
-- Toda cuenta de portal debe tener su membresía en la MISMA organización.
CREATE OR REPLACE FUNCTION public.enforce_portal_account_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org
  FROM public.organization_memberships
  WHERE auth_user_id = NEW.auth_user_id;

  IF v_org IS NULL THEN
    INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
    VALUES (NEW.organization_id, NEW.auth_user_id, 'portal');
  ELSIF v_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'El usuario ya pertenece a otra organización; usa un correo distinto para esta organización'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_portal_account_membership
  BEFORE INSERT OR UPDATE OF organization_id, auth_user_id
  ON public.customer_portal_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_portal_account_membership();

-- ── 8. Policies ──────────────────────────────────────────────────────
CREATE POLICY "org_select_own" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.current_organization_id());

CREATE POLICY "org_admin_manage" ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = public.current_organization_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = public.current_organization_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "membership_select_own_org" ON public.organization_memberships
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

CREATE POLICY "org_customers_select" ON public.organization_customers
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND (
      public.current_portal_customer_id() IS NULL
      OR customer_id = public.current_portal_customer_id()
    )
  );

CREATE POLICY "org_customers_write" ON public.organization_customers
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.current_portal_customer_id() IS NULL
    AND (public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'administrativo')
      OR public.has_role(auth.uid(), 'ventas'))
  );

CREATE POLICY "org_customers_update" ON public.organization_customers
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.current_portal_customer_id() IS NULL
    AND (public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'administrativo')
      OR public.has_role(auth.uid(), 'ventas'))
  )
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY "portal_accounts_select" ON public.customer_portal_accounts
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR (
      organization_id = public.current_organization_id()
      AND public.current_portal_customer_id() IS NULL
    )
  );

-- ── 9. Backfill de la organización existente ─────────────────────────
INSERT INTO public.organizations (name, slug)
SELECT COALESCE(NULLIF(btrim(cs.razon_social), ''), 'LiftGo'), 'herren-energy'
FROM public.company_settings cs
ORDER BY cs.created_at
LIMIT 1;

INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
SELECT o.id, p.user_id, 'internal'
FROM public.profiles p
CROSS JOIN (SELECT id FROM public.organizations WHERE slug = 'herren-energy') o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_memberships m WHERE m.auth_user_id = p.user_id
);

INSERT INTO public.organization_customers (
  organization_id, customer_id, alias, razon_social, rfc, regimen_fiscal, uso_cfdi,
  domicilio_fiscal_cp, representante_legal, contact_person, email, phone,
  billing_address, tax_rate, status, notes
)
SELECT o.id, c.id, c.company, c.razon_social, c.rfc, c.regimen_fiscal, c.uso_cfdi,
       c.domicilio_fiscal_cp, c.representante_legal, c.contact_person, c.email, c.phone,
       COALESCE(c.billing_address, c.address), c.tax_rate,
       CASE WHEN c.deleted_at IS NOT NULL THEN 'archived' ELSE 'active' END,
       c.notes
FROM public.customers c
CROSS JOIN (SELECT id FROM public.organizations WHERE slug = 'herren-energy') o;

INSERT INTO public.customer_portal_accounts (organization_id, customer_id, auth_user_id, email)
SELECT o.id, c.id, c.user_id, COALESCE(u.email, c.email, c.id::text || '@sin-correo.local')
FROM public.customers c
JOIN auth.users u ON u.id = c.user_id
CROSS JOIN (SELECT id FROM public.organizations WHERE slug = 'herren-energy') o
WHERE c.user_id IS NOT NULL;
