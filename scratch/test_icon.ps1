Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile('C:\Users\USER\Desktop\xea-mobile\assets\icon.png')
Write-Host "Width: $($img.Width), Height: $($img.Height)"
# Check horizontal slice at y=512
$whitePixels = 0
for ($x = 0; $x -lt $img.Width; $x += 10) {
    $c = $img.GetPixel($x, 512)
    if ($c.R -gt 240 -and $c.G -gt 240 -and $c.B -gt 240) {
        $whitePixels++
    }
}
Write-Host "White pixels in center horizontal line: $whitePixels / $($img.Width / 10)"
$img.Dispose()
