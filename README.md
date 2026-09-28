# 一周学习时间安排表

宫崎骏水彩风格的一周学习作息表：**把任务做成滑块，拖进任意一天的时间格，滑块长度自动匹配时长。**

![界面预览](docs/screenshot.jpg)

## 下载使用（Windows 桌面版）

到 [Releases](https://github.com/Edoardo-Zhang/study-week-garden/releases/latest) 下载最新版，两种包任选：

| 文件 | 说明 |
|---|---|
| `study-week-garden-Setup-x.y.z.exe` | 安装包：可选安装目录，自动创建桌面/开始菜单快捷方式 |
| `study-week-garden-x.y.z-win-x64.zip` | 便携版：解压后双击里面的 `一周学习时间安排表.exe` 直接用 |

- **完全离线**：站点文件打包在应用内，不联网、不需要域名，断网也能用
- 首次运行 Windows 会提示「未知发布者」（程序没有做代码签名），点 **更多信息 → 仍要运行** 即可
- 只提供 Windows 10/11 x64

## 功能

- **创建任务滑块**：填名称、时长（15~360 分钟）、挑颜色
- **拖拽排布**：把滑块拖到七天时间格的任意位置，自动吸附 15 分钟；与已有安排重叠时自动顺延到最近空档
- **点击编辑**：改名、改时长、换颜色，或直接删除
- **示例安排 / 清空**：一键载入 10 条示例，或清空重来
- **自动保存在本机**：任何改动即时写入本机存储，关掉再打开自动恢复（换电脑/重装不会跟着走）
- **单页零依赖**：原生 HTML + CSS + JavaScript，没有框架、没有构建步骤

## 目录结构

```
index.html            页面骨架
src/app.js            全部逻辑（原生 JS，无依赖）
src/style.css         样式（宫崎骏水彩配色）
assets/bg.webp        背景图 218 KB（WebP）
assets/bg.png         背景图 PNG 兜底（给不认 WebP 的老浏览器）
docs/screenshot.jpg   README 用的界面截图
desktop/              Windows 桌面版（Electron）工程
```

## 自己部署 / 自己构建

**当普通网页跑**：整个仓库就是静态站点，丢到任意静态托管（GitHub Pages、对象存储、Nginx…）即可，不需要后端。

**构建桌面版**（需要 Node.js 18+）：

```powershell
cd desktop
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

产物在 `desktop/dist/`；发布新版本用 `tools\release.ps1 -Version x.y.z`。细节见 [desktop/README.md](desktop/README.md)。
国内构建脚本已内置 npmmirror 镜像，不需要翻墙拉 Electron 二进制。

## 已知问题

- 桌面版**未做代码签名**，首次运行会有「未知发布者」提示（正常现象）
- 数据只存在本机（浏览器 localStorage / 应用自己的本地存储），**不联网、不同步**；强制结束进程或断电可能丢失最近几秒的改动
- 时间轴固定 06:00–24:00，暂时不可配置

## 说明

个人学习用的小工具，代码随意参考。
