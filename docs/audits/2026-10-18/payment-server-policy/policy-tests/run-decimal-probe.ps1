$ErrorActionPreference='Stop'
$auditPgBin='<user>\Documents\Codex\tooling\postgres-17.9\extract\pgsql\bin'
$auditPolicyRoot=(Resolve-Path (Join-Path $PSScriptRoot '../../../../..')).Path
$auditDataExpected=Join-Path $auditPolicyRoot '.local-pg/data-policy'
$auditConnect=@('-X','-h','127.0.0.1','-p','55440','-U','postgres','-v','ON_ERROR_STOP=1','-d','liftgo_payment_policy_fixture')
$env:PGCLIENTENCODING='UTF8'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$auditIdentity=& (Join-Path $auditPgBin 'psql.exe') @auditConnect -qAt -c "SELECT json_build_object('directory',current_setting('data_directory'),'port',inet_server_port())"
if($LASTEXITCODE -ne 0){throw 'Cannot verify policy cluster'}
$auditServer=$auditIdentity | ConvertFrom-Json
if($auditServer.port -ne 55440 -or $auditServer.directory.Replace('/','\').TrimEnd('\') -ine $auditDataExpected.Replace('/','\').TrimEnd('\')){throw 'Refusing unexpected PostgreSQL target'}
$auditIdentity | Set-Content -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot 'decimal-probe-cluster.json')
& (Join-Path $auditPgBin 'psql.exe') @auditConnect -f (Join-Path $PSScriptRoot 'decimal-probe.sql') 2>&1 | Tee-Object -FilePath (Join-Path $PSScriptRoot 'decimal-probe-run.log')
if($LASTEXITCODE -ne 0){throw 'Standalone decimal probe failed'}
& (Join-Path $auditPgBin 'psql.exe') @auditConnect -qAt -f (Join-Path $PSScriptRoot 'decimal-probe-export.sql') -o (Join-Path $PSScriptRoot 'decimal-probe-results.json')
if($LASTEXITCODE -ne 0){throw 'Standalone decimal probe export failed'}
Get-Content -LiteralPath (Join-Path $PSScriptRoot 'decimal-probe-results.json') -Encoding UTF8 -Raw
