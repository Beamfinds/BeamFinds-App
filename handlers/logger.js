const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { IS_BETA_BUILD, BETA_VERSION } = require('./updates');

const MAX_BYTES = 10 * 1024 * 1024;

let logPath = null;

function getLogPath() {
    if (!logPath) logPath = path.join(app.getPath('userData'), 'beamfinds-debug.log');
    return logPath;
}

function timestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function roll() {
    const p = getLogPath();
    try {
        const stat = fs.statSync(p);
        if (stat.size < MAX_BYTES) return;
        const content = fs.readFileSync(p, 'utf8');
        const lines = content.split('\n');
        const half = lines.slice(Math.floor(lines.length / 2));
        fs.writeFileSync(p, half.join('\n'), 'utf8');
    } catch {}
}

function logger(level, category, event, detail) {
    if (!IS_BETA_BUILD) return;
    roll();
    const line = detail
        ? `[${timestamp()}] [${level}] ${category}:${event} - ${detail}\n`
        : `[${timestamp()}] [${level}] ${category}:${event}\n`;
    try {
        fs.appendFileSync(getLogPath(), line, 'utf8');
    } catch {}
}

function exportLog() {
    if (!IS_BETA_BUILD) return '';
    const p = getLogPath();
    const version = BETA_VERSION;
    const platform = `${process.platform === 'win32' ? 'Windows' : 'Linux'} (${os.version()})`;
    const exported = timestamp();

    const header = [
        'BeamFinds Debug Log',
        `Version: ${version}`,
        `Platform: ${platform}`,
        `Exported: ${exported}`,
        '----------------------------------------',
        '',
    ].join('\n');

    try {
        const body = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '(no log entries yet)';
        return header + body;
    } catch {
        return header + '(could not read log file)';
    }
}

module.exports = { logger, exportLog };
