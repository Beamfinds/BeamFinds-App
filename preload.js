const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),

    getConfig: () => ipcRenderer.invoke('get-config'),
    setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),
    getConfigKey: (key) => ipcRenderer.invoke('get-config-key', key),
    setConfigKey: (key, value) => ipcRenderer.invoke('set-config-key', key, value),
    getFullConfig: () => ipcRenderer.invoke('get-full-config'),

    selectFolder: () => ipcRenderer.invoke('select-folder'),
    selectMp3Files: () => ipcRenderer.invoke('select-mp3-files'),
    openFolder: (path) => ipcRenderer.invoke('open-folder', path),
    showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),

    startDownload: (info) => ipcRenderer.invoke('start-download', info),
    cancelDownload: (modId) => ipcRenderer.invoke('cancel-download', modId),
    getDownloads: () => ipcRenderer.invoke('get-downloads'),
    deleteModFile: (filename) => ipcRenderer.invoke('delete-mod-file', filename),

    findBeamNGMods: () => ipcRenderer.invoke('find-beamng-mods'),
    scanModsFolder: (folderPath) => ipcRenderer.invoke('scan-mods-folder', folderPath),
    checkPathExists: (path) => ipcRenderer.invoke('check-path-exists', path),

    conflictsScan: () => ipcRenderer.invoke('conflicts-scan'),
    conflictsCancel: () => ipcRenderer.invoke('conflicts-cancel'),
    conflictsGetLast: () => ipcRenderer.invoke('conflicts-get-last'),

    onConflictsProgress: (callback) => {
        const handler = (event, data) => callback(data)
        ipcRenderer.on('conflicts-progress', handler)
        return () => ipcRenderer.removeListener('conflicts-progress', handler)
    },

    modsDisable: (relPath, meta) => ipcRenderer.invoke('mods-disable', relPath, meta),
    modsEnable: (relPath) => ipcRenderer.invoke('mods-enable', relPath),
    modsListDisabled: () => ipcRenderer.invoke('mods-list-disabled'),
    modsTrash: (scope, relPath) => ipcRenderer.invoke('mods-trash', scope, relPath),

    checkAppUpdate: () => ipcRenderer.invoke('check-app-update'),
    downloadAppUpdate: (version) => ipcRenderer.invoke('download-app-update', version),
    downloadBetaUpdate: (version) => ipcRenderer.invoke('download-beta-update', version),
    runUpdateInstaller: () => ipcRenderer.invoke('run-update-installer'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    isBetaBuild: () => ipcRenderer.invoke('is-beta-build'),
    verifyBetaAccess: () => ipcRenderer.invoke('verify-beta-access'),

    onDownloadProgress: (callback) => {
        ipcRenderer.on('download-progress', (event, data) => callback(data));
    },

    onProtocolDownload: (callback) => {
        ipcRenderer.on('protocol-download', (event, data) => callback(data));
    },

    onUpdateProgress: (callback) => {
        ipcRenderer.on('update-progress', (event, data) => callback(data));
    },

    setDiscordRpcEnabled: (enabled) => ipcRenderer.invoke('set-discord-rpc-enabled', enabled),
    getDiscordRpcEnabled: () => ipcRenderer.invoke('get-discord-rpc-enabled'),
    updateDiscordPresence: (activity, modName) => ipcRenderer.invoke('update-discord-presence', activity, modName),

    playlistCheckDependencies: (source) => ipcRenderer.invoke('playlist-check-dependencies', source),
    playlistInstallDependency: (dependency) => ipcRenderer.invoke('playlist-install-dependency', dependency),
    playlistFetchInfo: (url, source) => ipcRenderer.invoke('playlist-fetch-info', url, source),
    playlistProcessLocalFiles: (filePaths) => ipcRenderer.invoke('playlist-process-local-files', filePaths),
    playlistCreateMod: (name, songs, sourceUrl) => ipcRenderer.invoke('playlist-create-mod', name, songs, sourceUrl),
    playlistGetCreated: () => ipcRenderer.invoke('playlist-get-created'),
    playlistDelete: (filename) => ipcRenderer.invoke('playlist-delete', filename),
    playlistGetSongs: (filename) => ipcRenderer.invoke('playlist-get-songs', filename),
    playlistUpdate: (playlistName, originalFilename, songs) => ipcRenderer.invoke('playlist-update', playlistName, originalFilename, songs),
    playlistCancelCreation: () => ipcRenderer.invoke('playlist-cancel-creation'),
    playlistOpenDependencyUrl: (dependency) => ipcRenderer.invoke('playlist-open-dependency-url', dependency),

    onPlaylistDependencyProgress: (callback) => {
        ipcRenderer.on('playlist-dependency-progress', (event, data) => callback(data));
    },

    onPlaylistCreationProgress: (callback) => {
        ipcRenderer.on('playlist-creation-progress', (event, data) => callback(data));
    },

    openBrowserLogin: () => ipcRenderer.invoke('open-browser-login'),
    launchBeamNG: () => ipcRenderer.invoke('launch-beamng'),

    onProtocolAuth: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('protocol-auth', handler);
        return () => ipcRenderer.removeListener('protocol-auth', handler);
    },

    exportLogs: () => ipcRenderer.invoke('export-logs'),
    saveLogs: (content) => ipcRenderer.invoke('save-logs', content),
    logEvent: (level, category, event, detail) => ipcRenderer.invoke('log-event', level, category, event, detail),
});
