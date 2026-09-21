const loadOrderNote = 'BeamNG has no defined load order, so which mod wins is unpredictable and can change between launches.'

const textureExtensions = ['.dds', '.png', '.jpg', '.jpeg']

const genericFiles = {
    headline: "One mod's files replace the other's",
    detail: 'Both mods ship a file at the same internal path, so only one of them is ever loaded.'
}

function extensionOf(filePath) {
    const base = filePath.split('/').pop()
    const dot = base.lastIndexOf('.')
    return dot <= 0 ? '' : base.slice(dot).toLowerCase()
}

function fileSymptom(files) {
    const extensions = new Set(files.map(extensionOf))
    if (extensions.size === 0) return genericFiles

    const list = [...extensions]

    if (list.every((ext) => ext === '.lua')) {
        return {
            headline: "One mod's code won't run",
            detail: 'Both mods ship a script at the same path. One replaces the other, so its features silently stop working.'
        }
    }

    if (list.every((ext) => ext === '.jbeam')) {
        return {
            headline: "One mod's vehicle files replace the other's",
            detail: 'Both mods ship a vehicle file at the same path. Affected vehicles may spawn wrong or behave oddly.'
        }
    }

    if (list.every((ext) => textureExtensions.includes(ext))) {
        return {
            headline: "One mod's textures replace the other's",
            detail: 'Both mods ship an image at the same path, so one mod renders with the other mod\'s artwork.'
        }
    }

    if (list.every((ext) => ext === '.json')) {
        return {
            headline: "One mod's settings replace the other's",
            detail: 'Both mods ship a config file at the same path, so one mod\'s settings are never read.'
        }
    }

    return genericFiles
}

function summarize(pair) {
    if (pair.duplicate === 'identical') {
        return {
            headline: 'Installed twice',
            detail: 'These two zips hold the same mod. Delete either copy, it makes no difference which one.',
            loadOrder: false
        }
    }

    if (pair.duplicate === 'versions') {
        return {
            headline: 'Two versions of the same mod',
            detail: 'These look like the same mod at two different versions. Keep the newer one and remove the other.',
            loadOrder: true
        }
    }

    if (pair.materials.length > 0) {
        return {
            headline: 'One of these will show missing or wrong textures',
            detail: 'Both mods define the same material, so one silently replaces the other. This is what produces NO TEXTURE and NO MATERIAL in game.',
            loadOrder: true
        }
    }

    if (pair.parts.length > 0) {
        return {
            headline: "One mod's vehicle part replaces the other's",
            detail: 'Both mods declare the same part name. Vehicles using it may spawn wrong or behave oddly.',
            loadOrder: true
        }
    }

    const fromFiles = fileSymptom(pair.files)
    return { headline: fromFiles.headline, detail: fromFiles.detail, loadOrder: true }
}

module.exports = { summarize, loadOrderNote }
