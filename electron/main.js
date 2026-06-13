const http = require('http');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const sqliteStore = require('./sqlite-store');

const PAIRING_PACKAGES_KEY = 'smart_desk_pairing_packages_v1';
const PAIRING_RESULTS_KEY = 'smart_desk_pairing_results_v1';
const SYNC_PORT_START = 43178;

let windows = new Set();
let syncServer = null;
let syncServerPort = null;

function readJsonStorage(key) {
  try {
    return JSON.parse(sqliteStore.getItem(key) || '{}');
  } catch (error) {
    return {};
  }
}

function writeJsonStorage(key, value) {
  sqliteStore.setItem(key, JSON.stringify(value));
}

function getLocalNetworkAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

function getSyncServerUrl() {
  if (!syncServerPort) return '';
  return `http://${getLocalNetworkAddress()}:${syncServerPort}`;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        request.destroy();
        reject(new Error('Request is too large.'));
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function listenOnAvailablePort(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      if (error.code === 'EADDRINUSE' && port < SYNC_PORT_START + 20) {
        resolve(listenOnAvailablePort(server, port + 1));
      } else {
        reject(error);
      }
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
}

async function startSyncServer() {
  syncServer = http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      sendJson(response, 200, { ok: true });
      return;
    }

    const url = new URL(request.url, 'http://smartdesk.local');
    const packageMatch = url.pathname.match(/^\/package\/([^/]+)$/);
    const resultMatch = url.pathname.match(/^\/result\/([^/]+)$/);

    try {
      if (request.method === 'GET' && url.pathname === '/status') {
        sendJson(response, 200, { ok: true, app: 'Smart Desk', syncUrl: getSyncServerUrl() });
        return;
      }

      if (request.method === 'GET' && packageMatch) {
        const code = decodeURIComponent(packageMatch[1]).toUpperCase();
        const packages = readJsonStorage(PAIRING_PACKAGES_KEY);
        const storedPackage = packages[code]?.package || packages[code];
        if (!storedPackage) {
          sendJson(response, 404, { ok: false, message: 'Attendance package not found.' });
          return;
        }
        sendJson(response, 200, { ok: true, package: storedPackage });
        return;
      }

      if (request.method === 'POST' && resultMatch) {
        const code = decodeURIComponent(resultMatch[1]).toUpperCase();
        const body = await readRequestBody(request);
        const payload = JSON.parse(body || '{}');
        const attendanceResult = payload.result || payload;
        if (!attendanceResult || attendanceResult.type !== 'smart-desk-attendance-result') {
          sendJson(response, 400, { ok: false, message: 'Invalid attendance result.' });
          return;
        }
        const results = readJsonStorage(PAIRING_RESULTS_KEY);
        results[code] = { result: attendanceResult, createdAt: new Date().toISOString(), source: 'local-sync-server' };
        writeJsonStorage(PAIRING_RESULTS_KEY, results);
        sendJson(response, 200, { ok: true });
        return;
      }

      sendJson(response, 404, { ok: false, message: 'Route not found.' });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Sync server error.' });
    }
  });

  syncServerPort = await listenOnAvailablePort(syncServer, SYNC_PORT_START);
}

function createWindow(fileName = 'index.html') {
  const win = new BrowserWindow({
    width: fileName === 'cds.html' ? 420 : 1365,
    height: fileName === 'cds.html' ? 860 : 900,
    minWidth: fileName === 'cds.html' ? 360 : 960,
    minHeight: fileName === 'cds.html' ? 640 : 700,
    title: fileName === 'cds.html' ? 'Smart CDS - Provost' : 'Smart Desk',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', fileName));
  win.on('closed', () => windows.delete(win));
  windows.add(win);
  return win;
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Smart Desk',
      submenu: [
        {
          label: 'Open LGI/CLO App',
          click: () => createWindow('index.html'),
        },
        {
          label: 'Open CDS Provost App',
          click: () => createWindow('cds.html'),
        },
        { type: 'separator' },
        {
          label: 'Show SQLite Database Path',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || [...windows][0];
            if (win) {
              win.webContents.executeJavaScript(`alert(${JSON.stringify(`SQLite database:\n${sqliteStore.getDatabasePath()}`)})`);
            }
          },
        },
        {
          label: 'Show Local Sync URL',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || [...windows][0];
            if (win) {
              win.webContents.executeJavaScript(`alert(${JSON.stringify(`Local sync URL:\n${getSyncServerUrl() || 'Not available yet'}`)})`);
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
  ]);
}

function registerIpc() {
  ipcMain.on('smartdesk:storage:get', (event, key) => {
    event.returnValue = sqliteStore.getItem(key);
  });

  ipcMain.on('smartdesk:storage:set', (event, key, value) => {
    sqliteStore.setItem(key, value);
    event.returnValue = true;
  });

  ipcMain.on('smartdesk:storage:remove', (event, key) => {
    sqliteStore.removeItem(key);
    event.returnValue = true;
  });

  ipcMain.on('smartdesk:storage:clear', (event) => {
    sqliteStore.clear();
    event.returnValue = true;
  });

  ipcMain.on('smartdesk:storage:path', (event) => {
    event.returnValue = sqliteStore.getDatabasePath();
  });

  ipcMain.on('smartdesk:sync:url', (event) => {
    event.returnValue = getSyncServerUrl();
  });

  ipcMain.on('smartdesk:window:open-cds', () => {
    createWindow('cds.html');
  });
}

app.whenReady().then(async () => {
  await sqliteStore.initStore(app.getPath('userData'));
  await startSyncServer();
  registerIpc();
  Menu.setApplicationMenu(buildMenu());
  createWindow(process.argv.includes('--cds') ? 'cds.html' : 'index.html');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow('index.html');
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
