# 一周学习时间安排表 · 桌面版

把仓库根目录的静态站（`index.html` / `src/` / `assets/`）打包成 Windows 桌面程序。
站点文件在构建时复制进 `app/`，运行时用 `file://` 加载 —— **完全离线可用，不联网、不依赖域名**。

## 目录

| 路径 | 说明 |
|---|---|
| `main.js` | Electron 主进程（窗口、菜单、外链拦截、窗口位置记忆） |
| `scripts/stage.mjs` | 把仓库根的站点文件复制到 `app/` |
| `tools/make-icon.py` | 生成 `build/icon.ico`（Pillow，多尺寸 16~256） |
| `tools/build.ps1` | 一键构建（走 npmmirror 镜像） |
| `tools/release.ps1` | 打 tag 并上传到 GitHub Release |
| `build/` | 图标资源（`icon.ico` 提交进仓库） |
| `app/` `dist/` `node_modules/` | 构建产物，已在 .gitignore 中 |

## 构建

```powershell
cd desktop
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

产物在 `dist/`：

- `study-week-garden-Setup-1.0.0.exe` —— NSIS 安装包（可选安装目录、建快捷方式）
- `study-week-garden-1.0.0-win-x64.zip` —— 便携版（解压即用）

国内构建依赖镜像（脚本里已设）：

```
ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/
```

## 发布

```powershell
powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Version 1.0.0
```

会用 `git credential fill` 取本机已保存的 GitHub 凭据建 Release 并上传 `dist/` 里的两个产物，最后回读校验。

## 已知问题

- **未做代码签名**：首次运行 Windows 会提示「未知发布者」，需点「更多信息 → 仍要运行」。
- 应用内是打包时的站点快照，不会自动更新；站点有更新需要升版本重新构建发布。
- 只出 Windows x64；不包含 32 位 / ARM / macOS / Linux。
