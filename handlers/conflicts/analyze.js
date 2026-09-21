const { summarize } = require('./symptoms')

const ignoredNames = [
    'readme', 'readme.txt', 'readme.md',
    'license', 'license.txt', 'license.md',
    'changelog', 'changelog.txt', 'changelog.md',
    'thumbs.db', 'desktop.ini', '.ds_store', 'beamfinds.json'
]

const minDuplicateFiles = 5
const duplicateOverlap = 0.9
const crowdedThreshold = 20
const maxPairs = 4000

function isIgnoredPath(filePath) {
    if (filePath.endsWith('/')) return true
    if (filePath.includes('/')) return false
    if (ignoredNames.includes(filePath)) return true
    return /\.(png|jpg|jpeg|gif|webp|bmp)$/.test(filePath)
}

function slim(mod) {
    return {
        relPath: mod.relPath,
        fileName: mod.fileName,
        displayName: mod.displayName,
        size: mod.size
    }
}

function pairKeyOf(left, right) {
    return `${Math.min(left, right)}:${Math.max(left, right)}`
}

function findDuplicates(mods, pathIndex) {
    const significantCount = mods.map(() => 0)
    const sharedCount = new Map()

    for (const [filePath, claims] of pathIndex) {
        if (isIgnoredPath(filePath)) continue

        const owners = claims.map((c) => c.index)
        for (const owner of owners) significantCount[owner]++

        for (let i = 0; i < owners.length; i++) {
            for (let j = i + 1; j < owners.length; j++) {
                const key = pairKeyOf(owners[i], owners[j])
                sharedCount.set(key, (sharedCount.get(key) || 0) + 1)
            }
        }
    }

    const duplicates = new Map()

    for (const [key, shared] of sharedCount) {
        const [low, high] = key.split(':').map(Number)
        const sizeLow = significantCount[low]
        const sizeHigh = significantCount[high]
        if (sizeLow < minDuplicateFiles || sizeHigh < minDuplicateFiles) continue

        const union = sizeLow + sizeHigh - shared
        if (union === 0 || shared / union < duplicateOverlap) continue

        let identical = true
        for (const filePath of Object.keys(mods[low].files || {})) {
            if (isIgnoredPath(filePath)) continue
            const otherCrc = (mods[high].files || {})[filePath]
            if (otherCrc === undefined) continue
            if (otherCrc !== mods[low].files[filePath]) {
                identical = false
                break
            }
        }

        duplicates.set(key, identical ? 'identical' : 'versions')
    }

    return duplicates
}

function analyzeConflicts(mods) {
    const pathIndex = new Map()
    const partIndex = new Map()
    const materialIndex = new Map()

    mods.forEach((mod, index) => {
        for (const filePath of Object.keys(mod.files || {})) {
            if (!pathIndex.has(filePath)) pathIndex.set(filePath, [])
            pathIndex.get(filePath).push({ index, crc: mod.files[filePath] })
        }
        for (const part of mod.parts || []) {
            if (!partIndex.has(part.name)) partIndex.set(part.name, [])
            partIndex.get(part.name).push({ index, hash: part.hash })
        }
        for (const material of mod.materials || []) {
            if (!materialIndex.has(material.id)) materialIndex.set(material.id, [])
            materialIndex.get(material.id).push({ index, hash: material.hash })
        }
    })

    const duplicates = findDuplicates(mods, pathIndex)

    const pairs = new Map()
    let truncated = false

    function pairFor(left, right) {
        const low = Math.min(left, right)
        const high = Math.max(left, right)
        const key = `${low}:${high}`
        if (pairs.has(key)) return pairs.get(key)
        if (pairs.size >= maxPairs) {
            truncated = true
            return null
        }
        pairs.set(key, {
            a: slim(mods[low]),
            b: slim(mods[high]),
            files: [],
            parts: [],
            materials: [],
            harmless: [],
            harmlessParts: [],
            harmlessMaterials: [],
            duplicate: duplicates.get(key) || null
        })
        return pairs.get(key)
    }

    let suppressed = 0
    const crowded = []

    for (const [filePath, claims] of pathIndex) {
        const owners = [...new Set(claims.map((c) => c.index))]
        if (owners.length < 2) continue
        if (owners.length > crowdedThreshold) {
            crowded.push({ kind: 'file', id: filePath, count: owners.length })
            continue
        }

        const crcByOwner = new Map(claims.map((c) => [c.index, c.crc]))
        const ignored = isIgnoredPath(filePath)
        let allHarmless = true
        let allDuplicate = true

        for (let i = 0; i < owners.length; i++) {
            for (let j = i + 1; j < owners.length; j++) {
                if (!duplicates.has(pairKeyOf(owners[i], owners[j]))) allDuplicate = false
                const pair = pairFor(owners[i], owners[j])
                if (!pair) continue
                const harmless = ignored || crcByOwner.get(owners[i]) === crcByOwner.get(owners[j])
                if (harmless) {
                    pair.harmless.push(filePath)
                } else {
                    pair.files.push(filePath)
                    allHarmless = false
                }
            }
        }

        if (allHarmless && !allDuplicate) suppressed++
    }

    for (const [name, claims] of partIndex) {
        const owners = [...new Set(claims.map((c) => c.index))]
        if (owners.length < 2) continue
        if (owners.length > crowdedThreshold) {
            crowded.push({ kind: 'part', id: name, count: owners.length })
            continue
        }

        const hashByOwner = new Map(claims.map((c) => [c.index, c.hash]))
        let allHarmless = true
        let allDuplicate = true

        for (let i = 0; i < owners.length; i++) {
            for (let j = i + 1; j < owners.length; j++) {
                if (!duplicates.has(pairKeyOf(owners[i], owners[j]))) allDuplicate = false
                const pair = pairFor(owners[i], owners[j])
                if (!pair) continue
                if (hashByOwner.get(owners[i]) === hashByOwner.get(owners[j])) {
                    pair.harmlessParts.push(name)
                } else {
                    pair.parts.push(name)
                    allHarmless = false
                }
            }
        }

        if (allHarmless && !allDuplicate) suppressed++
    }

    for (const [id, claims] of materialIndex) {
        const owners = [...new Set(claims.map((c) => c.index))]
        if (owners.length < 2) continue
        if (owners.length > crowdedThreshold) {
            crowded.push({ kind: 'material', id, count: owners.length })
            continue
        }

        const hashByOwner = new Map(claims.map((c) => [c.index, c.hash]))
        let allHarmless = true
        let allDuplicate = true

        for (let i = 0; i < owners.length; i++) {
            for (let j = i + 1; j < owners.length; j++) {
                if (!duplicates.has(pairKeyOf(owners[i], owners[j]))) allDuplicate = false
                const pair = pairFor(owners[i], owners[j])
                if (!pair) continue
                if (hashByOwner.get(owners[i]) === hashByOwner.get(owners[j])) {
                    pair.harmlessMaterials.push(id)
                } else {
                    pair.materials.push(id)
                    allHarmless = false
                }
            }
        }

        if (allHarmless && !allDuplicate) suppressed++
    }

    for (const key of duplicates.keys()) {
        const [low, high] = key.split(':').map(Number)
        pairFor(low, high)
    }

    const result = [...pairs.values()].filter((p) => {
        return p.files.length > 0 || p.parts.length > 0 || p.materials.length > 0 || p.duplicate
    })
    for (const pair of result) pair.symptom = summarize(pair)
    result.sort((x, y) => {
        return (y.files.length + y.parts.length + y.materials.length)
            - (x.files.length + x.parts.length + x.materials.length)
    })

    return { pairs: result, suppressed, crowded, truncated }
}

module.exports = { analyzeConflicts, isIgnoredPath }
