param(
  [string]$Version = '1.0.0',
  [string]$Owner = 'Edoardo-Zhang',
  [string]$Repo  = 'study-week-garden',
  [string]$Title = '',
  [string]$NotesFile = ''
)
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path      # desktop/tools
$desktop = Split-Path -Parent $here
$dist = Join-Path $desktop 'dist'
$proxy = 'http://127.0.0.1:7897'
$nl = [string][char]10
$env:GIT_TERMINAL_PROMPT = '0'

if (-not (Test-Path $dist)) { Write-Host '[release] dist 不存在，先构建'; exit 1 }
$assets = Get-ChildItem $dist -File | Where-Object { $_.Extension -in @('.exe', '.zip') -and $_.Name -notlike '*unpacked*' }
if (-not $assets) { Write-Host '[release] dist 里没有 .exe/.zip 产物'; exit 1 }
if (-not $Title) { $Title = '一周学习时间安排表 桌面版 v' + $Version }

Write-Host '[release] 待上传产物：'
$assets | ForEach-Object { '   {0,10:N1} MB  {1}  {2}' -f ($_.Length/1MB), $_.Name, (Get-FileHash $_.FullName -Algorithm SHA256).Hash }

# 取令牌（不落盘、不打印）
$cred = (('protocol=https' + $nl + 'host=github.com' + $nl + $nl) | & git credential fill 2>$null) | Out-String
$token = (($cred -split $nl | Where-Object { $_ -match '^password=' }) -replace '^password=','').Trim()
if (-not $token) { Write-Host '[release] 取不到 GitHub 令牌'; exit 1 }

# 组装 release 说明
$notes = '## 一周学习时间安排表 · 桌面版 v' + $Version + $nl + $nl
$notes += '- 完全离线可用（站点文件打包在应用内，不联网、不依赖域名）' + $nl
$notes += '- 双击安装包安装，或下载 zip 解压后直接运行' + $nl
$notes += '### 校验值（SHA256）' + $nl + $nl
foreach ($a in $assets) { $notes += '- ' + $a.Name + '  `' + (Get-FileHash $a.FullName -Algorithm SHA256).Hash + '`' + $nl }
$notes += $nl + '### 注意' + $nl + $nl
$notes += '本程序未做代码签名，首次运行 Windows 会提示「未知发布者」，点「更多信息 → 仍要运行」即可。' + $nl
if ($NotesFile -and (Test-Path $NotesFile)) { $notes = (Get-Content $NotesFile -Raw) }
$notes | Set-Content (Join-Path $env:TEMP 'release-notes.md') -Encoding utf8

# 建 release（已存在则复用）
$bodyFile = Join-Path $env:TEMP 'release-body.json'
$payload = @{ tag_name = ('v' + $Version); name = $Title; body = $notes; draft = $false; prerelease = $false } | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($bodyFile, $payload, [Text.UTF8Encoding]::new($false))
$code = & curl.exe -s --http1.1 -o (Join-Path $env:TEMP 'rel.json') -w '%{http_code}' -x $proxy --max-time 90 -X POST -H "Authorization: token $token" -H 'User-Agent: dsh' -H 'Accept: application/vnd.github+json' -d "@$bodyFile" "https://api.github.com/repos/$Owner/$Repo/releases"
Write-Host ('[release] 创建 release -> HTTP ' + $code)
if ($code -ne '201') {
  Write-Host '[release] 可能已存在，改为查询该 tag';
  & curl.exe -s --http1.1 -o (Join-Path $env:TEMP 'rel.json') -x $proxy --max-time 60 -H "Authorization: token $token" -H 'User-Agent: dsh' "https://api.github.com/repos/$Owner/$Repo/releases/tags/v$Version" | Out-Null
}
$rel = Get-Content (Join-Path $env:TEMP 'rel.json') -Raw | ConvertFrom-Json
if (-not $rel.id) { Write-Host '[release] 拿不到 release id，终止'; Write-Host ($rel | ConvertTo-Json -Compress); exit 1 }
Write-Host ('[release] release id = ' + $rel.id + '  tag = ' + $rel.tag_name)

# 上传资产（大文件，逐个重试）
foreach ($a in $assets) {
  Write-Host ('[release] 上传 ' + $a.Name + ' …')
  $ok = $false
  for ($i = 1; $i -le 4; $i++) {
    $up = & curl.exe -s --http1.1 -o (Join-Path $env:TEMP 'asset.json') -w '%{http_code}' -x $proxy --max-time 3600 -X POST -H "Authorization: token $token" -H 'User-Agent: dsh' -H 'Content-Type: application/octet-stream' --data-binary "@$($a.FullName)" "https://uploads.github.com/repos/$Owner/$Repo/releases/$($rel.id)/assets?name=$($a.Name)"
    Write-Host ('   尝试 ' + $i + ' -> HTTP ' + $up)
    if ($up -eq '201') { $ok = $true; break }
    Start-Sleep -Seconds 10
  }
  Write-Host ('   结果: ' + $(if ($ok) { '成功' } else { '失败' }))
}

# 回读校验（先删临时文件：请求失败时会把上一次的旧结果读出来，制造"上传成功"的假象）
$relJson2 = Join-Path $env:TEMP 'rel2.json'
if (Test-Path $relJson2) { Remove-Item $relJson2 -Force }
$rc = & curl.exe -s --http1.1 -o $relJson2 -w '%{http_code}' -x $proxy --max-time 90 -H "Authorization: token $token" -H 'User-Agent: dsh' "https://api.github.com/repos/$Owner/$Repo/releases/tags/v$Version"
if (-not (Test-Path $relJson2)) { Write-Host ('[release] 回读失败（HTTP ' + ($rc -join '') + '），资产清单不可信'); exit 1 }
$rel2 = Get-Content $relJson2 -Raw | ConvertFrom-Json
Write-Host '[release] 线上资产：'
$rel2.assets | ForEach-Object { '   {0,10:N1} MB  {1}  state={2}  digest={3}' -f ($_.size/1MB), $_.name, $_.state, $_.digest }
# 有资产没传上去必须报错退出，否则"部分失败"会被当成成功
$onlineNames = @($rel2.assets | ForEach-Object { $_.name })
$missing = @($assets | Where-Object { $onlineNames -notcontains $_.Name } | ForEach-Object { $_.Name })
if ($missing.Count -gt 0) { Write-Host ('[release] 缺少资产：' + ($missing -join ', ') + ' → 上传未完成'); exit 2 }
Write-Host ('[release] 页面: ' + $rel2.html_url)