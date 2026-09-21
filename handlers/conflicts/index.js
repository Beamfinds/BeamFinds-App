const { ipcMain } = require('electron')
const path = require('path')
const { Worker } = require('worker_threads')
const { analyzeConflicts } = require('./analyze')
const { readCache, writeCache } = require('./cache')
const { logger } = require('../logger')

let activeWorker = null

function runScan(mainWindow, modsFolder) {
    return new Promise((resolve) => {
        const { entries } = readCache(modsFolder)

        const worker = new Worker(path.join(__dirname, 'scanner.js'), {
            workerData: { modsFolder, cache: entries }
        })
        activeWorker = worker

        const finish = (value) => {
            activeWorker = null
            worker.terminate()
            resolve(value)
        }

        worker.on('message', (msg) => {
            if (msg.type === 'progress') {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('conflicts-progress', msg)
                }
                return
            }

            if (msg.type === 'cancelled') {
                finish({ cancelled: true })
                return
            }

            if (msg.type === 'error') {
                logger('ERROR', 'conflicts', 'scan-fail', msg.message)
                finish({ error: msg.message })
                return
            }

            if (msg.type === 'done') {
                let analysis
                try {
                    analysis = analyzeConflicts(msg.records)
                } catch (err) {
                    logger('ERROR', 'conflicts', 'analyze-fail', err.message)
                    finish({ error: 'Could not analyze scan results: ' + err.message })
                    return
                }

                const result = {
                    pairs: analysis.pairs,
                    suppressed: analysis.suppressed,
                    crowded: analysis.crowded,
                    truncated: analysis.truncated,
                    unreadable: msg.unreadable,
                    modCount: msg.records.length,
                    scannedAt: new Date().toISOString()
                }

                const nextEntries = {}
                for (const record of msg.records) nextEntries[record.relPath] = record
                writeCache(modsFolder, nextEntries, result)

                logger('INFO', 'conflicts', 'scan-complete', `${msg.records.length} mods, ${analysis.pairs.length} pairs`)
                finish(result)
            }
        })

        worker.on('error', (err) => {
            logger('ERROR', 'conflicts', 'worker-error', err.message)
            finish({ error: err.message })
        })
    })
}

function registerConflictHandlers(mainWindow, store) {
    ipcMain.handle('conflicts-scan', async () => {
        const modsFolder = store.get('modsFolder')
        if (!modsFolder) return { error: 'Mods folder is not configured' }
        if (activeWorker) return { error: 'A scan is already running' }
        logger('INFO', 'conflicts', 'scan-start', modsFolder)
        return runScan(mainWindow, modsFolder)
    })

    ipcMain.handle('conflicts-cancel', () => {
        if (activeWorker) activeWorker.postMessage('cancel')
        return true
    })

    ipcMain.handle('conflicts-get-last', () => {
        const modsFolder = store.get('modsFolder')
        if (!modsFolder) return null
        return readCache(modsFolder).last
    })
}

module.exports = { registerConflictHandlers }
