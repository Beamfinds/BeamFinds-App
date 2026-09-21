const { ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

function registerFilesystemHandlers(mainWindow, store) {
    ipcMain.handle('select-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle('select-mp3-files', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'MP3 Audio', extensions: ['mp3'] }]
        });
        return result.canceled ? [] : result.filePaths;
    });

    ipcMain.handle('open-folder', (event, folderPath) => {
        shell.openPath(folderPath);
    });

    ipcMain.handle('show-in-folder', (event, filePath) => {
        shell.showItemInFolder(filePath);
    });

    ipcMain.handle('find-beamng-mods', () => {
        if (process.platform === 'win32') {
            const localAppData = process.env.LOCALAPPDATA;

            const altCurrentMods = path.join(localAppData, 'BeamNG', 'BeamNG.drive', 'current', 'mods');
            if (fs.existsSync(altCurrentMods)) {
                return altCurrentMods;
            }

            const beamngDir = path.join(localAppData, 'BeamNG.drive');

            if (!fs.existsSync(beamngDir)) {
                return null;
            }

            try {
                const entries = fs.readdirSync(beamngDir, { withFileTypes: true });

                const versionFolders = entries
                    .filter(entry => entry.isDirectory() && /^0\.\d+$/.test(entry.name))
                    .map(entry => entry.name)
                    .sort((a, b) => {
                        const verA = parseFloat(a);
                        const verB = parseFloat(b);
                        return verB - verA;
                    });

                for (const version of versionFolders) {
                    const modsPath = path.join(beamngDir, version, 'mods');
                    if (fs.existsSync(modsPath)) {
                        return modsPath;
                    }
                }

                const genericMods = path.join(beamngDir, 'mods');

                if (fs.existsSync(genericMods)) {
                    return genericMods;
                }
            } catch (err) {
                console.error('Error scanning BeamNG directory:', err);
            }

            const beammpPath = findBeamMPMods();
            if (beammpPath) {
                return beammpPath;
            }

            return null;
        }

        if (process.platform === 'linux') {
            return findBeamNGLinux();
        }

        return null;
    });

    function findBeamMPMods() {
        const drives = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

        for (const drive of drives) {
            const beammpModsPath = path.join(`${drive}:`, 'Games', 'BeamMP-Launcher', 'Beamng', 'current', 'mods');

            try {
                if (fs.existsSync(beammpModsPath)) {
                    return beammpModsPath;
                }
            } catch (err) {
            }
        }

        return null;
    }

    function findBeamNGLinux() {
        const home = os.homedir();
        const steamBases = [
            path.join(home, '.steam', 'steam', 'steamapps'),
            path.join(home, '.local', 'share', 'Steam', 'steamapps'),
        ];

        const vdfPaths = steamBases.map(b => path.join(b, 'libraryfolders.vdf'));
        for (const vdfPath of vdfPaths) {
            try {
                const content = fs.readFileSync(vdfPath, 'utf8');
                const matches = [...content.matchAll(/^\s*"path"\s+"(.+?)"\s*$/gm)];
                for (const match of matches) {
                    const extra = path.join(match[1], 'steamapps');
                    if (!steamBases.includes(extra)) {
                        steamBases.push(extra);
                    }
                }
            } catch (e) {
            }
        }

        const BEAMNG_APP_ID = '284160';

        for (const base of steamBases) {
            const beamngBase = path.join(
                base, 'compatdata', BEAMNG_APP_ID,
                'pfx', 'drive_c', 'users', 'steamuser',
                'AppData', 'Local', 'BeamNG.drive'
            );

            if (!fs.existsSync(beamngBase)) {
                continue;
            }

            const currentMods = path.join(beamngBase, 'current', 'mods');
            if (fs.existsSync(currentMods)) {
                return currentMods;
            }

            try {
                const entries = fs.readdirSync(beamngBase, { withFileTypes: true });
                const versionFolders = entries
                    .filter(e => e.isDirectory() && /^0\.\d+$/.test(e.name))
                    .map(e => e.name)
                    .sort((a, b) => parseFloat(b) - parseFloat(a));

                for (const version of versionFolders) {
                    const modsPath = path.join(beamngBase, version, 'mods');
                    if (fs.existsSync(modsPath)) {
                        return modsPath;
                    }
                }
            } catch (e) {
            }
        }

        return null;
    }

    ipcMain.handle('check-path-exists', (event, pathToCheck) => {
        return fs.existsSync(pathToCheck);
    });
}

module.exports = { registerFilesystemHandlers };