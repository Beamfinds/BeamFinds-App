const { ipcMain } = require('electron');
const https = require('https');
const { APP_VERSION } = require('./updates');
const { getAuthToken } = require('./auth');

const ANALYTICS_URL = 'https://beamfinds.com/api/analytics/app';

function trackEvent(event, metadata = {}, token = null) {
    if (!token) {
        return;
    }

    const payload = JSON.stringify({
        event,
        version: APP_VERSION,
        metadata
    });

    const url = new URL(ANALYTICS_URL);

    const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': `Bearer ${token}`
        },
        timeout: 5000
    };

    const req = https.request(options, () => {});
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.write(payload);
    req.end();
}

function registerAnalyticsHandlers(store) {
    ipcMain.handle('track-event', (event, eventName, metadata) => {
        const token = getAuthToken(store);
        trackEvent(eventName, metadata, token);
        return { success: true };
    });
}

module.exports = { registerAnalyticsHandlers, trackEvent };
