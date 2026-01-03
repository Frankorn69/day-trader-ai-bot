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

# Config: 1 YEAR (365 Days)
$Symbol = "BTCUSDT"
$Days = 365
$Now = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$StartTime = $Now - ($Days * 24 * 60 * 60 * 1000)

Write-Host "Fetching 1 YEAR of BTC Data... (This will take ~2-3 minutes)"

# 1. Fetch Micro (1m)
$MicroData = @()
$CurrentStart = $StartTime
$Count = 0

# Progress Bar Logic
while ($CurrentStart -lt $Now) {
    if ($Count % 10 -eq 0) { Write-Host "Fetching chunk starting $([DateTimeOffset]::FromUnixTimeMilliseconds($CurrentStart))..." }
    
    $Chunk = Get-BinanceKlines -symbol $Symbol -interval "1m" -startTime $CurrentStart -endTime $Now
    if ($Chunk.Count -eq 0) { break }
    
    $MicroData += $Chunk
    $LastTime = $Chunk[-1][0]
    $CurrentStart = $LastTime + 60000
    
    $Count++
    Start-Sleep -Milliseconds 100 # Gentle Rate Limit
}

Write-Host "Micro Data Complete. $($MicroData.Count) candles."

# 2. Fetch Macro (4h)
$MacroData = @()
$CurrentStart = $StartTime - (50 * 4 * 60 * 60 * 1000) # Buffer
Write-Host "Fetching 4h macro data..."

while ($CurrentStart -lt $Now) {
    $Chunk = Get-BinanceKlines -symbol $Symbol -interval "4h" -startTime $CurrentStart -endTime $Now
    if ($Chunk.Count -eq 0) { break }
    $MacroData += $Chunk
    $LastTime = $Chunk[-1][0]
    $CurrentStart = $LastTime + (4 * 60 * 60 * 1000)
    Start-Sleep -Milliseconds 100
}

# Format as JS Object
$JsContent = "window.BACKTEST_DATA = { 
    micro: " + ($MicroData | ConvertTo-Json -Depth 1 -Compress) + ",
    macro: " + ($MacroData | ConvertTo-Json -Depth 1 -Compress) + "
};"

$OutFile = "$PSScriptRoot\backtest_data.js"
$JsContent | Set-Content -Path $OutFile -Encoding UTF8

Write-Host "Done! Saved 1 YEAR of data to $OutFile. Total Candles: $($MicroData.Count)"
