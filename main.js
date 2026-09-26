const { app, BrowserWindow, ipcMain, shell, dialog, net } = require('electron');
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
const { getAuthToken, startLogin, consumeLogin } = require('./handlers/auth');
const { IS_BETA_BUILD, BETA_VERSION } = require('./handlers/updates');

const store = new Store();
let mainWindow = null;

const discordRpc = { setActivity };

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        const protocolUrl = commandLine.find(arg => arg.startsWith('beamfinds://'));
        if (protocolUrl) handleProtocolUrl(protocolUrl);
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
        if (parsed.protocol !== 'beamfinds:') return null;
        const params = parsed.searchParams;
        const target = parsed.host || parsed.pathname.replace(/^\/+/, '');

        if (target === 'auth') {
            const token = params.get('token');
            if (!token || token.length > 4096) return null;
            return { kind: 'auth', token, state: params.get('state') };
        }

        const modId = params.get('id');
        if (!modId || !/^\d{1,12}$/.test(modId)) return null;
        return { kind: 'download', modId };
    } catch (e) {
        return null;
    }
}

async function fetchModInfo(modId) {
    try {
        const res = await net.fetch(`https://beamfinds.com/api/mods/single/${modId}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data && data.mod ? data.mod : null;
    } catch {
        return null;
    }
}

let confirmingDownload = false;

async function confirmProtocolDownload(modId) {
    if (confirmingDownload || !mainWindow) return;
    confirmingDownload = true;
    try {
        const mod = await fetchModInfo(modId);
        if (!mainWindow) return;

        if (!mod) {
            await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'BeamFinds',
                message: 'That mod could not be found',
                buttons: ['OK']
            });
            return;
        }

        const name = String(mod.name || `Mod #${modId}`).slice(0, 120);
        const author = String(mod.author || mod.uploader || 'Unknown').slice(0, 60);
        const version = String(mod.mod_version || '1.0.0').slice(0, 40);
        const flagged = mod.vt_scan && (mod.vt_scan.malicious > 0 || mod.vt_scan.suspicious > 0);

        const detail = [
            `By ${author}, version ${version}`,
            flagged ? 'VirusTotal flagged this file. Only continue if you trust it.' : null,
            '',
            'This download was started by a link from outside the app. Only continue if you clicked it yourself.'
        ].filter(line => line !== null).join('\n');

        const { response } = await dialog.showMessageBox(mainWindow, {
            type: flagged ? 'warning' : 'question',
            title: 'Download mod',
            message: `Download "${name}"?`,
            detail,
            buttons: ['Download', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
            noLink: true
        });

        if (response !== 0 || !mainWindow) return;
        mainWindow.webContents.send('protocol-download', {
            modId,
            modName: name,
            modAuthor: author,
            modVersion: version
        });
    } finally {
        confirmingDownload = false;
    }
}

function handleProtocolUrl(url) {
    const parsed = parseProtocolUrl(url);
    if (!parsed || !mainWindow) {
        logger('WARN', 'app', 'protocol-url-invalid');
        return;
    }

    logger('INFO', 'app', 'protocol-url', parsed.kind === 'download' ? `download id ${parsed.modId}` : 'auth');

    if (parsed.kind === 'auth') {
        if (!consumeLogin(parsed.state)) {
            logger('WARN', 'auth', 'protocol-auth-rejected', 'no matching login request');
            return;
        }
        mainWindow.webContents.send('protocol-auth', { token: parsed.token });
        return;
    }

    confirmProtocolDownload(parsed.modId);
}

ipcMain.handle('open-browser-login', async () => {
    const state = startLogin();
    await shell.openExternal(`https://beamfinds.com/app-login?state=${state}`);
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

    const token = getAuthToken(store);
    if (token) {
        trackEvent('launch', {}, token);
    }

    const protocolArg = process.argv.find(arg => arg.startsWith('beamfinds://'));
    if (protocolArg) {
        mainWindow.webContents.once('did-finish-load', () => {
            setTimeout(() => handleProtocolUrl(protocolArg), 1000);
        });
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
