$ErrorActionPreference = 'Stop'
$auditRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../../..')).Path
$auditSnapshotPath = Join-Path $PSScriptRoot '../server-guard/remote-current-payment-guards.json'
$auditMetadata = (Get-Content -LiteralPath $auditSnapshotPath -Raw -Encoding UTF8 | ConvertFrom-Json).result.rows[0].metadata
$auditUtf8 = [System.Text.UTF8Encoding]::new($false)
$auditSources = [System.Collections.Generic.List[string]]::new()

function Read-SourceFunction([string]$relative, [string]$name) {
  $auditPath = Join-Path $auditRoot $relative
  $auditSource = [IO.File]::ReadAllText($auditPath).Replace("`r`n", "`n")
  $auditPattern = '(?s)CREATE OR REPLACE FUNCTION public\.' + [regex]::Escape($name) + '\(.*?\bAS\s+(\$[A-Za-z_0-9]*\$).*?\1;'
  $auditMatch = [regex]::Match($auditSource, $auditPattern)
  if (!$auditMatch.Success) { throw "Missing function $name in $relative" }
  $auditSources.Add($relative)
  return "-- SOURCE: $relative`n$($auditMatch.Value)`n"
}

$auditDefinitions = @('-- Evidence fixture only; exact catalog definitions supplied by parent, plus repository helper definitions.')
foreach ($auditFunction in ($auditMetadata.functions | Sort-Object { if ($_.name -eq 'fx_is_missing') { 0 } elseif ($_.name -eq 'fx_convert_amount') { 1 } else { 2 } })) {
  $auditDefinitions += "-- CURRENT CATALOG: $($auditFunction.name)`n$($auditFunction.definition.TrimEnd(';')) ;`n"
}
$auditSourceFunctions = @(
  @('supabase/migrations/20260901181755_c5d18503-1938-4abb-a1d1-3bf9e8ac896d.sql', 'fx_to_mxn'),
  @('supabase/migrations/20260828003501_74cee74b-b737-4869-866b-ebba4e5a57ef.sql', 'trg_payment_amount_mxn'),
  @('supabase/migrations/20260828003501_74cee74b-b737-4869-866b-ebba4e5a57ef.sql', 'sync_invoice_status_from_payments'),
  @('drizzle/migrations/0041_multi_org_supplier_damage_rpc_org_guard.sql', 'sync_invoice_status'),
  @('supabase/migrations/20260723055526_12338475-a680-484b-b228-725025c63998.sql', 'prevent_payment_delete_when_rep_stamped'),
  @('supabase/migrations/20260729210413_2c933283-5d2b-402d-9f2e-c72814a48147.sql', 'round_payment_amount'),
  @('supabase/migrations/20260825221855_f022c962-9282-439a-a4c8-4d4dc799d9f1.sql', 'trg_payment_date_window'),
  @('supabase/migrations/20260731235443_7b2ca674-f6e0-4b98-95b9-1039fa28abfb.sql', 'today_mty'),
  @('drizzle/migrations/0016_multi_org_phase6_numbering_fiscal_scope.sql', 'trg_guard_payment_fiscal_period'),
  @('drizzle/migrations/0016_multi_org_phase6_numbering_fiscal_scope.sql', 'guard_fiscal_period_open')
)
foreach ($auditSourceFunction in $auditSourceFunctions) {
  $auditDefinitions += Read-SourceFunction $auditSourceFunction[0] $auditSourceFunction[1]
}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'extracted-functions.sql'), ($auditDefinitions -join "`n"), $auditUtf8)

# Keep exact pay and credit-note CTEs from the actual view, project only the tested columns.
$auditCteMatch = [regex]::Match($auditMetadata.view_definition, '(?s)^\s*(WITH pay AS .*?)(?=\s*SELECT i\.id,)')
if (!$auditCteMatch.Success) { throw 'Cannot extract balance-view CTEs' }
$auditView = @"
-- Projection only: pay/cn CTEs below are copied unchanged from current catalog view.
CREATE VIEW public.fixture_invoice_balance WITH (security_invoker = true) AS
$($auditCteMatch.Groups[1].Value)
SELECT i.id, i.invoice_number, i.total, i.moneda, i.tipo_cambio, i.status,
  COALESCE(pay.paid, 0::numeric) AS paid_amount,
  COALESCE(cn.credited, 0::numeric) AS credited_amount,
  GREATEST(i.total - COALESCE(pay.paid, 0::numeric) - COALESCE(cn.credited, 0::numeric), 0::numeric) AS balance,
  COALESCE(pay.fx_missing_payments, 0) AS payments_fx_missing
FROM public.invoices i
LEFT JOIN pay ON pay.invoice_id = i.id
LEFT JOIN cn ON cn.invoice_id = i.id;
"@
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'projected-balance-view.sql'), $auditView, $auditUtf8)

$auditOmittedTriggers = @('audit_payments', 'trg_guard_is_e2e', 'trg_notify_payment_received', 'trg_organization_write_context')
$auditTriggers = @('-- Exact wiring from current catalog; omitted side effects and organization guard are listed in README.')
foreach ($auditTrigger in $auditMetadata.payment_triggers) {
  if ($auditTrigger.name -notin $auditOmittedTriggers) { $auditTriggers += "$($auditTrigger.definition);" }
}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'installed-triggers.sql'), ($auditTriggers -join "`n"), $auditUtf8)

$auditManifest = @{
  repository_sha = (& git -C $auditRoot rev-parse HEAD)
  catalog_observed_at = $auditMetadata.observed_at
  catalog_sha256 = (Get-FileHash -LiteralPath $auditSnapshotPath -Algorithm SHA256).Hash
  omitted_payment_triggers = $auditOmittedTriggers
  repository_sources = @($auditSources | Sort-Object -Unique | ForEach-Object {
    @{ path = $_; sha256 = (Get-FileHash -LiteralPath (Join-Path $auditRoot $_) -Algorithm SHA256).Hash }
  })
}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'source-manifest.json'), ($auditManifest | ConvertTo-Json -Depth 10), $auditUtf8)
Write-Output 'Prepared extracted functions, exact trigger wiring, projected canonical view and source hashes.'
