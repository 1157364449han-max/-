$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$appDirectory = $PSScriptRoot
$dataDirectory = Join-Path (Split-Path -Parent $appDirectory) '董解析数据'
$runtimeDirectory = Join-Path $dataDirectory 'ollama'
$runtimeExecutable = Join-Path $runtimeDirectory 'ollama.exe'
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
if (-not (Test-Path -LiteralPath $runtimeExecutable)) {
    Write-Host '正在下载本地 AI 运行组件（约 1.5 GB），保存在董解析数据文件夹。'
    $archivePath = Join-Path $dataDirectory 'ollama-v0.34.0.zip'
    $checksumPath = Join-Path $dataDirectory 'ollama-v0.34.0-sha256.txt'
    Invoke-WebRequest 'https://github.com/ollama/ollama/releases/download/v0.34.0/ollama-windows-amd64.zip' -OutFile $archivePath -TimeoutSec 1800
    Invoke-WebRequest 'https://github.com/ollama/ollama/releases/download/v0.34.0/sha256sum.txt' -OutFile $checksumPath -TimeoutSec 60
    $expectedHash = ((Get-Content -LiteralPath $checksumPath | Where-Object { $_ -match '  ./ollama-windows-amd64.zip$' }) -split '\s+')[0]
    if (-not $expectedHash -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $expectedHash) {
        throw '下载校验失败，没有运行该文件。请重新安装。'
    }
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeDirectory -Force
}
Write-Host '运行组件已安装。请打开董解析，点击“检测 / 启动”，再点击“下载本地模型”。'
Write-Host '推荐模型为 DeepSeek-R1 Llama 8B（约 4.9 GB，不使用千问底座）。新模型下载并校验成功后会自动删除旧模型。'
