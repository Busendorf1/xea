Add-Type -AssemblyName System.Drawing

$width = 1024
$height = 1024
$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)

$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Dark background matching app theme (#0a0a0a)
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 10, 10, 10))
$g.FillRectangle($bgBrush, 0, 0, $width, $height)

# Elegant white brand typography for "Paayh"
$fontFamily = New-Object System.Drawing.FontFamily("Arial")
# Increased font size slightly from 150 to 185 for clean TestFlight app icon visibility
$font = New-Object System.Drawing.Font($fontFamily, 185, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

$stringFormat = New-Object System.Drawing.StringFormat
$stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
$stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

$rect = New-Object System.Drawing.RectangleF(0, 0, $width, $height)
$g.DrawString("Paayh", $font, $textBrush, $rect, $stringFormat)

$paths = @(
    "C:\Users\USER\Desktop\xea-mobile\assets\icon-dark-brand.png",
    "C:\Users\USER\Desktop\xea-mobile\assets\icon.png",
    "C:\Users\USER\Desktop\xea-mobile\assets\adaptive-icon.png"
)

foreach ($outputPath in $paths) {
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Created dark icon at $outputPath"
}

$g.Dispose()
$bmp.Dispose()
