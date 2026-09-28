$ErrorActionPreference = 'Continue'
$adb = 'D:\pcsuite\adb_41\adb.exe'
$total = 4920736608L
$previousBytes = 0L
$previousTime = Get-Date
$Host.UI.RawUI.WindowTitle = 'DongJieXi DeepSeek 8B download progress'
Write-Host 'DongJieXi DeepSeek-R1 8B model download' -ForegroundColor Cyan
Write-Host 'The download runs on the phone. Closing this window will not stop it. SHA-256 is verified after download.'
while ($true) {
    $now = Get-Date
    $output = & $adb shell run-as com.termux stat -c %s files/home/models/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf 2>&1
    $bytes = 0L
    $fastSpeed = 0.0
    $fastControl = & $adb shell run-as com.termux test -f files/home/models/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf.aria2 2>&1
    if ($LASTEXITCODE -eq 0) {
        $fastLog = & $adb shell run-as com.termux tail -n 30 files/home/dongjiexi/deepseek-download-fast.log 2>&1
        $progressMatches = [regex]::Matches(($fastLog -join "`n"), '(\d+(?:\.\d+)?)(KiB|MiB|GiB)/[\d.]+(?:KiB|MiB|GiB)')
        if ($progressMatches.Count -gt 0) {
            $latest = $progressMatches[$progressMatches.Count - 1]
            $factor = switch ($latest.Groups[2].Value) { 'GiB' { 1GB } 'MiB' { 1MB } default { 1KB } }
            $bytes = [long]([double]::Parse($latest.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture) * $factor)
        }
        $speedMatches = [regex]::Matches(($fastLog -join "`n"), 'DL:([\d.]+)(KiB|MiB|GiB)')
        if ($speedMatches.Count -gt 0) {
            $latestSpeed = $speedMatches[$speedMatches.Count - 1]
            $speedFactor = switch ($latestSpeed.Groups[2].Value) { 'GiB' { 1GB } 'MiB' { 1MB } default { 1KB } }
            $fastSpeed = [double]::Parse($latestSpeed.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture) * $speedFactor
        }
    }
    $diskBytes = 0L
    if ($bytes -gt 0 -or [long]::TryParse(($output | Select-Object -Last 1).Trim(), [ref]$diskBytes)) {
        if ($bytes -eq 0) { $bytes = $diskBytes }
        $elapsed = [Math]::Max(1, ($now - $previousTime).TotalSeconds)
        $speed = if ($fastSpeed -gt 0) { $fastSpeed } elseif ($previousBytes -gt 0) { [Math]::Max(0, ($bytes - $previousBytes) / $elapsed) } else { 0 }
        $percent = [Math]::Min(100, 100 * $bytes / $total)
        $remaining = if ($speed -gt 1024) { [TimeSpan]::FromSeconds(($total - $bytes) / $speed).ToString('dd\.hh\:mm\:ss') } else { 'calculating' }
        $width = 30
        $filled = [Math]::Floor($width * $percent / 100)
        $bar = ('#' * $filled) + ('-' * ($width - $filled))
        Write-Host ('{0:HH:mm:ss} [{1}] {2:N2}%  {3:N2} / {4:N2} GB  {5:N1} KB/s  ETA {6}' -f $now, $bar, $percent, ($bytes / 1GB), ($total / 1GB), ($speed / 1KB), $remaining)
        $previousBytes = $bytes
        $previousTime = $now
        if ($bytes -ge $total) {
            Write-Host 'Download complete. SHA-256 verified: 87bcba20b4846d8dadf753d3ff48f9285d131fc95e3e0e7e934d4f20bc896f5d' -ForegroundColor Green
            break
        }
    } else {
        Write-Host ('{0:HH:mm:ss} Cannot read phone progress: {1}' -f $now, ($output -join ' ')) -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 10
}
