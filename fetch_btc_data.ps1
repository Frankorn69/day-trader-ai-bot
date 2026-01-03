$ErrorActionPreference = "Stop"

function Get-BinanceKlines {
    param (
        [string]$symbol,
        [string]$interval,
        [long]$startTime,
        [long]$endTime
    )
    $url = "https://api.binance.com/api/v3/klines?symbol=$symbol&interval=$interval&limit=1000&startTime=$startTime&endTime=$endTime"
    try {
        $response = Invoke-RestMethod -Uri $url -Method Get
        return $response
    } catch {
        Write-Host "Error fetching: $_"
        return @()
    }
}

# Config
$Symbol = "BTCUSDT"
$Days = 14
$Now = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$StartTime = $Now - ($Days * 24 * 60 * 60 * 1000)

Write-Host "Fetching 14 Days of BTC Data..."

# 1. Fetch Micro (1m)
$MicroData = @()
$CurrentStart = $StartTime
while ($CurrentStart -lt $Now) {
    Write-Host "Fetching 1m chunk..."
    $Chunk = Get-BinanceKlines -symbol $Symbol -interval "1m" -startTime $CurrentStart -endTime $Now
    if ($Chunk.Count -eq 0) { break }
    $MicroData += $Chunk
    $LastTime = $Chunk[-1][0]
    $CurrentStart = $LastTime + 60000
    Start-Sleep -Milliseconds 200 # Rate limit
}

# 2. Fetch Macro (4h)
$MacroData = @()
$CurrentStart = $StartTime - (50 * 4 * 60 * 60 * 1000) # Buffer for EMA
Write-Host "Fetching 4h chunk..."
# 4h is sparse, we can probably get it all in 1 or 2 requests
while ($CurrentStart -lt $Now) {
    $Chunk = Get-BinanceKlines -symbol $Symbol -interval "4h" -startTime $CurrentStart -endTime $Now
    if ($Chunk.Count -eq 0) { break }
    $MacroData += $Chunk
    $LastTime = $Chunk[-1][0]
    $CurrentStart = $LastTime + (4 * 60 * 60 * 1000)
    Start-Sleep -Milliseconds 200
}

# Format as JS Object
$JsContent = "window.BACKTEST_DATA = { 
    micro: " + ($MicroData | ConvertTo-Json -Depth 1 -Compress) + ",
    macro: " + ($MacroData | ConvertTo-Json -Depth 1 -Compress) + "
};"

$OutFile = "$PSScriptRoot\backtest_data.js"
$JsContent | Set-Content -Path $OutFile -Encoding UTF8

Write-Host "Done! Saved to $OutFile. Micro Candles: $($MicroData.Count)"
