const { ipcMain } = require('electron');

const clientid = '1450159837882089686';

let rpc = null;
let connected = false;
let currentActivity = 'idle';
let currentModName = null;
let enabled = true;
let reconnectTimeout = null;

const activities = {
    idle: {
        details: 'Browsing BeamFinds',
        state: 'Looking for mods',
        largeImageKey: 'beamfinds_logo',
        largeImageText: 'BeamFinds',
        startTimestamp: null
    },
    downloading: {
        details: 'Downloading a mod',
        state: null,
        largeImageKey: 'beamfinds_logo',
        largeImageText: 'BeamFinds',
        smallImageKey: 'download_icon',
        smallImageText: 'Downloading',
        startTimestamp: null
    },
    updates: {
        details: 'Checking for updates',
        state: 'Scanning installed mods',
        largeImageKey: 'beamfinds_logo',
        largeImageText: 'BeamFinds',
        startTimestamp: null
    }
};

async function initDiscordRPC(store) {
    enabled = store.get('discordRpcEnabled') !== false;

    if (!enabled) {
        console.log('Discord RPC is disabled in settings');
        return;
    }

    try {
        const DiscordRPC = require('discord-rpc');
        DiscordRPC.register(clientid);
        rpc = new DiscordRPC.Client({ transport: 'ipc' });

        rpc.on('ready', () => {
            connected = true;
            console.log('Discord RPC connected');
            setActivity('idle');
        });

        rpc.on('disconnected', () => {
            connected = false;
            console.log('Discord RPC disconnected');
            scheduleReconnect(store);
        });

        await rpc.login({ clientId: clientid });
    } catch (err) {
        console.error('Discord RPC init failed:', err.message);
        scheduleReconnect(store);
    }
}

function scheduleReconnect(store) {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
    }

    reconnectTimeout = setTimeout(() => {
        if (enabled && !connected) {
            console.log('Attempting Discord RPC reconnect...');
            initDiscordRPC(store);
        }
    }, 15000);
}

function setActivity(type, modName = null) {
    if (!connected || !enabled || !rpc) return;

    currentActivity = type;
    currentModName = modName;

    const activity = { ...activities[type] };

    if (type === 'downloading' && modName) {
        activity.state = modName;
    }

    activity.startTimestamp = Date.now();

    try {
        rpc.setActivity(activity);
    } catch (err) {
        console.error('Failed to set Discord activity:', err.message);
    }
}

function clearActivity() {
    if (!rpc) return;

    try {
        rpc.clearActivity();
    } catch (err) {
        console.error('Failed to clear Discord activity:', err.message);
    }
}

function disconnect() {
    enabled = false;

    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    if (rpc && connected) {
        try {
            rpc.clearActivity();
            rpc.destroy();
        } catch (err) {
        }
        rpc = null;
        connected = false;
    }
}

function registerDiscordHandlers(store) {
    ipcMain.handle('set-discord-rpc-enabled', async (event, isEnabled) => {
        enabled = isEnabled;
        store.set('discordRpcEnabled', isEnabled);

        if (isEnabled && !connected) {
            await initDiscordRPC(store);
        } else if (!isEnabled && connected) {
            clearActivity();
            disconnect();
        }

        return enabled;
    });

    ipcMain.handle('get-discord-rpc-enabled', () => {
        return store.get('discordRpcEnabled') !== false;
    });

    ipcMain.handle('update-discord-presence', (event, activity, modName) => {
        setActivity(activity, modName);
    });
}

module.exports = {
    initDiscordRPC,
    registerDiscordHandlers,
    setActivity,
    clearActivity,
    disconnect
};
