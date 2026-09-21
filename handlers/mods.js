const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { logger } = require('./logger');

function registerModHandlers() {
    ipcMain.handle('scan-mods-folder', async (event, folderPath) => {
        if (!folderPath || !fs.existsSync(folderPath)) {
            return { error: 'Invalid folder path', mods: [] };
        }

        const foundMods = [];

        try {
            const files = fs.readdirSync(folderPath);
            logger('INFO', 'mods', 'scan-start', folderPath);
            const zipFiles = files.filter(f => f.toLowerCase().endsWith('.zip'));

            for (const zipFile of zipFiles) {
                const zipPath = path.join(folderPath, zipFile);

                try {
                    const zip = new AdmZip(zipPath);

                    const entriesToCheck = ['beamfinds.json', 'beamleaks.json'];
                    let metadata = null;

                    for (const entryName of entriesToCheck) {
                        const entry = zip.getEntry(entryName);
                        if (entry) {
                            const jsonData = zip.readAsText(entry);
                            metadata = JSON.parse(jsonData);
                            break; 
                        }
                    }

                    if (metadata && ['beamfinds.com', 'beamleaks.com'].includes(metadata.source) && metadata.modId) {
                        foundMods.push({
                            modId: metadata.modId,
                            name: metadata.name || 'Unknown Mod',
                            creator: metadata.creator || 'Unknown',
                            version: metadata.version || '1.0.0',
                            uploadedAt: metadata.uploadedAt,
                            updatedAt: metadata.updatedAt,
                            filename: zipFile
                        });
                    }
                } catch (zipErr) {
                    console.error(`Error reading zip ${zipFile}:`, zipErr.message);
                }
            }

            logger('INFO', 'mods', 'scan-complete', `${foundMods.length} mods found`);
            return { mods: foundMods };
        } catch (err) {
            console.error('Error scanning mods folder:', err);
            logger('ERROR', 'mods', 'scan-fail', err.message);
            return { error: err.message, mods: [] };
        }
    });
}

module.exports = { registerModHandlers };