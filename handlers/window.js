const { ipcMain, shell, dialog } = require('electron');

function registerWindowHandlers(mainWindow) {
    ipcMain.handle('window-minimize', () => mainWindow.minimize());

    ipcMain.handle('window-maximize', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });

    ipcMain.handle('window-close', () => mainWindow.close());
}

module.exports = { registerWindowHandlers };
