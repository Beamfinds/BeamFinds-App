const { ipcMain, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { logger } = require('./logger');
const { getAuthToken } = require('./auth');

const trustedHosts = new Set(['beamfinds.com', 'dl.beamfinds.com', 'cdn.beamfinds.com']);
const maxRedirects = 5;
const reservedNames = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

let activeDownloads = {};

function isTrusted(url) {
    return url.protocol === 'https:' && trustedHosts.has(url.hostname);
}

function safeFilename(raw, fallback) {
    const base = String(raw || '').split(/[\\/]/).pop();
    const name = base
        .replace(/[^\w.\- ()]/g, '_')
        .replace(/^[.\s]+/, '')
        .replace(/[.\s]+$/, '')
        .slice(0, 150);
    if (!name || !/\.zip$/i.test(name) || reservedNames.test(name)) return fallback;
    return name;
}

function resolveInside(folder, filename) {
    const root = path.resolve(folder);
    const full = path.resolve(root, filename);
    const rel = path.relative(root, full);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) return null;
    return full;
}

function filenameFromHeader(value) {
    if (!value) return null;
    const match = value.match(/filename="?([^";]+)"?/i);
    return match ? match[1] : null;
}

function header(response, name) {
    const value = response.headers[name];
    return Array.isArray(value) ? value[0] : value;
}

function openDownload(url, token, hops, track) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const request = net.request({ url: target.toString(), method: 'GET', redirect: 'manual' });
        if (token && target.hostname === 'beamfinds.com') {
            request.setHeader('Authorization', `Bearer ${token}`);
        }
        track(request);

        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            fn(value);
        };

        request.on('redirect', (statusCode, method, redirectUrl) => {
            request.abort();
            let next;
            try {
                next = new URL(redirectUrl, target);
            } catch {
                return finish(reject, { error: 'Invalid redirect' });
            }
            if (!isTrusted(next)) return finish(resolve, { external: next });
            if (hops >= maxRedirects) return finish(reject, { error: 'Too many redirects' });
            openDownload(next.toString(), token, hops + 1, track).then(
                (result) => finish(resolve, result),
                (err) => finish(reject, err)
            );
        });

        request.on('response', (response) => finish(resolve, { response, request }));
        request.on('error', (err) => finish(reject, { error: err.message }));
        request.end();
    });
}

function registerDownloadHandlers(mainWindow, store, discordRpc) {
    ipcMain.handle('start-download', async (event, info) => {
        const modId = String(info?.modId ?? '');
        const modVersion = String(info?.modVersion || '1.0.0');
        const modName = String(info?.modName || 'mod').slice(0, 200);
        const downloadFolder = store.get('modsFolder');

        if (!/^\d{1,12}$/.test(modId)) throw { error: 'Invalid mod id' };
        if (!/^[\w.\-+]{1,40}$/.test(modVersion)) throw { error: 'Invalid mod version' };
        if (!downloadFolder || !fs.existsSync(downloadFolder)) throw { error: 'Mods folder is not configured' };

        logger('INFO', 'download', 'start', `"${modName}" (id: ${modId})`);
        const downloadUrl = `https://beamfinds.com/api/mods/download/${encodeURIComponent(modId)}/${encodeURIComponent(modVersion)}`;
        const token = getAuthToken(store);

        if (discordRpc) discordRpc.setActivity('downloading', modName);

        activeDownloads[modId] = { request: null, file: null, filePath: null, cancelled: false };

        const idle = () => {
            delete activeDownloads[modId];
            if (discordRpc) discordRpc.setActivity('idle');
        };

        let opened;
        try {
            opened = await openDownload(downloadUrl, token, 0, (request) => {
                if (activeDownloads[modId]) activeDownloads[modId].request = request;
            });
        } catch (err) {
            const cancelled = activeDownloads[modId]?.cancelled;
            idle();
            if (cancelled) throw { cancelled: true };
            logger('ERROR', 'download', 'request-error', `id ${modId} - ${err.error || err.message}`);
            throw { error: err.error || err.message || 'Download failed' };
        }

        if (activeDownloads[modId]?.cancelled) {
            opened.request?.abort();
            idle();
            throw { cancelled: true };
        }

        if (opened.external) {
            idle();
            const external = opened.external;
            if (external.protocol !== 'https:' && external.protocol !== 'http:') {
                logger('WARN', 'download', 'blocked-redirect', `id ${modId} - ${external.protocol}`);
                throw { error: 'This mod points to an unsupported link' };
            }
            await shell.openExternal(external.toString());
            event.sender.send('download-external', { modId, url: external.toString() });
            return { external: true, url: external.toString() };
        }

        const { response, request } = opened;

        return new Promise((resolve, reject) => {
            if (response.statusCode !== 200) {
                idle();
                logger('ERROR', 'download', 'fail', `id ${modId} - HTTP ${response.statusCode}`);
                reject({ error: `Server returned ${response.statusCode}` });
                return;
            }

            const fallback = `${modName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 100)}_${modId}.zip`;
            const filename = safeFilename(filenameFromHeader(header(response, 'content-disposition')), fallback);
            const filePath = resolveInside(downloadFolder, filename);

            if (!filePath) {
                request.abort();
                idle();
                logger('ERROR', 'download', 'bad-filename', `id ${modId}`);
                reject({ error: 'Invalid file name from server' });
                return;
            }

            const totalSize = parseInt(header(response, 'content-length'), 10) || 0;
            const tempPath = `${filePath}.part`;
            const file = fs.createWriteStream(tempPath);

            let downloadedSize = 0;
            let lastUpdate = Date.now();
            let lastDownloaded = 0;

            activeDownloads[modId].file = file;
            activeDownloads[modId].filePath = tempPath;

            file.on('error', (err) => {
                request.abort();
                idle();
                fs.unlink(tempPath, () => {});
                logger('ERROR', 'download', 'file-error', `id ${modId} - ${err.message}`);
                reject({ error: err.message });
            });

            response.on('data', (chunk) => {
                if (activeDownloads[modId]?.cancelled) {
                    request.abort();
                    file.close();
                    fs.unlink(tempPath, () => {});
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

            response.on('error', (err) => {
                file.close();
                fs.unlink(tempPath, () => {});
                idle();
                reject({ error: err.message });
            });

            response.on('end', () => {
                if (activeDownloads[modId]?.cancelled) {
                    fs.unlink(tempPath, () => {});
                    reject({ cancelled: true });
                    return;
                }

                file.end(() => {
                    try {
                        fs.renameSync(tempPath, filePath);
                    } catch (err) {
                        fs.unlink(tempPath, () => {});
                        idle();
                        reject({ error: err.message });
                        return;
                    }

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

                    if (token) {
                        const { trackEvent } = require('./analytics');
                        trackEvent('download', { mod_id: modId }, token);
                    }

                    resolve({ success: true, filename, filePath });
                });
            });
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
        if (!modsFolder || typeof filename !== 'string' || !/\.zip$/i.test(filename)) return false;

        const filePath = resolveInside(modsFolder, filename);
        if (!filePath) return false;
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
                if (download.filePath && fs.existsSync(download.filePath)) {
                    fs.unlinkSync(download.filePath);
                }
            } catch (err) {}
        }
    });
    activeDownloads = {};
}

module.exports = { registerDownloadHandlers, cleanupActiveDownloads, safeFilename, resolveInside };
