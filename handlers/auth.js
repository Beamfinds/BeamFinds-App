const { safeStorage } = require('electron');
const crypto = require('crypto');

const loginWindowMs = 10 * 60 * 1000;

let pendingLogin = null;

function canEncrypt() {
    try {
        if (!safeStorage.isEncryptionAvailable()) return false;
        if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
        return true;
    } catch {
        return false;
    }
}

function setAuthToken(store, token) {
    if (!token || typeof token !== 'string') {
        store.delete('authToken');
        store.delete('authTokenEnc');
        return;
    }

    if (canEncrypt()) {
        store.set('authTokenEnc', safeStorage.encryptString(token).toString('base64'));
        store.delete('authToken');
    } else {
        store.set('authToken', token);
        store.delete('authTokenEnc');
    }
}

function getAuthToken(store) {
    const enc = store.get('authTokenEnc');
    if (enc) {
        try {
            return safeStorage.decryptString(Buffer.from(enc, 'base64'));
        } catch {
            store.delete('authTokenEnc');
            return null;
        }
    }

    const legacy = store.get('authToken');
    if (legacy && canEncrypt()) setAuthToken(store, legacy);
    return legacy || null;
}

function startLogin() {
    const state = crypto.randomBytes(24).toString('hex');
    pendingLogin = { state, expires: Date.now() + loginWindowMs };
    return state;
}

function consumeLogin(state) {
    const pending = pendingLogin;
    if (!pending || typeof state !== 'string') return false;
    if (Date.now() > pending.expires) {
        pendingLogin = null;
        return false;
    }
    const a = Buffer.from(pending.state);
    const b = Buffer.from(state);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    pendingLogin = null;
    return true;
}

module.exports = { getAuthToken, setAuthToken, startLogin, consumeLogin };
