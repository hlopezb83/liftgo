param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+$')][string]$Phase,
  [string]$CandidateSql
)
$ErrorActionPreference='Stop'
$auditPgBin='<user>\Documents\Codex\tooling\postgres-17.9\extract\pgsql\bin'
$auditPolicyRoot=(Resolve-Path (Join-Path $PSScriptRoot '../../../../..')).Path
$auditDataExpected=Join-Path $auditPolicyRoot '.local-pg/data-policy'
$auditConnect=@('-X','-h','127.0.0.1','-p','55440','-U','postgres','-v','ON_ERROR_STOP=1')
$env:PGCLIENTENCODING='UTF8'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$OutputEncoding=[System.Text.UTF8Encoding]::new($false)

# Guard the exact cluster destination before resetting this fixture database.
$auditIdentity=& (Join-Path $auditPgBin 'psql.exe') @auditConnect -d postgres -qAt -c "SELECT json_build_object('directory',current_setting('data_directory'),'port',inet_server_port())"
if($LASTEXITCODE -ne 0){throw 'Cannot verify policy cluster'}
$auditServer=$auditIdentity | ConvertFrom-Json
if($auditServer.port -ne 55440 -or $auditServer.directory.Replace('/','\').TrimEnd('\') -ine $auditDataExpected.Replace('/','\').TrimEnd('\')){
  throw "Refusing unexpected PostgreSQL target: $auditIdentity"
}
$auditIdentity | Set-Content -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot "$Phase-cluster.json")
& (Join-Path $auditPgBin 'psql.exe') @auditConnect -d postgres -c 'DROP DATABASE IF EXISTS liftgo_payment_policy_fixture WITH (FORCE);' -c 'CREATE DATABASE liftgo_payment_policy_fixture;' 2>&1 |
  Tee-Object -FilePath (Join-Path $PSScriptRoot "$Phase-reset.log")
if($LASTEXITCODE -ne 0){throw 'Cannot recreate isolated policy fixture'}

$auditFiles=@('schema.sql','extracted-functions.sql','projected-balance-view.sql','installed-triggers.sql','baseline-hashes.sql')
$auditFileArgs=@()
foreach($auditFile in $auditFiles){$auditFileArgs+=@('-f',(Join-Path $PSScriptRoot $auditFile))}
& (Join-Path $auditPgBin 'psql.exe') @auditConnect -d liftgo_payment_policy_fixture @auditFileArgs 2>&1 |
  Tee-Object -FilePath (Join-Path $PSScriptRoot "$Phase-setup.log")
if($LASTEXITCODE -ne 0){throw 'Fixture setup failed; this is not a red policy result'}

if($CandidateSql){
  $auditCandidate=(Resolve-Path -LiteralPath $CandidateSql).Path
  if(-not $auditCandidate.StartsWith($PSScriptRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Candidate must be a copied snapshot inside policy-tests'}
  Get-FileHash -LiteralPath $auditCandidate -Algorithm SHA256 | Format-List | Out-String |
    Set-Content -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot "$Phase-candidate-hash.txt")
  & (Join-Path $auditPgBin 'psql.exe') @auditConnect -d liftgo_payment_policy_fixture -f $auditCandidate 2>&1 |
    Tee-Object -FilePath (Join-Path $PSScriptRoot "$Phase-apply.log")
  if($LASTEXITCODE -ne 0){throw 'Candidate failed to load; this is not a green/red policy result'}
}

& (Join-Path $auditPgBin 'psql.exe') @auditConnect -d liftgo_payment_policy_fixture -f (Join-Path $PSScriptRoot 'suite.sql') 2>&1 |
  Tee-Object -FilePath (Join-Path $PSScriptRoot "$Phase-run.log")
$auditSuiteExit=$LASTEXITCODE
'SUITE_EXIT_CODE='+$auditSuiteExit | Tee-Object -FilePath (Join-Path $PSScriptRoot "$Phase-run.log") -Append
& (Join-Path $auditPgBin 'psql.exe') @auditConnect -d liftgo_payment_policy_fixture -qAt -f (Join-Path $PSScriptRoot 'export.sql') -o (Join-Path $PSScriptRoot "$Phase-results.json")
if($LASTEXITCODE -ne 0){throw 'Could not export policy evidence'}
$auditPolicySummary=(Get-Content -LiteralPath (Join-Path $PSScriptRoot "$Phase-results.json") -Raw -Encoding UTF8 | ConvertFrom-Json).summary
Write-Output ($auditPolicySummary | ConvertTo-Json -Compress)
exit $auditSuiteExit
