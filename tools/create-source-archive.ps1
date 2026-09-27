param(
    [string]$OutputPath = (Join-Path (Split-Path $PSScriptRoot -Parent) "MPIMS-Django-source.zip"),
    [switch]$Force
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputPath)
$repoPrefix = $repoRoot.TrimEnd("\") + "\"
if ($outputPath.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Choose an archive path outside the repository."
}
if ((Test-Path -LiteralPath $outputPath) -and -not $Force) {
    throw "Archive already exists. Choose another path or rerun with -Force."
}
if ((Test-Path -LiteralPath $outputPath) -and $Force) {
    Remove-Item -LiteralPath $outputPath -Force
}

$excludedDirectories = @(
    ".git", ".venv", "venv", "env", "node_modules", "build", "dist",
    "__pycache__", "media", "staticfiles", ".pytest_cache", ".mypy_cache",
    "coverage", ".idea", ".vscode"
)
$stack = [System.Collections.Generic.Stack[string]]::new()
$stack.Push($repoRoot)
$files = [System.Collections.Generic.List[System.IO.FileInfo]]::new()

while ($stack.Count -gt 0) {
    $directory = $stack.Pop()
    foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
        if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            continue
        }
        if ($entry.PSIsContainer) {
            if ($excludedDirectories -notcontains $entry.Name) {
                $stack.Push($entry.FullName)
            }
            continue
        }

        $name = $entry.Name
        $isPrivateEnvFile = $name.StartsWith(".env.") -and $name -notlike "*.example"
        $isGeneratedFile = $entry.Extension -in @(
            ".pyc", ".pyo", ".sqlite3", ".log", ".pem", ".key", ".zip"
        )
        if ($name -eq ".env" -or $isPrivateEnvFile -or $isGeneratedFile) {
            continue
        }
        $files.Add($entry)
    }
}

$parentDirectory = Split-Path -Parent $outputPath
if (-not (Test-Path -LiteralPath $parentDirectory)) {
    New-Item -ItemType Directory -Path $parentDirectory -Force | Out-Null
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$archive = $null
try {
    $archive = [System.IO.Compression.ZipFile]::Open(
        $outputPath,
        [System.IO.Compression.ZipArchiveMode]::Create
    )
    foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($repoRoot.Length).TrimStart("\").Replace("\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $file.FullName,
            $relativePath,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
catch {
    if ($archive) {
        $archive.Dispose()
        $archive = $null
    }
    Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue
    throw
}
finally {
    if ($archive) {
        $archive.Dispose()
    }
}

Write-Output "Created source archive with $($files.Count) files: $outputPath"
