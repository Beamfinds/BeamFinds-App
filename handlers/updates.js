const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const Store = require('electron-store');

const store = new Store();

const APP_VERSION = '2.1.4';
const IS_BETA_BUILD = false;
const BETA_VERSION = '2.1.4-beta.3';
const VERSION_API_URL = 'https://beamfinds.com/api/app/version';
const APP_UPDATE_URL = 'https://beamfinds.com/api/mods/download/app';
const BETA_UPDATE_URL = 'https://beamfinds.com/api/mods/download/app-beta';

const releasePublicKey = crypto.createPublicKey(`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEACFi3NM7Q4xl30+cbOALfEGXA4ixRk2X1Tj8+A7hzAXo=
-----END PUBLIC KEY-----`);

const trustedHosts = new Set(['beamfinds.com', 'cdn.beamfinds.com', 'dl.beamfinds.com']);
const maxRedirects = 5;
const versionPatterns = {
    stable: /^\d+\.\d+\.\d+$/,
    beta: /^\d+\.\d+\.\d+(-beta(\.\d+)?)?$/
};

let knownReleases = { stable: null, beta: null };
let verifiedInstaller = null;

function logger(...args) {
    return require('./logger').logger(...args);
}

function authToken() {
    return require('./auth').getAuthToken(store);
}

function platformName() {
    return process.platform === 'linux' ? 'linux' : 'windows';
}

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

function fetchVersionInfo(token) {
    return new Promise((resolve, reject) => {
        const options = {
            timeout: 5000,
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        };
        const req = https.get(`${VERSION_API_URL}?platform=${platformName()}`, options, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`Version check returned ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error('Version check timed out')));
        req.on('error', reject);
    });
}

function releaseMessage({ channel, platform, version, sha256 }) {
    return Buffer.from(`beamfinds-release:v1\n${channel}\n${platform}\n${version}\n${sha256}`, 'utf8');
}

function signatureValid(release, sha256) {
    try {
        const signature = Buffer.from(release.signature, 'base64');
        if (signature.length !== 64) return false;
        return crypto.verify(null, releaseMessage({ ...release, sha256 }), releasePublicKey, signature);
    } catch {
        return false;
    }
}

function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        fs.createReadStream(filePath)
            .on('data', chunk => hash.update(chunk))
            .on('end', () => resolve(hash.digest('hex')))
            .on('error', reject);
    });
}

function downloadTo(url, destPath, token, onProgress, hops = 0) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        if (target.protocol !== 'https:' || !trustedHosts.has(target.hostname)) {
            reject(new Error('Update server redirected somewhere unexpected'));
            return;
        }

        const headers = token && target.hostname === 'beamfinds.com' ? { 'Authorization': `Bearer ${token}` } : {};
        const req = https.get(target, { timeout: 30000, headers }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                res.resume();
                if (hops >= maxRedirects || !res.headers.location) {
                    reject(new Error('Too many redirects'));
                    return;
                }
                let next;
                try {
                    next = new URL(res.headers.location, target);
                } catch {
                    reject(new Error('Invalid redirect'));
                    return;
                }
                downloadTo(next.toString(), destPath, token, onProgress, hops + 1).then(resolve, reject);
                return;
            }

            if (res.statusCode !== 200) {
                res.resume();
                const err = new Error(res.statusCode === 403 ? 'Beta access required' : `Update server returned ${res.statusCode}`);
                err.status = res.statusCode;
                reject(err);
                return;
            }

            const total = parseInt(res.headers['content-length'], 10) || 0;
            const hash = crypto.createHash('sha256');
            const file = fs.createWriteStream(destPath);
            let downloaded = 0;

            res.on('data', (chunk) => {
                hash.update(chunk);
                downloaded += chunk.length;
                if (total > 0) onProgress(downloaded, total);
            });
            res.on('error', (err) => {
                file.destroy();
                reject(err);
            });
            file.on('error', reject);
            file.on('finish', () => resolve(hash.digest('hex')));
            res.pipe(file);
        });
        req.on('timeout', () => req.destroy(new Error('Update download timed out')));
        req.on('error', reject);
    });
}

async function downloadRelease(mainWindow, channel, version) {
    const release = knownReleases[channel];
    const platform = platformName();

    if (typeof version !== 'string' || !versionPatterns[channel].test(version)) {
        return { success: false, error: 'Invalid version' };
    }
    if (!release || release.version !== version || release.platform !== platform) {
        return { success: false, error: 'Check for updates again and retry' };
    }
    if (!release.signature) {
        logger('WARN', 'update', 'unsigned-release', `${channel} ${version}`);
        return { success: false, error: 'This release is not signed. Download it from beamfinds.com instead.' };
    }

    const token = authToken();
    if (channel === 'beta' && !token) return { success: false, error: 'Not authenticated' };

    const isBeta = channel === 'beta';
    let downloadUrl;
    let saveName;
    let tempDir;

    if (platform === 'linux') {
        downloadUrl = isBeta
            ? `https://beamfinds.com/api/mods/download/app-beta-linux/${version}`
            : `https://beamfinds.com/api/mods/download/app-linux/${version}`;
        saveName = isBeta ? `BeamFinds_BETA_${version}.AppImage` : `BeamFinds_${version}.AppImage`;
        const appImageDir = process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : app.getPath('temp');
        tempDir = path.join(appImageDir, 'beamfinds-update');
    } else {
        downloadUrl = `${isBeta ? BETA_UPDATE_URL : APP_UPDATE_URL}/${version}`;
        saveName = isBeta ? `BeamFinds_Setup_BETA_${version}.exe` : `BeamFinds_Setup_${version}.exe`;
        tempDir = path.join(app.getPath('temp'), 'beamfinds-update');
    }

    fs.mkdirSync(tempDir, { recursive: true });
    const savePath = path.join(tempDir, saveName);
    const partPath = `${savePath}.part`;
    verifiedInstaller = null;
    fs.rmSync(savePath, { force: true });
    fs.rmSync(partPath, { force: true });

    logger('INFO', 'update', isBeta ? 'beta-download-start' : 'download-start', `version ${version}`);

    let sha256;
    try {
        sha256 = await downloadTo(downloadUrl, partPath, token, (downloaded, total) => {
            if (mainWindow) {
                mainWindow.webContents.send('update-progress', {
                    progress: (downloaded / total) * 100,
                    downloaded,
                    total,
                    ...(isBeta ? { isBeta: true } : {})
                });
            }
        });
    } catch (err) {
        fs.rmSync(partPath, { force: true });
        logger('ERROR', 'update', 'download-fail', err.message);
        return { success: false, error: err.message };
    }

    if (!signatureValid(release, sha256)) {
        fs.rmSync(partPath, { force: true });
        logger('ERROR', 'update', 'signature-fail', `${channel} ${version} sha256 ${sha256}`);
        return { success: false, error: 'The downloaded update failed its signature check and was deleted' };
    }

    fs.renameSync(partPath, savePath);
    verifiedInstaller = { path: savePath, sha256 };
    logger('INFO', 'update', isBeta ? 'beta-download-complete' : 'download-complete', `version ${version} → ${savePath}`);

    if (token) {
        const { trackEvent } = require('./analytics');
        const fromVersion = isBeta && IS_BETA_BUILD ? BETA_VERSION : APP_VERSION;
        trackEvent(isBeta ? 'beta_update' : 'update', { from_version: fromVersion, to_version: version }, token);
    }

    return { success: true, path: savePath };
}

function registerUpdateHandlers(mainWindow) {
    ipcMain.handle('check-app-update', async () => {
        try {
            const platform = platformName();
            const response = await fetchVersionInfo(authToken());

            const currentVersion = IS_BETA_BUILD ? BETA_VERSION : APP_VERSION;
            const stableUpdateRequired = IS_BETA_BUILD ? false : (response.required || false);

            knownReleases = {
                stable: response.version ? { channel: 'stable', platform, version: response.version, signature: response.signature || null } : null,
                beta: null
            };

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
                if (betaVersion) {
                    knownReleases.beta = { channel: 'beta', platform, version: betaVersion, signature: response.beta.signature || null };
                }
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

        const token = authToken();
        if (!token) {
            return { valid: false, reason: 'not_authenticated', isBetaBuild: true };
        }

        try {
            const response = await fetchVersionInfo(token);

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

    ipcMain.handle('download-app-update', (event, version) => downloadRelease(mainWindow, 'stable', version));

    ipcMain.handle('download-beta-update', (event, version) => downloadRelease(mainWindow, 'beta', version));

    ipcMain.handle('run-update-installer', async () => {
        const installer = verifiedInstaller;
        if (!installer) return false;

        try {
            const sha256 = await hashFile(installer.path);
            if (sha256 !== installer.sha256) {
                logger('ERROR', 'update', 'installer-changed', installer.path);
                fs.rmSync(installer.path, { force: true });
                verifiedInstaller = null;
                return false;
            }
        } catch (err) {
            logger('ERROR', 'update', 'installer-missing', err.message);
            return false;
        }

        logger('INFO', 'update', 'installer-run', installer.path);
        verifiedInstaller = null;

        if (process.platform === 'linux') {
            if (!process.env.APPIMAGE) {
                return false;
            }
            try {
                fs.chmodSync(installer.path, 0o755);
                fs.renameSync(installer.path, process.env.APPIMAGE);
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
            spawn(installer.path, [], { detached: true, stdio: 'ignore' }).unref();
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

module.exports = { registerUpdateHandlers, APP_VERSION, IS_BETA_BUILD, BETA_VERSION, signatureValid, releaseMessage };
