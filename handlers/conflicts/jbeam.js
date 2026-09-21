const crypto = require('crypto')

function stripComments(text) {
    let out = ''
    let i = 0
    let inString = false

    while (i < text.length) {
        const ch = text[i]

        if (inString) {
            if (ch === '\\') {
                out += ch + (text[i + 1] || '')
                i += 2
                continue
            }
            if (ch === '"') inString = false
            out += ch
            i++
            continue
        }

        if (ch === '"') {
            inString = true
            out += ch
            i++
            continue
        }

        if (ch === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i++
            continue
        }

        if (ch === '/' && text[i + 1] === '*') {
            i += 2
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
            i += 2
            continue
        }

        out += ch
        i++
    }

    return out
}

function findMatchingClose(src, openIndex) {
    let depth = 0
    let i = openIndex

    while (i < src.length) {
        const ch = src[i]

        if (ch === '"') {
            i++
            while (i < src.length) {
                if (src[i] === '\\') { i += 2; continue }
                if (src[i] === '"') { i++; break }
                i++
            }
            continue
        }

        if (ch === '{' || ch === '[') {
            depth++
        } else if (ch === '}' || ch === ']') {
            depth--
            if (depth === 0) return i
        }
        i++
    }

    return -1
}

function extractParts(text) {
    if (typeof text !== 'string' || !text) return []

    const src = stripComments(text)
    const parts = []
    const seen = new Set()
    let depth = 0
    let i = 0

    while (i < src.length) {
        const ch = src[i]

        if (ch === '"') {
            let j = i + 1
            let value = ''
            let closed = false

            while (j < src.length) {
                if (src[j] === '\\') {
                    value += src[j + 1] || ''
                    j += 2
                    continue
                }
                if (src[j] === '"') {
                    closed = true
                    break
                }
                value += src[j]
                j++
            }

            i = closed ? j + 1 : src.length

            if (closed && depth === 1 && value && !seen.has(value)) {
                let k = i
                while (k < src.length && /\s/.test(src[k])) k++
                if (src[k] === ':') {
                    let v = k + 1
                    while (v < src.length && /\s/.test(src[v])) v++
                    if (src[v] === '{' || src[v] === '[') {
                        const end = findMatchingClose(src, v)
                        if (end !== -1) {
                            seen.add(value)
                            const body = src.slice(v, end + 1).replace(/\s+/g, ' ').trim()
                            const hash = crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)
                            parts.push({ name: value, hash })
                        }
                    }
                }
            }
            continue
        }

        if (ch === '{' || ch === '[') depth++
        else if (ch === '}' || ch === ']') depth--
        i++
    }

    return parts
}

module.exports = { extractParts, findMatchingClose, stripComments }
