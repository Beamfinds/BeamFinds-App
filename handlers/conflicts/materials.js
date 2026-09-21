const crypto = require('crypto')
const { stripComments } = require('./jbeam')

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
    return '{' + Object.keys(value).sort().map((key) => {
        return JSON.stringify(key) + ':' + stableStringify(value[key])
    }).join(',') + '}'
}

function parseTolerant(text) {
    const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
    const src = stripComments(withoutBom)

    try {
        return JSON.parse(src)
    } catch (err) {
    }

    try {
        return JSON.parse(src.replace(/,(\s*[}\]])/g, '$1'))
    } catch (err) {
        return null
    }
}

function extractMaterials(text) {
    if (typeof text !== 'string' || !text) return []

    const parsed = parseTolerant(text)
    if (!isPlainObject(parsed)) return []

    const out = []
    const seen = new Set()

    for (const [key, value] of Object.entries(parsed)) {
        if (!isPlainObject(value)) continue

        const hash = crypto.createHash('sha1').update(stableStringify(value)).digest('hex').slice(0, 16)
        const ids = []

        const named = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : key
        if (named) ids.push(named)
        if (typeof value.mapTo === 'string' && value.mapTo.trim()) ids.push(value.mapTo.trim())

        for (const id of ids) {
            if (seen.has(id)) continue
            seen.add(id)
            out.push({ id, hash })
        }
    }

    return out
}

module.exports = { extractMaterials }
