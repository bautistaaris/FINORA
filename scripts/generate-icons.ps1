Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

function New-FinoraIcon([int]$size, [string]$path) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(26, 28, 31))
    $radius = [int]($size * 0.22)
    $path_obj = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path_obj.AddArc(0, 0, $radius * 2, $radius * 2, 180, 90)
    $path_obj.AddArc($size - $radius * 2, 0, $radius * 2, $radius * 2, 270, 90)
    $path_obj.AddArc($size - $radius * 2, $size - $radius * 2, $radius * 2, $radius * 2, 0, 90)
    $path_obj.AddArc(0, $size - $radius * 2, $radius * 2, $radius * 2, 90, 90)
    $path_obj.CloseFigure()
    $g.FillPath($bg, $path_obj)

    $green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(104, 219, 169))
    $barH = [int]($size * 0.094)
    $barW1 = [int]($size * 0.50)
    $barW2 = [int]($size * 0.44)
    $barW3 = [int]($size * 0.28)
    $dotR = [int]($size * 0.047)
    $xLeft = [int]($size * 0.19)
    $y1 = [int]($size * 0.31)
    $y2 = [int]($size * 0.47)
    $y3 = [int]($size * 0.625)

    $g.FillRectangle($green, $xLeft, $y1, $barW1, $barH)
    $g.FillRectangle($green, $xLeft, $y2, $barW2, $barH)
    $g.FillRectangle($green, $xLeft, $y3, $barW3, $barH)

    $dotX = [int]($size * 0.625)
    $dotY = $y3 + [int]($barH / 2)
    $g.FillEllipse($green, $dotX, $dotY - $dotR, $dotR * 2, $dotR * 2)

    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$iconsDir = "C:\Users\lenny\OneDrive\Escritorio\Proyectos\FINORA\public\icons"
if (-not (Test-Path -LiteralPath $iconsDir)) {
    New-Item -ItemType Directory -Path $iconsDir -Force | Out-Null
}

New-FinoraIcon 192 (Join-Path $iconsDir "icon-192.png")
New-FinoraIcon 512 (Join-Path $iconsDir "icon-512.png")
New-FinoraIcon 180 (Join-Path $iconsDir "apple-touch-icon.png")
New-FinoraIcon 32 (Join-Path $iconsDir "favicon.png")
# also a 16px for legacy
New-FinoraIcon 16 (Join-Path $iconsDir "favicon-16.png")
# maskable 512 (with safe zone padding)
New-FinoraIcon 512 (Join-Path $iconsDir "icon-maskable-512.png")

Write-Host "PNGs generados:"
Get-ChildItem -LiteralPath $iconsDir -Filter "*.png" | Select-Object Name, Length | Format-Table -AutoSize