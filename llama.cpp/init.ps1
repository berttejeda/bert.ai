#Requires -Version 5.1
<#
.SYNOPSIS
    Cross-platform llama.cpp server initializer — native Windows PowerShell version.
.DESCRIPTION
    Installs llama.cpp (if needed), discovers a GGUF model, and starts the server.
    Supports the same environment variables and CLI flags as start.sh:
      --screen, --enable-all-tools, --enable-<tool>,
      --enable-webui-mcp-proxy, --ui-mcp-proxy=<owner/repo>
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$LogFile   = Join-Path $ScriptDir 'init.ps1.log'

function Log($msg) {
    $ts = Get-Date -Format 'HH:mm:ss'
    $line = "$ts $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

# Load optional env-style settings file (e.g. ~\.ai\llama-server.env)
$DefaultEnvFile = Join-Path $env:USERPROFILE '.ai' 'llama-server.env'
$EnvFile = if ($env:LLAMA_ENV_FILE) { $env:LLAMA_ENV_FILE } else { $DefaultEnvFile }
if (Test-Path $EnvFile) {
    Log "Loaded settings from $EnvFile"
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^\s*#') { return }
        if ($line -match '^\s*(\w+)\s*=\s*(.*?)\s*$') {
            $name = $matches[1]
            $value = $matches[2]
            # Remove surrounding quotes
            if (($value -match '^"(.*)"$') -or ($value -match "^'(.*)'$")) {
                $value = $matches[1]
            }
            # Expand bash-style ${HOME} to Windows %USERPROFILE%
            $value = $value -replace '\$\{HOME\}', $env:USERPROFILE
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

# ── Defaults (override via environment) ────────────────────────────────────────
$LlamaHost         = if ($env:LLAMA_HOST)          { $env:LLAMA_HOST }          else { 'http://127.0.0.1:11434' }
$LlamaPort         = if ($env:LLAMA_PORT)          { $env:LLAMA_PORT }          else { '11434' }
$LlamaBindHost     = if ($env:LLAMA_BIND_HOST)     { $env:LLAMA_BIND_HOST }     else { '127.0.0.1' }
$LlamaCtx          = if ($env:LLAMA_CTX)           { $env:LLAMA_CTX }           else { '4096' }
$LlamaGpuLayers    = if ($env:LLAMA_GPU_LAYERS)    { $env:LLAMA_GPU_LAYERS }    else { '99' }
$LlamaFlashAttn    = if ($env:LLAMA_FLASH_ATTN)    { $env:LLAMA_FLASH_ATTN }    else { '0' }
$LlamaCacheTypeK   = $env:LLAMA_CACHE_TYPE_K
$LlamaCacheTypeV   = $env:LLAMA_CACHE_TYPE_V
$LlamaModelsPreset = $env:LLAMA_MODELS_PRESET
$LlamaWebuiMcpProxy = if ($env:LLAMA_WEBUI_MCP_PROXY) { $env:LLAMA_WEBUI_MCP_PROXY } else { '0' }
$LlamaScreenName   = if ($env:LLAMA_SCREEN_NAME)   { $env:LLAMA_SCREEN_NAME }   else { 'llamacpp' }
$AiHome            = if ($env:AI_HOME)             { $env:AI_HOME }             else { Join-Path $env:USERPROFILE '.ai' }
$McpBaseDir        = if ($env:LLAMA_MCP_BASE_DIR)  { $env:LLAMA_MCP_BASE_DIR }  else { Join-Path $AiHome 'mcp-servers' }

# ── CLI argument parsing ───────────────────────────────────────────────────────
$UseScreen = $false
$ToolsList = @()
if ($env:LLAMA_TOOLS) { $ToolsList = $env:LLAMA_TOOLS -split ',' }

function Usage() {
    $usage = @"
Usage: init.ps1 [OPTIONS]

Options:
  --screen                    Start the server in a hidden process
  --enable-all-tools          Enable all built-in llama-server tools
  --enable-<tool>             Enable a specific built-in tool (e.g. --enable-exec-shell-command)
  --enable-webui-mcp-proxy    Enable the WebUI MCP CORS proxy
  --ui-mcp-proxy=MCPName      Enable proxy and install/start an MCP server (e.g. chartrambiz/diaMCP)
  --help, -h                  Show this help message
"@
    Write-Host $usage
}

function Ensure-DockerHost() {
    if ($env:DOCKER_HOST) { return }

    $podman = Get-Command 'podman' -ErrorAction SilentlyContinue
    if ($podman) {
        try {
            $socket = (& podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>$null | Out-String).Trim()
        } catch { $socket = $null }
        if ($socket -and (Test-Path $socket)) {
            $env:DOCKER_HOST = "unix://$socket"
            Log "Using Podman socket for DOCKER_HOST: $($env:DOCKER_HOST)"
            return
        }
    }

    $docker = Get-Command 'docker' -ErrorAction SilentlyContinue
    if ($docker) {
        try { docker info 2>&1 | Out-Null } catch {
            Log 'Warning: docker is installed but the Docker daemon is not reachable. MCP setup may fail.'
        }
    }
}

function Setup-McpServer($mcpName) {
    Ensure-DockerHost
    Log "Setting up MCP server: $mcpName"

    switch ($mcpName) {
        'chartrambiz/diaMCP' {
            $repoDir = Join-Path $McpBaseDir 'diaMCP'
            if ((Test-Path (Join-Path $repoDir '.git')) -and (Test-Path (Join-Path $repoDir 'docker-compose.yml'))) {
                Log 'diaMCP already installed; updating/restarting...'
                Push-Location $repoDir
                try {
                    Invoke-Expression (Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/chartrambiz/diaMCP/master/install.ps1' -UseBasicParsing)
                } finally { Pop-Location }
            } else {
                New-Item -ItemType Directory -Path $McpBaseDir -Force | Out-Null
                Push-Location $McpBaseDir
                try {
                    Invoke-Expression (Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/chartrambiz/diaMCP/master/install.ps1' -UseBasicParsing)
                } finally { Pop-Location }
            }

            # Pin mcp to v1.x to avoid the FastMCP removal in mcp 2.0
            $req = Join-Path $repoDir 'requirements.txt'
            if (Test-Path $req) {
                $content = Get-Content $req -Raw
                if ($content -match 'mcp\[cli\]>=1\.0\.0') {
                    $new = $content -replace 'mcp\[cli\]>=1\.0\.0', 'mcp[cli]>=1.0.0,<2.0.0'
                    $new | Set-Content $req
                    Log 'Patched mcp dependency to v1.x; rebuilding container...'
                    Push-Location $repoDir
                    try {
                        docker compose up --build -d
                    } finally { Pop-Location }
                }
            }
            break
        }
        default {
            Log "MCP server '$mcpName' is not supported by this script yet."
            exit 1
        }
    }
}

$i = 0
while ($i -lt $args.Count) {
    $arg = $args[$i]
    switch -Regex ($arg) {
        '^--help$|^-h$' {
            Usage
            exit 0
            break
        }
        '^--screen$' {
            $UseScreen = $true
            break
        }
        '^--enable-all-tools$' {
            $ToolsList = @('all')
            break
        }
        '^--enable-webui-mcp-proxy$|^--enable-mcp-proxy$' {
            $LlamaWebuiMcpProxy = '1'
            break
        }
        '^--ui-mcp-proxy=(.+)$' {
            Setup-McpServer $matches[1]
            $LlamaWebuiMcpProxy = '1'
            break
        }
        '^--enable-(.+)$' {
            $tool = $matches[1] -replace '-', '_'
            if ($ToolsList -notcontains 'all') {
                $ToolsList += $tool
            }
            break
        }
        default {
            Log "Unknown option: $arg"
            Usage
            exit 1
        }
    }
    $i++
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
$serverArgs = @(
    '--model',        $LlamaModel,
    '--host',         $LlamaBindHost,
    '--port',         $LlamaPort,
    '--ctx-size',     $LlamaCtx,
    '--n-gpu-layers', $LlamaGpuLayers
)

if ($LlamaModelsPreset -and (Test-Path $LlamaModelsPreset)) {
    $serverArgs += '--models-preset', $LlamaModelsPreset
    Log "Models preset: $LlamaModelsPreset"
}

if ($LlamaFlashAttn -eq '1') {
    $serverArgs += '--flash-attn'
}

if ($LlamaCacheTypeK) { $serverArgs += '--cache-type-k', $LlamaCacheTypeK }
if ($LlamaCacheTypeV) { $serverArgs += '--cache-type-v', $LlamaCacheTypeV }

if ($ToolsList.Count -gt 0) {
    if ($ToolsList -contains 'all') {
        $serverArgs += '--tools', 'all'
    } else {
        $serverArgs += '--tools', ($ToolsList -join ',')
    }
    Log "Enabled tools: $($ToolsList -join ',')"
}

if ($LlamaWebuiMcpProxy -eq '1') {
    $serverArgs += '--ui-mcp-proxy'
    Log 'WebUI MCP proxy enabled'
}

# Vision projector auto-detect
$modelDir = Split-Path -Parent $LlamaModel
$mmproj = Get-ChildItem -Path $modelDir -Filter '*mmproj*' -File -ErrorAction SilentlyContinue | Select-Object -First 1
if ($mmproj) {
    Log "Vision projector found: $($mmproj.FullName)"
    $serverArgs += '--mmproj', $mmproj.FullName
}

# ── Start the server ───────────────────────────────────────────────────────────
Log "Starting llama-server on ${LlamaBindHost}:${LlamaPort}"
$startParams = @{
    FilePath     = 'llama-server'
    ArgumentList = $serverArgs
    WindowStyle  = 'Hidden'
}
Start-Process @startParams

# ── Wait for readiness ─────────────────────────────────────────────────────────
$maxRetries = 60
$retryDelay = 1
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
