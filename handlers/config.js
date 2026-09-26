const { ipcMain } = require('electron');
const { getAuthToken, setAuthToken } = require('./auth');

const hiddenKeys = ['authToken', 'authTokenEnc', 'refreshToken'];

function publicConfig(store) {
    const config = { ...store.store };
    hiddenKeys.forEach(key => delete config[key]);
    return config;
}

function readKey(store, key) {
    if (key === 'authToken') return getAuthToken(store);
    if (hiddenKeys.includes(key)) return undefined;
    return store.get(key);
}

function writeKey(store, key, value) {
    if (typeof key !== 'string' || !key) return;
    if (key === 'authToken') return setAuthToken(store, value);
    if (hiddenKeys.includes(key)) return;
    if (value === null || value === undefined) {
        store.delete(key);
        return;
    }
    store.set(key, value);
}

function registerConfigHandlers(store) {
    ipcMain.handle('get-config', () => publicConfig(store));

    ipcMain.handle('set-config', (event, key, value) => writeKey(store, key, value));

    ipcMain.handle('get-config-key', (event, key) => readKey(store, key));

    ipcMain.handle('set-config-key', (event, key, value) => writeKey(store, key, value));

    ipcMain.handle('get-full-config', () => publicConfig(store));
}

module.exports = { registerConfigHandlers };
