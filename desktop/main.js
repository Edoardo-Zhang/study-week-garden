'use strict';
/**
 * 一周学习时间安排表 —— 桌面版主进程
 * 站点文件打包在 app/ 里，用 file:// 加载：完全离线可用，不依赖任何域名解析。
 */
const { app, BrowserWindow, Menu, shell, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_TITLE = '一周学习时间安排表';
const ONLINE_URL = 'https://www.qianqizhang.dpdns.org/';
const INDEX = path.join(__dirname, 'app', 'index.html');

let mainWindow = null;

function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (s && Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch (e) { /* 首次运行没有状态文件，忽略 */ }
  return null;
}

function saveState(win) {
  try {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() }), 'utf8');
  } catch (e) { /* 写不进去也不影响使用 */ }
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '打开在线版（浏览器）', click: () => shell.openExternal(ONLINE_URL) },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: APP_TITLE + ' 桌面版 v' + app.getVersion(),
              detail: '离线可用的一周学习时间安排表。\n\n在线版：' + ONLINE_URL + '\n所有数据只存在本机内存里，不上传、不联网。',
              buttons: ['好'],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const st = loadState();
  const work = screen.getPrimaryDisplay().workAreaSize;
  const width = st ? st.width : Math.min(1360, Math.max(960, work.width - 80));
  const height = st ? st.height : Math.min(900, Math.max(640, work.height - 80));

  mainWindow = new BrowserWindow({
    width,
    height,
    x: st ? st.x : undefined,
    y: st ? st.y : undefined,
    minWidth: 960,
    minHeight: 640,
    title: APP_TITLE,
    backgroundColor: '#eef3ea',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (st && st.maximized) mainWindow.maximize();

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', () => saveState(mainWindow));
  mainWindow.on('closed', () => { mainWindow = null; });

  // 只允许停在本地页面；站外链接一律交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.loadFile(INDEX);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.setAppUserModelId('com.edoardo.studyweekgarden');

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => app.quit());
}
