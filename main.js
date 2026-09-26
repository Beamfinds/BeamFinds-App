const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

const { registerWindowHandlers } = require('./handlers/window');
const { registerConfigHandlers } = require('./handlers/config');
const { registerFilesystemHandlers } = require('./handlers/filesystem');
const { registerDownloadHandlers, cleanupActiveDownloads } = require('./handlers/downloads');
const { registerUpdateHandlers } = require('./handlers/updates');
const { registerModHandlers } = require('./handlers/mods');
const { registerConflictHandlers } = require('./handlers/conflicts');
const { registerDisabledHandlers } = require('./handlers/conflicts/disabled');
const { initDiscordRPC, registerDiscordHandlers, disconnect: disconnectDiscord, setActivity } = require('./handlers/discord');
const { registerPlaylistHandlers } = require('./handlers/playlist');
const { registerAnalyticsHandlers, trackEvent } = require('./handlers/analytics');
const { logger, exportLog } = require('./handlers/logger');
const { IS_BETA_BUILD, BETA_VERSION } = require('./handlers/updates');

const store = new Store();
let mainWindow = null;

const discordRpc = { setActivity };

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        const protocolUrl = commandLine.find(arg => arg.startsWith('beamfinds://'));
        if (protocolUrl) logger('INFO', 'app', 'protocol-url', protocolUrl);
        if (protocolUrl && mainWindow) {
            const parsed = parseProtocolUrl(protocolUrl);
            if (parsed && parsed.authToken) {
                mainWindow.webContents.send('protocol-auth', { token: parsed.authToken });
            } else {
                mainWindow.webContents.send('protocol-download', parsed);
            }
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 750,
        minWidth: 1000,
        minHeight: 750,
        frame: false,
        backgroundColor: '#0f172a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'build', process.platform === 'linux' ? 'icon.png' : 'icon.ico')
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    }
    mainWindow.on('close', () => {
        disconnectDiscord();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    registerWindowHandlers(mainWindow);
    registerConfigHandlers(store);
    registerFilesystemHandlers(mainWindow, store);
    registerDownloadHandlers(mainWindow, store, discordRpc);
    registerUpdateHandlers(mainWindow);
    registerModHandlers();
    registerDiscordHandlers(store);
    registerPlaylistHandlers(mainWindow, store);
    registerAnalyticsHandlers(store);
    registerConflictHandlers(mainWindow, store);
    registerDisabledHandlers(store);
}

function parseProtocolUrl(url) {
    try {
        const parsed = new URL(url);
        const params = new URLSearchParams(parsed.search);

        if (parsed.host === 'auth' || parsed.pathname === '//auth') {
            return {
                authToken: params.get('token') || null
            };
        }

        return {
            modId: params.get('id'),
            modName: decodeURIComponent(params.get('name') || 'Unknown Mod'),
            modAuthor: decodeURIComponent(params.get('author') || 'Unknown'),
            modVersion: params.get('version') || '1.0.0',
            token: params.get('token') || null
        };
    } catch (e) {
        return null;
    }
}

ipcMain.handle('open-browser-login', async () => {
    await shell.openExternal('https://beamfinds.com/app-login');
    return { success: true };
});

ipcMain.handle('launch-beamng', async () => {
    await shell.openExternal('steam://run/284160');
    return { success: true };
});

if (IS_BETA_BUILD) {
    ipcMain.handle('export-logs', () => exportLog());

    ipcMain.handle('save-logs', async (event, content) => {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Debug Log',
            defaultPath: 'beamfinds-debug.txt',
            filters: [{ name: 'Text Files', extensions: ['txt'] }]
        });
        if (!filePath) return { cancelled: true };
        try {
            fs.writeFileSync(filePath, content, 'utf8');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('log-event', (event, level, category, eventName, detail) => {
        const allowed = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
        if (!allowed.includes(level)) return;
        logger(level, category, eventName, detail);
    });
}

function registerLinuxProtocol() {
    const appImagePath = process.env.APPIMAGE;
    if (!appImagePath) return;

    if (store.get('linuxProtocolPath') === appImagePath) return;

    const { exec } = require('child_process');
    const fs = require('fs');
    const desktopDir = path.join(require('os').homedir(), '.local', 'share', 'applications');
    const desktopFile = path.join(desktopDir, 'beamfinds.desktop');

    const contents = [
        '[Desktop Entry]',
        'Name=BeamFinds',
        `Exec=${appImagePath} %u`,
        'Type=Application',
        'Terminal=false',
        'MimeType=x-scheme-handler/beamfinds;',
        'Categories=Utility;',
    ].join('\n');

    try {
        fs.mkdirSync(desktopDir, { recursive: true });
        fs.writeFileSync(desktopFile, contents);
        exec(`xdg-mime default beamfinds.desktop x-scheme-handler/beamfinds`);
        exec(`update-desktop-database ${desktopDir}`);
        store.set('linuxProtocolPath', appImagePath);
    } catch (e) {
    }
}

app.whenReady().then(async () => {
    logger('INFO', 'app', 'launch', `v${BETA_VERSION} on ${process.platform}`);
    if (process.platform === 'win32') {
        app.setAsDefaultProtocolClient('beamfinds');
    } else if (process.platform === 'linux') {
        registerLinuxProtocol();
    }
    createWindow();

    await initDiscordRPC(store);

    const token = store.get('authToken');
    if (token) {
        trackEvent('launch', {}, token);
    }

    const protocolArg = process.argv.find(arg => arg.startsWith('beamfinds://'));
    if (protocolArg) logger('INFO', 'app', 'protocol-url', protocolArg);
    if (protocolArg) {
        setTimeout(() => {
            const parsed = parseProtocolUrl(protocolArg);
            if (parsed && parsed.authToken) {
                mainWindow.webContents.send('protocol-auth', { token: parsed.authToken });
            } else {
                mainWindow.webContents.send('protocol-download', parsed);
            }
        }, 1000);
    }
});

app.on('before-quit', () => {
    logger('INFO', 'app', 'quit');
    cleanupActiveDownloads();
    disconnectDiscord();
});

app.on('will-quit', () => {
    disconnectDiscord();
});

app.on('window-all-closed', () => {
    disconnectDiscord();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
