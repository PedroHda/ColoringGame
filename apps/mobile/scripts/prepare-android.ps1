$ErrorActionPreference = 'Stop'
$appRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nativeRoot = [System.IO.Path]::GetFullPath((Join-Path $appRoot 'android'))
if (-not $nativeRoot.StartsWith($appRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Destino nativo fora do aplicativo.' }
$mainFiles = @(Get-ChildItem -LiteralPath (Join-Path $nativeRoot 'app/src/main/java') -Filter 'MainApplication.*' -Recurse -File -ErrorAction SilentlyContinue)
if ($mainFiles.Count -eq 0) {
  # Windows/OneDrive: fs.cpSync in the Expo CLI can silently leave the native directory absent.
  # Use native filesystem commands to copy the installed official template, then let Expo configure it.
  $templateArchive = Join-Path $appRoot 'node_modules/expo/template.tgz'
  if (-not (Test-Path -LiteralPath $templateArchive)) { throw 'Instale as dependências mobile antes de preparar o Android.' }
  $staging = Join-Path $appRoot ('.expo/native-template-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $staging -Force | Out-Null
  & tar -xf $templateArchive -C $staging
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao extrair o template nativo instalado do Expo.' }
  $templateAndroid = Join-Path $staging 'package/android'
  if (-not (Test-Path -LiteralPath $templateAndroid)) { throw 'O template instalado não contém Android.' }
  Copy-Item -LiteralPath $templateAndroid -Destination $appRoot -Recurse -Force
}
$appConfiguration = Get-Content -LiteralPath (Join-Path $appRoot 'app.json') -Raw | ConvertFrom-Json
$packageName = $appConfiguration.expo.android.package
if ($packageName -notmatch '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$') { throw 'Identificador Android inválido.' }
$javaRoot = Join-Path $nativeRoot 'app/src/main/java'
$packageTarget = [System.IO.Path]::GetFullPath((Join-Path $javaRoot ($packageName.Replace('.', [System.IO.Path]::DirectorySeparatorChar))))
if (-not $packageTarget.StartsWith($nativeRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Pacote fora do projeto Android.' }
New-Item -ItemType Directory -Path $packageTarget -Force | Out-Null
$projectFiles = @(Get-ChildItem -LiteralPath $javaRoot -Recurse -File | Where-Object { $_.Name -in @('MainApplication.kt', 'MainActivity.kt') })
foreach ($projectFile in $projectFiles) {
  $source = [System.IO.Path]::GetFullPath($projectFile.FullName)
  if (-not $source.StartsWith($nativeRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Fonte fora do Android.' }
  $contents = Get-Content -LiteralPath $source -Raw
  $packageDeclaration = [Regex]::Match($contents, '(?m)^package\s+([\w.]+)')
  if (-not $packageDeclaration.Success) { throw ('Declaração de pacote ausente em ' + $projectFile.Name) }
  $contents = $contents.Replace($packageDeclaration.Groups[1].Value, $packageName)
  Set-Content -LiteralPath $source -Value $contents -Encoding utf8
  $destination = [System.IO.Path]::GetFullPath((Join-Path $packageTarget $projectFile.Name))
  if (-not $destination.StartsWith($nativeRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Destino da fonte fora do Android.' }
  if ($source -ne $destination) { Move-Item -LiteralPath $source -Destination $destination -Force }
}
