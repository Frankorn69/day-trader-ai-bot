$Data = @(
    @(1, 2, 3),
    @(4, 5, 6)
)
$Json1 = $Data | ConvertTo-Json -Depth 1 -Compress
Write-Host "Depth 1: $Json1"

$Json2 = $Data | ConvertTo-Json -Depth 2 -Compress
Write-Host "Depth 2: $Json2"
