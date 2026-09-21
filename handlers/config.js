const { ipcMain } = require('electron');

function registerConfigHandlers(store) {
    ipcMain.handle('get-config', () => store.store);

    ipcMain.handle('set-config', (event, key, value) => store.set(key, value));

    ipcMain.handle('get-config-key', (event, key) => store.get(key));

    ipcMain.handle('set-config-key', (event, key, value) => {
        store.set(key, value);
    });

    ipcMain.handle('get-full-config', () => {
        const config = { ...store.store };
        const sensitiveKeys = ['authToken', 'refreshToken'];
        sensitiveKeys.forEach(key => delete config[key]);
        return config;
    });
}

module.exports = { registerConfigHandlers };
