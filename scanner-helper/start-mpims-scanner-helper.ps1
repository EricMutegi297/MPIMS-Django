param(
    [int]$Port = 41527
)

$ErrorActionPreference = "Stop"
$prefix = "http://127.0.0.1:$Port/"
$jpegFormat = "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}"

function Add-CorsHeaders {
    param($Response)
    $Response.Headers["Access-Control-Allow-Origin"] = "*"
    $Response.Headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    $Response.Headers["Access-Control-Allow-Headers"] = "Content-Type"
}

function Write-TextResponse {
    param($Response, [int]$StatusCode, [string]$Message)
    Add-CorsHeaders $Response
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
$listener.Start()

Write-Host "MPIMS scanner helper listening on $prefix"
Write-Host "Leave this window open while scanning from MPIMS. Press Ctrl+C to stop."

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        Add-CorsHeaders $response

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.Close()
            continue
        }

        if ($request.HttpMethod -ne "POST" -or $request.Url.AbsolutePath -ne "/scan") {
            Write-TextResponse $response 404 "Use POST /scan."
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
            Write-TextResponse $response 500 $_.Exception.Message
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
