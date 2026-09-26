const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const Store = require('electron-store');
const { logger } = require('./logger');

const store = new Store();

const APP_VERSION = '2.1.5';
const IS_BETA_BUILD = false;
const BETA_VERSION = '2.1.4-beta.3';
const VERSION_API_URL = 'https://beamfinds.com/api/app/version';
const APP_UPDATE_URL = 'https://beamfinds.com/api/mods/download/app';
const BETA_UPDATE_URL = 'https://beamfinds.com/api/mods/download/app-beta';

function isNewerVersion(remote, local) {
    const parse = (v) => {
        const [core, pre] = v.replace(/^v/, '').split('-', 2);
        const parts = core.split('.').map(Number);
        return { parts, pre: pre || null };
    };
    const r = parse(remote);
    const l = parse(local);
    for (let i = 0; i < Math.max(r.parts.length, l.parts.length); i++) {
        const rv = r.parts[i] || 0;
        const lv = l.parts[i] || 0;
        if (rv > lv) return true;
        if (rv < lv) return false;
    }
    if (r.pre && !l.pre) return false;
    if (!r.pre && l.pre) return true;
    if (r.pre && l.pre) return r.pre > l.pre;
    return false;
}

function registerUpdateHandlers(mainWindow) {
    ipcMain.handle('check-app-update', async () => {
        try {
            const token = store.get('authToken');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const platform = process.platform === 'linux' ? 'linux' : 'windows';

            const response = await new Promise((resolve, reject) => {
                const options = {
                    timeout: 5000,
                    headers: headers
                };
                https.get(`${VERSION_API_URL}?platform=${platform}`, options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(e);
                        }
                    });
                }).on('error', reject);
            });

            const currentVersion = IS_BETA_BUILD ? BETA_VERSION : APP_VERSION;
            const stableUpdateRequired = IS_BETA_BUILD ? false : (response.required || false);

            const result = {
                currentVersion: currentVersion,
                latestVersion: response.version,
                updateRequired: stableUpdateRequired,
                hasUpdate: response.version !== APP_VERSION,
                isBetaBuild: IS_BETA_BUILD
            };

            if (response.beta && response.hasBetaAccess) {
                const betaVersion = response.beta.version;
                const currentRef = IS_BETA_BUILD ? BETA_VERSION : APP_VERSION;
                const betaIsNewer = betaVersion && isNewerVersion(betaVersion, currentRef);
                result.beta = {
                    version: betaVersion,
                    required: betaIsNewer ? (IS_BETA_BUILD ? response.beta.required : false) : false,
                    hasUpdate: betaIsNewer
                };
                result.hasBetaAccess = true;
            }

            logger('INFO', 'update', 'check', `current: ${result.currentVersion} latest: ${result.latestVersion} hasUpdate: ${result.hasUpdate}`);
            return result;
        } catch (error) {
            logger('ERROR', 'update', 'check-fail', error.message);
            console.error('Update check error:', error);
            return null;
        }
    });

    ipcMain.handle('is-beta-build', () => {
        return { isBeta: IS_BETA_BUILD, version: BETA_VERSION, NonBetaVersion: APP_VERSION };
    });

    ipcMain.handle('verify-beta-access', async () => {
        if (!IS_BETA_BUILD) {
            return { valid: true, isBetaBuild: false };
        }

        const token = store.get('authToken');
        if (!token) {
            return { valid: false, reason: 'not_authenticated', isBetaBuild: true };
        }

        try {
            const platform = process.platform === 'linux' ? 'linux' : 'windows';
            const response = await new Promise((resolve, reject) => {
                const options = {
                    timeout: 5000,
                    headers: { 'Authorization': `Bearer ${token}` }
                };
                https.get(`${VERSION_API_URL}?platform=${platform}`, options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(e);
                        }
                    });
                }).on('error', reject);
            });

            if (!response.hasBetaAccess) {
                return {
                    valid: false,
                    reason: 'no_beta_access',
                    isBetaBuild: true,
                    latestStable: response.version
                };
            }

            return { valid: true, isBetaBuild: true, hasBetaAccess: true };
        } catch (error) {
            console.error('Beta access verification error:', error);
            return { valid: true, isBetaBuild: true, error: 'network_error' };
        }
    });

    ipcMain.handle('download-app-update', async (event, version) => {
        let downloadUrl;
        let saveName;
        let tempDir;

        if (process.platform === 'linux') {
            downloadUrl = `https://beamfinds.com/api/mods/download/app-linux/${version}`;
            saveName = `BeamFinds_${version}.AppImage`;
            const appImageDir = process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : app.getPath('temp');
            tempDir = path.join(appImageDir, 'beamfinds-update');
        } else {
            downloadUrl = `${APP_UPDATE_URL}/${version}`;
            saveName = `BeamFinds_Setup_${version}.exe`;
            tempDir = path.join(app.getPath('temp'), 'beamfinds-update');
        }

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const savePath = path.join(tempDir, saveName);

        logger('INFO', 'update', 'download-start', `version ${version}`);
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(savePath);

            https.get(downloadUrl, { timeout: 30000 }, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    https.get(response.headers.location, handleResponse);
                    return;
                }
                handleResponse(response);
            }).on('error', (err) => {
                fs.unlink(savePath, () => { });
                reject(err);
            });

            function handleResponse(response) {
                const total = parseInt(response.headers['content-length'], 10) || 0;
                let downloaded = 0;

                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (mainWindow && total > 0) {
                        mainWindow.webContents.send('update-progress', {
                            progress: (downloaded / total) * 100,
                            downloaded,
                            total
                        });
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    logger('INFO', 'update', 'download-complete', `version ${version} → ${savePath}`);
                    const token = store.get('authToken');
                    if (token) {
                        const { trackEvent } = require('./analytics');
                        trackEvent('update', { from_version: APP_VERSION, to_version: version }, token);
                    }
                    resolve({ success: true, path: savePath });
                });
            }
        });
    });

    ipcMain.handle('download-beta-update', async (event, version) => {
        const token = store.get('authToken');
        if (!token) {
            return { success: false, error: 'Not authenticated' };
        }

        let downloadUrl;
        let saveName;
        let tempDir;

        if (process.platform === 'linux') {
            downloadUrl = `https://beamfinds.com/api/mods/download/app-beta-linux/${version}?token=${token}`;
            saveName = `BeamFinds_BETA_${version}.AppImage`;
            const appImageDir = process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : app.getPath('temp');
            tempDir = path.join(appImageDir, 'beamfinds-update');
        } else {
            downloadUrl = `${BETA_UPDATE_URL}/${version}?token=${token}`;
            saveName = `BeamFinds_Setup_BETA_${version}.exe`;
            tempDir = path.join(app.getPath('temp'), 'beamfinds-update');
        }

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const savePath = path.join(tempDir, saveName);

        logger('INFO', 'update', 'beta-download-start', `version ${version}`);
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(savePath);

            https.get(downloadUrl, { timeout: 30000 }, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    https.get(response.headers.location, handleResponse);
                    return;
                }
                if (response.statusCode === 403) {
                    fs.unlink(savePath, () => { });
                    resolve({ success: false, error: 'Beta access required' });
                    return;
                }
                handleResponse(response);
            }).on('error', (err) => {
                fs.unlink(savePath, () => { });
                reject(err);
            });

            function handleResponse(response) {
                const total = parseInt(response.headers['content-length'], 10) || 0;
                let downloaded = 0;

                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (mainWindow && total > 0) {
                        mainWindow.webContents.send('update-progress', {
                            progress: (downloaded / total) * 100,
                            downloaded,
                            total,
                            isBeta: true
                        });
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    logger('INFO', 'update', 'beta-download-complete', `version ${version} → ${savePath}`);
                    const token = store.get('authToken');
                    if (token) {
                        const { trackEvent } = require('./analytics');
                        const fromVersion = IS_BETA_BUILD ? BETA_VERSION : APP_VERSION;
                        trackEvent('beta_update', { from_version: fromVersion, to_version: version }, token);
                    }
                    resolve({ success: true, path: savePath });
                });
            }
        });
    });

    ipcMain.handle('run-update-installer', async (event, installerPath) => {
        logger('INFO', 'update', 'installer-run', installerPath);
        if (process.platform === 'linux') {
            if (!process.env.APPIMAGE) {
                return false;
            }
            try {
                fs.chmodSync(installerPath, 0o755);
                fs.renameSync(installerPath, process.env.APPIMAGE);
                app.relaunch();
                app.quit();
                return true;
            } catch (err) {
                console.error('Linux update failed:', err);
                return false;
            }
        }

        try {
            const { spawn } = require('child_process');
            spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref();
            setTimeout(() => app.quit(), 500);
            return true;
        } catch (err) {
            logger('ERROR', 'update', 'installer-fail', err.message);
            console.error('Failed to run installer:', err);
            return false;
        }
    });

    ipcMain.handle('get-app-version', () => IS_BETA_BUILD ? BETA_VERSION : APP_VERSION);
}

module.exports = { registerUpdateHandlers, APP_VERSION, IS_BETA_BUILD, BETA_VERSION };
