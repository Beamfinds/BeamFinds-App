const { ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { logger } = require('./logger');

let activeDownloads = {};

function registerDownloadHandlers(mainWindow, store, discordRpc) {
    ipcMain.handle('start-download', async (event, info) => {
        const { modName, modVersion, token, downloadFolder } = info;
        const modId = String(info.modId);
        logger('INFO', 'download', 'start', `"${modName}" (id: ${modId})`);
        const downloadUrl = `https://beamfinds.com/api/mods/download/${modId}/${modVersion}${token ? '?token=' + token : ''}`;

        if (discordRpc) {
            discordRpc.setActivity('downloading', modName);
        }

        activeDownloads[modId] = {
            request: null,
            file: null,
            filePath: null,
            cancelled: false
        };

        return new Promise((resolve, reject) => {
            if (activeDownloads[modId]?.cancelled) {
                reject({ cancelled: true });
                return;
            }

            const request = net.request({ url: downloadUrl, method: 'GET' });
            activeDownloads[modId].request = request;

            request.on('response', (response) => {
                if (activeDownloads[modId]?.cancelled) {
                    request.abort();
                    reject({ cancelled: true });
                    return;
                }

                if (response.statusCode === 301 || response.statusCode === 302) {
                    const location = response.headers.location;
                    const locStr = Array.isArray(location) ? location[0] : location;
                    const isInternal = locStr && (
                        locStr.startsWith('/uploads/') ||
                        /cdn\.beamfinds\.com/.test(locStr) ||
                        /r2\./i.test(locStr) ||
                        /storage\./i.test(locStr)
                    );
                    if (locStr && !isInternal) {
                        const { shell } = require('electron');
                        shell.openExternal(locStr);
                        delete activeDownloads[modId];
                        if (discordRpc) discordRpc.setActivity('idle');
                        event.sender.send('download-external', { modId, url: locStr });
                        resolve({ external: true, url: locStr });
                        return;
                    }
                }

                if (response.statusCode !== 200) {
                    delete activeDownloads[modId];
                    if (discordRpc) discordRpc.setActivity('idle');
                    logger('ERROR', 'download', 'fail', `id ${modId} — HTTP ${response.statusCode}`);
                    reject({ error: `Server returned ${response.statusCode}` });
                    return;
                }

                const cdHeader = response.headers['content-disposition'];
                const cdValue = Array.isArray(cdHeader) ? cdHeader[0] : cdHeader;
                let filename = `${modName.replace(/[^a-zA-Z0-9]/g, '_')}_${modId}.zip`;

                if (cdValue) {
                    const match = cdValue.match(/filename="?([^"]+)"?/);
                    if (match) filename = match[1];
                }

                const clHeader = response.headers['content-length'];
                const totalSize = parseInt(Array.isArray(clHeader) ? clHeader[0] : clHeader, 10) || 0;
                const filePath = path.join(downloadFolder, filename);
                const file = fs.createWriteStream(filePath);

                let downloadedSize = 0;
                let lastUpdate = Date.now();
                let lastDownloaded = 0;

                activeDownloads[modId].file = file;
                activeDownloads[modId].filePath = filePath;

                file.on('error', (err) => {
                    delete activeDownloads[modId];
                    if (discordRpc) discordRpc.setActivity('idle');
                    logger('ERROR', 'download', 'file-error', `id ${modId} — ${err.message}`);
                    reject({ error: err.message });
                });

                response.on('data', (chunk) => {
                    if (activeDownloads[modId]?.cancelled) {
                        request.abort();
                        file.close();
                        fs.unlink(filePath, () => {});
                        reject({ cancelled: true });
                        return;
                    }

                    file.write(chunk);
                    downloadedSize += chunk.length;
                    const now = Date.now();

                    if (now - lastUpdate >= 250) {
                        const elapsed = (now - lastUpdate) / 1000;
                        const speed = (downloadedSize - lastDownloaded) / elapsed;
                        const progress = totalSize ? (downloadedSize / totalSize) * 100 : 0;
                        const eta = speed > 0 ? (totalSize - downloadedSize) / speed : 0;

                        mainWindow.webContents.send('download-progress', {
                            modId,
                            progress,
                            speed,
                            downloaded: downloadedSize,
                            total: totalSize,
                            eta
                        });

                        lastUpdate = now;
                        lastDownloaded = downloadedSize;
                    }
                });

                response.on('end', () => {
                    if (activeDownloads[modId]?.cancelled) {
                        fs.unlink(filePath, () => {});
                        reject({ cancelled: true });
                        return;
                    }

                    file.end(() => {
                        delete activeDownloads[modId];

                        const downloads = store.get('downloads') || {};
                        downloads[modId] = {
                            name: modName,
                            version: modVersion,
                            filename,
                            downloadedAt: new Date().toISOString()
                        };
                        store.set('downloads', downloads);
                        logger('INFO', 'download', 'complete', `"${modName}" (id: ${modId}) → ${filename}`);

                        if (discordRpc) discordRpc.setActivity('idle');

                        const authToken = store.get('authToken');
                        if (authToken) {
                            const { trackEvent } = require('./analytics');
                            trackEvent('download', { mod_id: modId }, authToken);
                        }

                        resolve({ success: true, filename, filePath });
                    });
                });
            });

            request.on('error', (err) => {
                if (activeDownloads[modId]?.cancelled) {
                    reject({ cancelled: true });
                    return;
                }
                logger('ERROR', 'download', 'request-error', `id ${modId} — ${err.message}`);
                delete activeDownloads[modId];
                if (discordRpc) discordRpc.setActivity('idle');
                reject({ error: err.message });
            });

            request.end();
        });
    });

    ipcMain.handle('cancel-download', (event, modIdParam) => {
        const modId = String(modIdParam);
        const download = activeDownloads[modId];
        if (download) {
            download.cancelled = true;
            if (download.request) download.request.abort();
            if (download.file) download.file.close();
            if (download.filePath && fs.existsSync(download.filePath)) {
                fs.unlink(download.filePath, () => {});
            }
            delete activeDownloads[modId];
            logger('INFO', 'download', 'cancel', `id ${modId}`);
            if (discordRpc) discordRpc.setActivity('idle');
            return { cancelled: true };
        }
        return { cancelled: false };
    });

    ipcMain.handle('get-downloads', () => {
        return store.get('downloads') || {};
    });

    ipcMain.handle('delete-mod-file', async (event, filename) => {
        const modsFolder = store.get('modsFolder');
        if (!modsFolder || !filename) return false;

        const filePath = path.join(modsFolder, filename);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                return true;
            }
        } catch (err) {
            return false;
        }
        return false;
    });
}

function cleanupActiveDownloads() {
    Object.keys(activeDownloads).forEach(modId => {
        const download = activeDownloads[modId];
        if (download) {
            try {
                download.cancelled = true;
                if (download.request) download.request.abort();
                if (download.file) download.file.close();
                if (download.filePath && require('fs').existsSync(download.filePath)) {
                    require('fs').unlinkSync(download.filePath);
                }
            } catch (err) {}
        }
    });
    activeDownloads = {};
}

module.exports = { registerDownloadHandlers, cleanupActiveDownloads };
