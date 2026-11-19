param(
    [int]$Port = 41527,
    [string[]]$AllowedOrigins = @(
        "https://marshal.mod.go.ke",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    )
)

$ErrorActionPreference = "Stop"
$prefix = "http://127.0.0.1:$Port/"
$jpegFormat = "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}"

function Test-AllowedOrigin {
    param([string]$Origin)
    foreach ($allowedOrigin in $AllowedOrigins) {
        if ($Origin -ceq $allowedOrigin) {
            return $true
        }
    }
    return $false
}

function Add-CorsHeaders {
    param($Response, [string]$Origin)
    $Response.Headers["Access-Control-Allow-Origin"] = $Origin
    $Response.Headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    $Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-MPIMS-Scanner-Token"
    $Response.Headers["Access-Control-Allow-Private-Network"] = "true"
    $Response.Headers["Vary"] = "Origin"
}

function Write-TextResponse {
    param($Response, [int]$StatusCode, [string]$Message, [string]$Origin = "")
    if ($Origin) {
        Add-CorsHeaders $Response $Origin
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Message)
    $Response.StatusCode = $StatusCode
    $Response.ContentType = "text/plain; charset=utf-8"
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.Close()
}

function Get-FirstScanner {
    $deviceManager = New-Object -ComObject WIA.DeviceManager
    foreach ($deviceInfo in $deviceManager.DeviceInfos) {
        if ($deviceInfo.Type -eq 1) {
            return $deviceInfo.Connect()
        }
    }
    throw "No WIA scanner was found. Confirm the scanner is connected and visible in Windows."
}

function Set-WiaProperty {
    param($Item, [int]$PropertyId, $Value)
    foreach ($property in $Item.Properties) {
        if ($property.PropertyID -eq $PropertyId) {
            $property.Value = $Value
            return
        }
    }
}

function Scan-Document {
    $scanner = Get-FirstScanner
    $item = $scanner.Items.Item(1)

    # Standard WIA scan properties. Unsupported scanners simply ignore failures.
    try { Set-WiaProperty $item 6146 1 } catch {} # Color intent
    try { Set-WiaProperty $item 6147 300 } catch {} # Horizontal DPI
    try { Set-WiaProperty $item 6148 300 } catch {} # Vertical DPI

    $image = $item.Transfer($jpegFormat)
    $path = Join-Path $env:TEMP ("mpims-scan-{0}.jpg" -f ([Guid]::NewGuid().ToString("N")))
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Force
    }
    $image.SaveFile($path)
    try {
        return [System.IO.File]::ReadAllBytes($path)
    } finally {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)

$tokenBytes = New-Object byte[] 32
$randomNumberGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $randomNumberGenerator.GetBytes($tokenBytes)
} finally {
    $randomNumberGenerator.Dispose()
}
$scannerToken = [BitConverter]::ToString($tokenBytes).Replace("-", "").ToLowerInvariant()

$listener.Start()
Write-Host "MPIMS scanner helper listening on $prefix"
Write-Host "Allowed browser origins: $($AllowedOrigins -join ', ')"
Write-Host "Temporary scanner access token (enter it in MPIMS when prompted): $scannerToken" -ForegroundColor Yellow
Write-Host "Leave this window open while scanning from MPIMS. Press Ctrl+C to stop."

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $origin = $request.Headers["Origin"]

        if (-not (Test-AllowedOrigin $origin)) {
            Write-TextResponse $response 403 "Origin is not allowed."
            continue
        }

        Add-CorsHeaders $response $origin

        if ($request.HttpMethod -eq "OPTIONS") {
            $requestedMethod = $request.Headers["Access-Control-Request-Method"]
            $requestedHeaders = $request.Headers["Access-Control-Request-Headers"] -split ","
            $requestedHeaders = @(
                $requestedHeaders |
                    ForEach-Object { $_.Trim().ToLowerInvariant() } |
                    Where-Object { $_ }
            )
            $unsupportedHeaders = @(
                $requestedHeaders | Where-Object {
                    $_ -notin @("content-type", "x-mpims-scanner-token")
                }
            )
            if ($requestedMethod -cne "POST" -or $unsupportedHeaders.Count -gt 0) {
                Write-TextResponse $response 403 "Preflight request is not allowed." $origin
                continue
            }
            $response.StatusCode = 204
            $response.Close()
            continue
        }

        if ($request.HttpMethod -ne "POST" -or $request.Url.AbsolutePath -ne "/scan") {
            Write-TextResponse $response 404 "Use POST /scan." $origin
            continue
        }

        $providedToken = $request.Headers["X-MPIMS-Scanner-Token"]
        if ([string]::IsNullOrWhiteSpace($providedToken) -or $providedToken -cne $scannerToken) {
            Write-TextResponse $response 401 "A valid scanner token is required." $origin
            continue
        }

        try {
            $bytes = Scan-Document
            $response.StatusCode = 200
            $response.ContentType = "image/jpeg"
            $response.Headers["Content-Disposition"] = "attachment; filename=mpims-scan.jpg"
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
        } catch {
            Write-Warning "Scanner request failed: $($_.Exception.Message)"
            Write-TextResponse $response 500 "The scanner could not complete the request." $origin
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
