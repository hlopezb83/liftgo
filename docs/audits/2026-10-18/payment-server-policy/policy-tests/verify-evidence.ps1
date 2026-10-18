$ErrorActionPreference='Stop'
$auditRed=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'red-final-results.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$auditGreen=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'green-final-results.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$auditPreflight=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'current-preflight.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$auditDerived=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'current-derived-function.json') -Raw -Encoding UTF8 | ConvertFrom-Json).result.rows[0]
$auditSourceFunctions=@($auditPreflight.catalog.rows[0].metadata.functions)+@($auditPreflight.dependencies.rows[0].metadata.functions)+@($auditDerived)
function Normalize-Definition([string]$definition){return $definition.Trim().TrimEnd(';').Trim()}
if($auditRed.summary.total -ne 106 -or $auditRed.summary.failed -ne 44){throw 'Unexpected red summary'}
if($auditGreen.summary.total -ne 106 -or $auditGreen.summary.failed -ne 0){throw 'Unexpected green summary'}
foreach($auditBefore in $auditRed.expectations){
  $auditAfter=$auditGreen.expectations | Where-Object name -eq $auditBefore.name
  if(!$auditAfter -or ($auditBefore.expected | ConvertTo-Json -Compress) -ne ($auditAfter.expected | ConvertTo-Json -Compress)){throw "Changed expectation: $($auditBefore.name)"}
}
if($auditRed.baseline_functions.Count -ne 10){throw 'Missing baseline function hashes'}
foreach($auditBaseline in $auditRed.baseline_functions){
  $auditName=($auditBaseline.name -replace '^public\.','') -replace '\(.*$',''
  $auditSource=$auditSourceFunctions | Where-Object name -eq $auditName | Select-Object -First 1
  if(!$auditSource -or (Normalize-Definition $auditBaseline.definition) -ne (Normalize-Definition $auditSource.definition)){throw "Baseline differs from catalog: $auditName"}
  $auditGreenBaseline=$auditGreen.baseline_functions | Where-Object name -eq $auditBaseline.name
  if($auditGreenBaseline.md5 -ne $auditBaseline.md5){throw "Different phase baseline: $auditName"}
}
foreach($auditUnchanged in @('fx_convert_amount','fx_is_missing','prevent_payment_delete_when_rep_stamped','prevent_payment_mutation_when_rep_stamped')){
  $auditBefore=$auditRed.baseline_functions | Where-Object { $_.name -like "$auditUnchanged(*)" }
  $auditAfter=$auditGreen.installed_functions | Where-Object name -eq $auditBefore.name
  if($auditBefore.md5 -ne $auditAfter.md5){throw "Changed protected helper/REP function: $auditUnchanged"}
}
$auditInvoiceTrigger=$auditGreen.installed_triggers | Where-Object name -eq 'trg_guard_invoice_status_integrity'
if(!$auditInvoiceTrigger){throw 'Real invoice-integrity trigger was not installed'}
$auditAmountTrigger=$auditGreen.installed_triggers | Where-Object name -eq 'trg_enforce_payment_within_invoice_total'
if($auditAmountTrigger.definition -notmatch 'UPDATE OF amount, invoice_id, currency, exchange_rate'){throw 'Missing currency/rate guard wiring'}
$auditCandidateHash=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'candidate-02.sql') -Algorithm SHA256).Hash
if($auditCandidateHash -ne '9261E8B61C0F699AE57B336A36982A4ACF4868E2984712302AC92D0222E91271'){throw 'Different tested candidate bytes'}
Write-Output 'PASS: identical 106 expectations; red 44 failures -> green 0 failures; all 10 baseline definitions match catalog snapshots.'
Write-Output 'PASS: canonical FX and REP guards unchanged; real invoice-integrity trigger installed; amount/currency/rate wiring verified.'
Write-Output "PASS: candidate SHA256 $auditCandidateHash"

$auditVectors=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'fx-vectors-results.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$auditClientRed=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'client-red-results.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$auditClientGreen=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'client-green-results.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$auditProbe=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decimal-probe-results.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($auditVectors.count -ne 48 -or $auditVectors.vectors.Count -ne 48){throw 'Unexpected independent vector count'}
$auditFx=$auditGreen.installed_functions | Where-Object name -eq 'fx_convert_amount(numeric,text,text,numeric,numeric)'
if($auditVectors.function_md5 -ne $auditFx.md5){throw 'Vector oracle differs from tested SQL FX function'}
if($auditClientRed.numTotalTests -ne 53 -or $auditClientRed.numFailedTests -ne 10 -or $auditClientGreen.numTotalTests -ne 53 -or $auditClientGreen.numFailedTests -ne 0){throw 'Unexpected client before/after summaries'}
if(!$auditProbe.assertion_passed -or !$auditProbe.comparable_suite_unchanged -or $auditProbe.sql_canonical -ne 2500 -or $auditProbe.update.sqlstate -ne '00000' -or $auditProbe.after.status -ne 'paid'){throw 'Standalone decimal SQL probe mismatch'}
$auditClientManifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'client-source-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($auditClientSource in $auditClientManifest){
  if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $auditClientSource.snapshot) -Algorithm SHA256).Hash -ne $auditClientSource.sha256){throw "Client snapshot changed: $($auditClientSource.snapshot)"}
}
Write-Output 'PASS: 48 independent SQL vectors; client 43/53 -> 53/53; standalone decimal UPDATE accepted with paid status; client snapshots hash-verified.'
