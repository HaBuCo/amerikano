$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$cardDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets\cards'))
if (-not $cardDirectory.StartsWith([System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')))) {
  throw 'Card asset path escaped the project directory.'
}

foreach ($file in Get-ChildItem -LiteralPath $cardDirectory -Filter '*.png' -File) {
  $source = [System.Drawing.Image]::FromFile($file.FullName)
  try {
    if ($source.Width -le 300 -and $source.Height -le 420) { continue }
    $target = New-Object System.Drawing.Bitmap 300, 420, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($target)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($source, 0, 0, 300, 420)
      } finally {
        $graphics.Dispose()
      }
      $temporary = $file.FullName + '.optimized.png'
      $target.Save($temporary, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $target.Dispose()
    }
  } finally {
    $source.Dispose()
  }
  Move-Item -LiteralPath $temporary -Destination $file.FullName -Force
}

Write-Output 'Card assets optimized to 300x420.'
