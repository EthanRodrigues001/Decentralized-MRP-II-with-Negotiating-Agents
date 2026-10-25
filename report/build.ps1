# Compile the report with MiKTeX.
#
#   .\build.ps1            compile once
#   .\build.ps1 -Clean     delete build artefacts first
#   .\build.ps1 -Watch     recompile whenever a source file changes
#
# Output lands in build\main.pdf. The build folder is git-ignored.

param(
    [switch]$Clean,
    [switch]$Watch
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if ($Clean) {
    if (Test-Path 'build') {
        Remove-Item -Recurse -Force 'build'
        Write-Host 'Removed build/' -ForegroundColor Yellow
    }
}

if (-not (Test-Path 'build')) {
    New-Item -ItemType Directory 'build' | Out-Null
}

# Let MiKTeX pull missing packages itself instead of stopping to ask.
$env:MIKTEX_ENABLEINSTALLER = '1'

$latexmkArgs = @(
    '-pdf'
    '-outdir=build'
    '-interaction=nonstopmode'
    '-file-line-error'
    '-synctex=1'
)

if ($Watch) {
    $latexmkArgs += '-pvc'
    $latexmkArgs += '-view=none'
}

Write-Host 'Compiling main.tex ...' -ForegroundColor Cyan
latexmk @latexmkArgs main.tex
$code = $LASTEXITCODE

if ($code -ne 0) {
    Write-Host ''
    Write-Host "latexmk exited with code $code." -ForegroundColor Red
    Write-Host 'Errors, with the file and line of each:' -ForegroundColor Red
    if (Test-Path 'build\main.log') {
        Select-String -Path 'build\main.log' -Pattern '^.*:\d+:|^!' |
            Select-Object -First 25 |
            ForEach-Object { Write-Host "  $($_.Line)" }
    }
    exit $code
}

Write-Host ''
Write-Host 'Built build\main.pdf' -ForegroundColor Green

# Count the placeholders still left in the document.
$todos = Select-String -Path 'sections\*.tex', 'frontmatter\*.tex', 'metadata.tex' `
                       -Pattern '\\todo\{|TODO:' -ErrorAction SilentlyContinue
if ($todos) {
    Write-Host "$($todos.Count) placeholder(s) remaining:" -ForegroundColor Yellow
    $todos | Group-Object Filename | ForEach-Object {
        Write-Host ("  {0,-28} {1}" -f $_.Name, $_.Count)
    }
}
