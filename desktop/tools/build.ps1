# 构建 Windows 桌面版（安装包 + 便携 zip）
# 用国内镜像，避免从 GitHub 拉 electron / nsis 二进制
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = Split-Path -Parent $here
Set-Location $desktop

$env:ELECTRON_MIRROR = 'https://registry.npmmirror.com/-/binary/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://registry.npmmirror.com/-/binary/electron-builder-binaries/'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'   # 没有代码签名证书，明确跳过签名

if (-not (Test-Path (Join-Path $desktop 'node_modules'))) {
  Write-Host '[build] 安装依赖…'
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Write-Host '[build] npm install 失败'; exit 1 }
}

Write-Host '[build] 复制站点文件…'
& node scripts/stage.mjs
if ($LASTEXITCODE -ne 0) { Write-Host '[build] stage 失败'; exit 1 }

Write-Host '[build] 打包（nsis + zip / x64）…'
& npx electron-builder --win nsis zip --x64
if ($LASTEXITCODE -ne 0) {
  Write-Host '[build] nsis 目标失败，降级为仅 zip…'
  & npx electron-builder --win zip --x64
}

Write-Host '[build] 产物：'
Get-ChildItem (Join-Path $desktop 'dist') -File | ForEach-Object {
  '{0,10:N1} MB  {1}  {2}' -f ($_.Length / 1MB), $_.Name, (Get-FileHash $_.FullName -Algorithm SHA256).Hash
}
