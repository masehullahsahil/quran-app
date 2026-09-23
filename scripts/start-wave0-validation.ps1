param(
  [string]$EnvFile = ".env.validation.local",
  [string]$EvaluatorUrl = $env:QURAN_EVALUATOR_URL,
  [int]$Port = 3000,
  [switch]$UseConfiguredDatabase
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
  throw "Environment file '$EnvFile' was not found. Pass -EnvFile with an existing local file."
}

if ([string]::IsNullOrWhiteSpace($EvaluatorUrl)) {
  $EvaluatorUrl = Read-Host "RunPod evaluator base URL (for example https://<pod>-4317.proxy.runpod.net)"
}
$parsedEvaluatorUrl = $null
if (-not [Uri]::TryCreate($EvaluatorUrl, [UriKind]::Absolute, [ref]$parsedEvaluatorUrl) -or
    ($parsedEvaluatorUrl.Scheme -ne "https" -and $parsedEvaluatorUrl.Scheme -ne "http")) {
  throw "The evaluator URL must be an absolute http:// or https:// URL."
}

if ([string]::IsNullOrWhiteSpace($env:QURAN_EVALUATOR_API_KEY)) {
  $secureKey = Read-Host "Paste the RunPod evaluator key" -AsSecureString
  $env:QURAN_EVALUATOR_API_KEY = [System.Net.NetworkCredential]::new("", $secureKey).Password
}
if ([string]::IsNullOrWhiteSpace($env:QURAN_EVALUATOR_API_KEY)) {
  throw "The evaluator key cannot be empty."
}

$env:DOTENV_CONFIG_PATH = (Resolve-Path -LiteralPath $EnvFile).Path
$env:QURAN_VALIDATION_STAFF_API = "1"
$env:QURAN_EVALUATOR_URL = $parsedEvaluatorUrl.AbsoluteUri.TrimEnd("/")
$env:QURAN_EVALUATOR_PRIMARY_CORRECTIONS = "0"
$env:OPENAI_TRANSCRIPTION_MODEL = "gpt-transcribe"
$env:PORT = $Port.ToString()
$env:VERCEL = ""
$env:VERCEL_ENV = ""

# The wiring rehearsal is intentionally unsigned. Unless explicitly opted in,
# prevent a local rehearsal from writing learner state to a configured remote
# database while still allowing startup configuration validation to succeed.
if (-not $UseConfiguredDatabase) {
  $env:DATABASE_URL = "mysql://wave0:wave0@127.0.0.1:1/wave0"
}

Write-Host "Installing the locked dependencies..."
& pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed with exit code $LASTEXITCODE." }

Write-Host ""
Write-Host "Starting the single-instance Wave 0 server."
Write-Host "After 'Server running' appears, open /validation-launcher on the actual port reported by the server."
Write-Host "Press Ctrl+C to stop the local server."
Write-Host ""

& pnpm dev
exit $LASTEXITCODE
