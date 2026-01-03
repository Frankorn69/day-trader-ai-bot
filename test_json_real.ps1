$url = "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=5"
$response = Invoke-RestMethod -Uri $url -Method Get

Write-Host "Type: $($response.GetType().FullName)"
if ($response.Count -gt 0) {
    Write-Host "Item Type: $($response[0].GetType().FullName)"
}

$json = $response | ConvertTo-Json -Depth 4 -Compress
Write-Host "JSON: $json"
