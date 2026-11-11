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
# Try Segoe UI or Arial or Montserrat
$font = New-Object System.Drawing.Font($fontFamily, 150, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

$stringFormat = New-Object System.Drawing.StringFormat
$stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
$stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

$rect = New-Object System.Drawing.RectangleF(0, 0, $width, $height)
$g.DrawString("Paayh", $font, $textBrush, $rect, $stringFormat)

$outputPath = "C:\Users\USER\Desktop\xea-mobile\assets\icon-dark-brand.png"
$bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
Write-Host "Created dark icon at $outputPath"
