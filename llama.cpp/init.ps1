#Requires -Version 5.1
<#
.SYNOPSIS
    Cross-platform llama.cpp server initializer — native Windows PowerShell version.
.DESCRIPTION
    Installs llama.cpp (if needed), discovers a GGUF model, and starts the server.
    Override behaviour with environment variables (see defaults below).
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# ── Defaults (override via environment) ────────────────────────────────────────
$LlamaHost        = if ($env:LLAMA_HOST)          { $env:LLAMA_HOST }          else { 'http://127.0.0.1:11434' }
$LlamaPort        = if ($env:LLAMA_PORT)          { $env:LLAMA_PORT }          else { '11434' }
$LlamaBindHost    = if ($env:LLAMA_BIND_HOST)     { $env:LLAMA_BIND_HOST }     else { '127.0.0.1' }
$LlamaCtx         = if ($env:LLAMA_CTX)           { $env:LLAMA_CTX }           else { '4096' }
$LlamaGpuLayers   = if ($env:LLAMA_GPU_LAYERS)    { $env:LLAMA_GPU_LAYERS }    else { '99' }
$LlamaFlashAttn   = if ($env:LLAMA_FLASH_ATTN)    { $env:LLAMA_FLASH_ATTN }    else { '0' }
$LlamaCacheTypeK  = $env:LLAMA_CACHE_TYPE_K
$LlamaCacheTypeV  = $env:LLAMA_CACHE_TYPE_V
$LlamaModelsPreset = $env:LLAMA_MODELS_PRESET

$AiHome = if ($env:AI_HOME) { $env:AI_HOME } else { Join-Path $HOME '.ai' }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$LogFile   = Join-Path $ScriptDir 'init.ps1.log'

function Log($msg) {
    $ts = Get-Date -Format 'HH:mm:ss'
    $line = "$ts $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

# ── Installation ───────────────────────────────────────────────────────────────
Log 'Initializing on Windows ...'

if (-not (Get-Command 'llama-server' -ErrorAction SilentlyContinue)) {
    Log 'llama-server not found. Attempting installation ...'
    if (Get-Command 'winget' -ErrorAction SilentlyContinue) {
        winget install --id=ggml-org.llama.cpp -e --accept-source-agreements --accept-package-agreements
    }
    elseif (Get-Command 'scoop' -ErrorAction SilentlyContinue) {
        scoop install llama.cpp
    }
    else {
        Log 'ERROR: Cannot auto-install. Download from https://github.com/ggml-org/llama.cpp/releases'
        exit 1
    }

    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path', 'User')

    if (-not (Get-Command 'llama-server' -ErrorAction SilentlyContinue)) {
        Log 'ERROR: llama-server still not found after install. Add it to PATH and retry.'
        exit 1
    }
}

# Create directory structure
$modelsDir = Join-Path $AiHome 'models'
if (-not (Test-Path $modelsDir)) { New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null }

# ── Model selection ────────────────────────────────────────────────────────────
$LlamaModel = $env:LLAMA_MODEL
if (-not $LlamaModel) {
    $gguf = Get-ChildItem -Path $modelsDir -Filter '*.gguf' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($gguf) { $LlamaModel = $gguf.FullName }
}

if (-not $LlamaModel) {
    Log 'ERROR: No GGUF model found. Set $env:LLAMA_MODEL to the path of your .gguf file.'
    exit 1
}

Log "Model: $LlamaModel"

# ── Build server command ───────────────────────────────────────────────────────
$args = @(
    '--model',        $LlamaModel,
    '--host',         $LlamaBindHost,
    '--port',         $LlamaPort,
    '--ctx-size',     $LlamaCtx,
    '--n-gpu-layers', $LlamaGpuLayers
)

if ($LlamaModelsPreset -and (Test-Path $LlamaModelsPreset)) {
    $args += '--models-preset', $LlamaModelsPreset
    Log "Models preset: $LlamaModelsPreset"
}

if ($LlamaFlashAttn -eq '1') {
    $args += '--flash-attn'
}

if ($LlamaCacheTypeK) { $args += '--cache-type-k', $LlamaCacheTypeK }
if ($LlamaCacheTypeV) { $args += '--cache-type-v', $LlamaCacheTypeV }

# Vision projector auto-detect
$modelDir = Split-Path -Parent $LlamaModel
$mmproj = Get-ChildItem -Path $modelDir -Filter '*mmproj*' -File -ErrorAction SilentlyContinue | Select-Object -First 1
if ($mmproj) {
    Log "Vision projector found: $($mmproj.FullName)"
    $args += '--mmproj', $mmproj.FullName
}

# ── Start the server ───────────────────────────────────────────────────────────
Log "Starting llama-server on ${LlamaBindHost}:${LlamaPort}"
Start-Process -FilePath 'llama-server' -ArgumentList $args -WindowStyle Hidden

# ── Wait for readiness ─────────────────────────────────────────────────────────
$maxRetries  = 60
$retryDelay  = 1

Log 'Waiting for llama-server to be ready...'
for ($i = 1; $i -le $maxRetries; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "$LlamaHost/health" -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Log "llama-server is ready (attempt $i)"
            break
        }
    } catch {
        Log "Attempt $i/$maxRetries - retrying in ${retryDelay}s ..."
        Start-Sleep -Seconds $retryDelay
    }

    if ($i -eq $maxRetries) {
        Log "ERROR: llama-server failed to start after $maxRetries attempts."
        exit 1
    }
}

# ── Optional: download an extra model ─────────────────────────────────────────
if ($env:EXTRA_MODEL_URL) {
    $dest = Join-Path $modelsDir (Split-Path -Leaf $env:EXTRA_MODEL_URL)
    Log "Downloading extra model: $($env:EXTRA_MODEL_URL)"
    try {
        Invoke-WebRequest -Uri $env:EXTRA_MODEL_URL -OutFile $dest -UseBasicParsing
        Log "Successfully downloaded extra model to $dest"
    } catch {
        Log "Failed to download extra model: $_"
    }
}

Log "Done. API available at $LlamaHost/v1"
