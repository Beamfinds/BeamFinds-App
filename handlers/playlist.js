const { ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const https = require('https');
const http = require('http');
const AdmZip = require('adm-zip');
const os = require('os');

const BEAMFINDS_DIR = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA, 'BeamFinds')
    : path.join(os.homedir(), '.config', 'BeamFinds');
const BIN_DIR = path.join(BEAMFINDS_DIR, 'bin');
const TEMP_DIR = path.join(BEAMFINDS_DIR, 'temp');

const FFMPEG_PATH = path.join(BIN_DIR, 'ffmpeg.exe');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp.exe');
const SPOTDL_PATH = path.join(BIN_DIR, 'spotdl.exe');

const FFMPEG_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const SPOTDL_URL = 'https://github.com/spotDL/spotify-downloader/releases/download/v4.4.3/spotdl-4.4.3-win32.exe';

let activeProcess = null;
let isCancelled = false;

function ensureDirectories() {
    if (!fs.existsSync(BEAMFINDS_DIR)) fs.mkdirSync(BEAMFINDS_DIR, { recursive: true });
    if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        const doRequest = (currentUrl, redirectCount = 0) => {
            if (redirectCount > 10) {
                reject(new Error('Too many redirects'));
                return;
            }

            const protocol = currentUrl.startsWith('https') ? https : http;

            const req = protocol.get(currentUrl, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    let redirectUrl = response.headers.location;
                    if (redirectUrl.startsWith('/')) {
                        const urlObj = new URL(currentUrl);
                        redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
                    }
                    doRequest(redirectUrl, redirectCount + 1);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                const file = fs.createWriteStream(destPath);
                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (onProgress && totalSize) {
                        onProgress(Math.round((downloadedSize / totalSize) * 100));
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });

                file.on('error', (err) => {
                    fs.unlink(destPath, () => {});
                    reject(err);
                });
            });

            req.on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        };

        doRequest(url);
    });
}

async function installFFmpeg(mainWindow) {
    ensureDirectories();
    const zipPath = path.join(TEMP_DIR, 'ffmpeg.zip');

    if (fs.existsSync(FFMPEG_PATH)) {
        fs.unlinkSync(FFMPEG_PATH);
    }

    try {
        mainWindow.webContents.send('playlist-dependency-progress', { dependency: 'ffmpeg', status: 'downloading', progress: 0 });

        await downloadFile(FFMPEG_URL, zipPath, (progress) => {
            mainWindow.webContents.send('playlist-dependency-progress', { dependency: 'ffmpeg', status: 'downloading', progress });
        });

        mainWindow.webContents.send('playlist-dependency-progress', { dependency: 'ffmpeg', status: 'extracting', progress: 100 });

        const zip = new AdmZip(zipPath);
        const entries = zip.getEntries();

        for (const entry of entries) {
            if (entry.entryName.endsWith('ffmpeg.exe')) {
                zip.extractEntryTo(entry, BIN_DIR, false, true);
                break;
            }
        }

        fs.unlinkSync(zipPath);

        if (!fs.existsSync(FFMPEG_PATH)) {
            throw new Error('FFMPEG executable not found after extraction');
        }

        const stats = fs.statSync(FFMPEG_PATH);
        if (stats.size < 1000000) {
            fs.unlinkSync(FFMPEG_PATH);
            throw new Error('FFMPEG executable is too small, may be corrupted');
        }

        mainWindow.webContents.send('playlist-dependency-progress', { dependency: 'ffmpeg', status: 'complete', progress: 100 });
        return { success: true };
    } catch (error) {
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        return { success: false, error: error.message };
    }
}

async function installYtDlp(mainWindow) {
    ensureDirectories();

    if (fs.existsSync(YTDLP_PATH)) {
        fs.unlinkSync(YTDLP_PATH);
    }

    try {
        mainWindow.webContents.send('playlist-dependency-progress', { dependency: 'yt-dlp', status: 'downloading', progress: 0 });

        await downloadFile(YTDLP_URL, YTDLP_PATH, (progress) => {
            mainWindow.webContents.send('playlist-dependency-progress', { dependency: 'yt-dlp', status: 'downloading', progress });
        });

        const stats = fs.statSync(YTDLP_PATH);
        if (stats.size < 1000000) {
            fs.unlinkSync(YTDLP_PATH);
            throw new Error('Downloaded file is too small, may be corrupted');
        }

        mainWindow.webContents.send('playlist-dependency-progress', { dependency: 'yt-dlp', status: 'complete', progress: 100 });
        return { success: true };
    } catch (error) {
        if (fs.existsSync(YTDLP_PATH)) fs.unlinkSync(YTDLP_PATH);
        return { success: false, error: error.message };
    }
}

async function installSpotdl(mainWindow) {
    ensureDirectories();

    if (fs.existsSync(SPOTDL_PATH)) {
        fs.unlinkSync(SPOTDL_PATH);
    }

    try {
        mainWindow.webContents.send('playlist-dependency-progress', { dependency: 'spotdl', status: 'downloading', progress: 0 });

        await downloadFile(SPOTDL_URL, SPOTDL_PATH, (progress) => {
            mainWindow.webContents.send('playlist-dependency-progress', { dependency: 'spotdl', status: 'downloading', progress });
        });

        const stats = fs.statSync(SPOTDL_PATH);
        if (stats.size < 1000000) {
            fs.unlinkSync(SPOTDL_PATH);
            throw new Error('Downloaded file is too small, may be corrupted');
        }

        mainWindow.webContents.send('playlist-dependency-progress', { dependency: 'spotdl', status: 'complete', progress: 100 });
        return { success: true };
    } catch (error) {
        if (fs.existsSync(SPOTDL_PATH)) fs.unlinkSync(SPOTDL_PATH);
        return { success: false, error: error.message };
    }
}

function checkDependencies(source = null) {
    const checkFile = (filePath, minSize = 1000000) => {
        if (!fs.existsSync(filePath)) return false;
        try {
            const stats = fs.statSync(filePath);
            return stats.size > minSize;
        } catch {
            return false;
        }
    };

    const ffmpegValid = checkFile(FFMPEG_PATH);
    const ytdlpValid = checkFile(YTDLP_PATH);
    const spotdlValid = checkFile(SPOTDL_PATH);

    if (source === 'youtube') {
        return {
            ready: ffmpegValid && ytdlpValid,
            missing: [
                !ffmpegValid && 'ffmpeg',
                !ytdlpValid && 'yt-dlp'
            ].filter(Boolean)
        };
    }

    if (source === 'spotify') {
        return {
            ready: ffmpegValid && ytdlpValid,
            missing: [
                !ffmpegValid && 'ffmpeg',
                !ytdlpValid && 'yt-dlp'
            ].filter(Boolean)
        };
    }

    if (source === 'local') {
        return {
            ready: ffmpegValid,
            missing: [
                !ffmpegValid && 'ffmpeg'
            ].filter(Boolean)
        };
    }

    return {
        ffmpeg: ffmpegValid,
        ytdlp: ytdlpValid,
        spotdl: spotdlValid
    };
}

function runCommand(exePath, args, options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(exePath, args, { ...options, windowsHide: true, shell: false });
        activeProcess = proc;
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            activeProcess = null;
            if (code === 0) {
                resolve(stdout + stderr);
            } else {
                reject(new Error(stderr || stdout || `Process exited with code ${code}`));
            }
        });

        proc.on('error', (err) => {
            activeProcess = null;
            reject(err);
        });
    });
}

async function fetchPlaylistInfo(url, source = 'youtube') {
    if (source === 'youtube') {
        return await fetchYouTubePlaylist(url);
    } else if (source === 'spotify') {
        return await fetchSpotifyPlaylist(url);
    }
    return { success: false, error: 'Unknown source' };
}

async function fetchYouTubePlaylist(url) {
    if (!fs.existsSync(YTDLP_PATH)) {
        throw new Error('yt-dlp is not installed');
    }

    const isPlaylist = url.includes('list=');
    const isSingleVideo = (url.includes('watch?v=') || url.includes('youtu.be/')) && !isPlaylist;

    if (isSingleVideo) {
        return await fetchYouTubeSingleVideo(url);
    }

    const args = [
        '--flat-playlist',
        '--dump-json',
        '--no-warnings',
        url
    ];

    try {
        const output = await runCommand(YTDLP_PATH, args);
        const lines = output.trim().split('\n').filter(line => line.trim());
        const songs = lines.map(line => {
            const data = JSON.parse(line);
            return {
                id: data.id,
                title: data.title || 'Unknown Title',
                artist: data.uploader || data.channel || 'Unknown Artist',
                album: null,
                duration: data.duration || 0,
                url: data.url || `https://music.youtube.com/watch?v=${data.id}`,
                thumbnail: data.thumbnails?.[0]?.url || null,
                source: 'youtube',
                sourceId: data.id
            };
        });

        return { success: true, songs };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function fetchYouTubeSingleVideo(url) {
    const args = [
        '--dump-json',
        '--no-warnings',
        '--no-playlist',
        url
    ];

    try {
        const output = await runCommand(YTDLP_PATH, args);
        const data = JSON.parse(output.trim());

        const song = {
            id: data.id,
            title: data.title || 'Unknown Title',
            artist: data.uploader || data.channel || data.artist || 'Unknown Artist',
            album: data.album || null,
            duration: data.duration || 0,
            url: data.webpage_url || `https://www.youtube.com/watch?v=${data.id}`,
            thumbnail: data.thumbnail || data.thumbnails?.[0]?.url || null,
            source: 'youtube',
            sourceId: data.id
        };

        return { success: true, songs: [song] };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function fetchSpotifyPlaylist(url) {
    try {
        const playlistId = extractSpotifyId(url, 'playlist');
        const albumId = extractSpotifyId(url, 'album');
        const trackId = extractSpotifyId(url, 'track');

        if (!playlistId && !albumId && !trackId) {
            throw new Error('Invalid Spotify URL. Please use a playlist, album, or track link.');
        }

        if (trackId) {
            return await fetchSpotifyTrack(trackId);
        }

        if (albumId) {
            return await fetchSpotifyAlbum(albumId);
        }

        return await fetchSpotifyPlaylistData(playlistId);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function extractSpotifyId(url, type) {
    const regex = new RegExp(`spotify\\.com\\/${type}\\/([a-zA-Z0-9]+)`);
    const match = url.match(regex);
    return match ? match[1] : null;
}

function fetchSpotifyPage(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                fetchSpotifyPage(response.headers.location).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
            response.on('error', reject);
        }).on('error', reject);
    });
}

async function fetchSpotifyPlaylistData(playlistId) {
    const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;

    const html = await fetchSpotifyPage(embedUrl);

    const scriptMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s);
    if (!scriptMatch) {
        throw new Error('Could not parse Spotify playlist. The playlist might be private.');
    }

    const jsonData = JSON.parse(scriptMatch[1]);
    const entity = jsonData?.props?.pageProps?.state?.data?.entity;

    if (!entity || !entity.trackList) {
        throw new Error('Could not find tracks in playlist');
    }

    const playlistCover = entity.coverArt?.sources?.[0]?.url || null;

    const songs = entity.trackList.map(item => {
        const track = item.track || item;
        const uid = track.uid || track.uri || track.id;

        let title = track.name || track.title;
        let artists = [];

        if (track.artists && Array.isArray(track.artists)) {
            artists = track.artists.map(a => a.name).filter(Boolean);
        } else if (track.subtitle) {
            artists = [track.subtitle];
        } else if (track.artistName) {
            artists = [track.artistName];
        } else if (track.artist) {
            artists = [typeof track.artist === 'string' ? track.artist : track.artist.name];
        } else if (track.description) {
            artists = [track.description];
        }

        let albumName = null;
        let albumArt = null;

        if (track.album) {
            albumName = track.album.name || track.album;
            if (track.album.images && track.album.images.length > 0) {
                albumArt = track.album.images[0].url;
            } else if (track.album.coverArt?.sources?.[0]?.url) {
                albumArt = track.album.coverArt.sources[0].url;
            }
        }

        if (!albumArt && track.coverArt?.sources?.[0]?.url) {
            albumArt = track.coverArt.sources[0].url;
        }

        let trackId = uid;
        if (uid && uid.includes(':')) {
            trackId = uid.split(':').pop();
        }

        const durationMs = track.duration_ms || track.duration || track.durationMs || 0;
        const durationSec = durationMs > 1000 ? Math.round(durationMs / 1000) : durationMs;

        return {
            id: trackId,
            title: title || 'Unknown Title',
            artist: artists.length > 0 ? artists.join(', ') : 'Unknown Artist',
            album: albumName,
            duration: durationSec,
            url: `https://open.spotify.com/track/${trackId}`,
            thumbnail: albumArt || playlistCover,
            source: 'spotify',
            sourceId: uid
        };
    });

    return { success: true, songs, playlistName: entity.name };
}

async function fetchSpotifyAlbum(albumId) {
    const embedUrl = `https://open.spotify.com/embed/album/${albumId}`;

    const html = await fetchSpotifyPage(embedUrl);

    const scriptMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s);
    if (!scriptMatch) {
        throw new Error('Could not parse Spotify album');
    }

    const jsonData = JSON.parse(scriptMatch[1]);
    const entity = jsonData?.props?.pageProps?.state?.data?.entity;

    if (!entity || !entity.trackList) {
        throw new Error('Could not find tracks in album');
    }

    const albumArt = entity.coverArt?.sources?.[0]?.url || null;
    const albumName = entity.name || entity.title || 'Unknown Album';

    let albumArtist = 'Unknown Artist';
    if (entity.artists && Array.isArray(entity.artists)) {
        albumArtist = entity.artists.map(a => a.name).filter(Boolean).join(', ') || albumArtist;
    }

    const songs = entity.trackList.map(item => {
        const track = item.track || item;
        const uid = track.uid || track.uri || track.id;

        let title = track.name || track.title;
        let artists = [];

        if (track.artists && Array.isArray(track.artists)) {
            artists = track.artists.map(a => a.name).filter(Boolean);
        }

        let trackId = uid;
        if (uid && uid.includes(':')) {
            trackId = uid.split(':').pop();
        }

        const durationMs = track.duration_ms || track.duration || track.durationMs || 0;
        const durationSec = durationMs > 1000 ? Math.round(durationMs / 1000) : durationMs;

        return {
            id: trackId,
            title: title || 'Unknown Title',
            artist: artists.length > 0 ? artists.join(', ') : albumArtist,
            album: albumName,
            duration: durationSec,
            url: `https://open.spotify.com/track/${trackId}`,
            thumbnail: albumArt,
            source: 'spotify',
            sourceId: uid
        };
    });

    return { success: true, songs, playlistName: albumName };
}

async function fetchSpotifyTrack(trackId) {
    const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;

    const html = await fetchSpotifyPage(embedUrl);

    const scriptMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s);
    if (!scriptMatch) {
        throw new Error('Could not parse Spotify track');
    }

    const jsonData = JSON.parse(scriptMatch[1]);
    const entity = jsonData?.props?.pageProps?.state?.data?.entity;

    if (!entity) {
        throw new Error('Could not find track data');
    }

    let title = entity.name || entity.title || 'Unknown Title';
    let artists = [];

    if (entity.artists && Array.isArray(entity.artists)) {
        artists = entity.artists.map(a => a.name).filter(Boolean);
    } else if (entity.subtitle) {
        artists = [entity.subtitle];
    }

    let albumName = null;
    let albumArt = null;

    if (entity.album) {
        albumName = entity.album.name || entity.album;
        if (entity.album.coverArt?.sources?.[0]?.url) {
            albumArt = entity.album.coverArt.sources[0].url;
        }
    }

    if (!albumArt && entity.coverArt?.sources?.[0]?.url) {
        albumArt = entity.coverArt.sources[0].url;
    }

    const durationMs = entity.duration_ms || entity.duration || entity.durationMs || 0;
    const durationSec = durationMs > 1000 ? Math.round(durationMs / 1000) : durationMs;

    const song = {
        id: trackId,
        title: title,
        artist: artists.length > 0 ? artists.join(', ') : 'Unknown Artist',
        album: albumName,
        duration: durationSec,
        url: `https://open.spotify.com/track/${trackId}`,
        thumbnail: albumArt,
        source: 'spotify',
        sourceId: `spotify:track:${trackId}`
    };

    return { success: true, songs: [song] };
}

function parseId3Tags(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);
        const result = {
            title: path.basename(filePath, path.extname(filePath)),
            artist: 'Unknown Artist',
            album: null,
            duration: 0,
            albumArt: null
        };

        if (buffer.slice(0, 3).toString() === 'ID3') {
            const size = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
            let pos = 10;
            const end = Math.min(pos + size, buffer.length);

            while (pos < end - 10) {
                const frameId = buffer.slice(pos, pos + 4).toString();
                const frameSize = (buffer[pos + 4] << 24) | (buffer[pos + 5] << 16) | (buffer[pos + 6] << 8) | buffer[pos + 7];

                if (frameSize <= 0 || pos + 10 + frameSize > end) break;

                const frameData = buffer.slice(pos + 10, pos + 10 + frameSize);

                if (frameId === 'TIT2') {
                    result.title = frameData.slice(1).toString('utf8').replace(/\0/g, '').trim() || result.title;
                } else if (frameId === 'TPE1') {
                    result.artist = frameData.slice(1).toString('utf8').replace(/\0/g, '').trim() || result.artist;
                } else if (frameId === 'TALB') {
                    result.album = frameData.slice(1).toString('utf8').replace(/\0/g, '').trim();
                } else if (frameId === 'APIC') {
                    let imgPos = 1;
                    while (imgPos < frameData.length && frameData[imgPos] !== 0) imgPos++;
                    imgPos++;
                    imgPos++;
                    while (imgPos < frameData.length && frameData[imgPos] !== 0) imgPos++;
                    imgPos++;
                    if (imgPos < frameData.length) {
                        result.albumArt = frameData.slice(imgPos);
                    }
                }

                pos += 10 + frameSize;
            }
        }

        return result;
    } catch (error) {
        return {
            title: path.basename(filePath, path.extname(filePath)),
            artist: 'Unknown Artist',
            album: null,
            duration: 0,
            albumArt: null
        };
    }
}

async function processLocalMp3Files(filePaths) {
    const songs = [];

    for (const filePath of filePaths) {
        if (!fs.existsSync(filePath)) continue;
        if (!filePath.toLowerCase().endsWith('.mp3')) continue;

        const tags = parseId3Tags(filePath);
        const duration = await getAudioDuration(filePath);

        songs.push({
            id: path.basename(filePath),
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            duration: duration,
            localPath: filePath,
            thumbnail: null,
            albumArt: tags.albumArt,
            source: 'local',
            sourceId: filePath
        });
    }

    return { success: true, songs };
}

function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').substring(0, 100);
}

async function downloadSong(song, outputPath, mainWindow, songIndex, totalSongs) {
    const source = song.source || 'youtube';

    if (source === 'local') {
        fs.copyFileSync(song.localPath, outputPath + '.mp3');
        return { matchedFrom: null, matchedId: null };
    }

    if (source === 'spotify') {
        return await downloadSpotifySong(song, outputPath, mainWindow, songIndex, totalSongs);
    }

    return await downloadYouTubeSong(song.url, outputPath, mainWindow, songIndex, totalSongs);
}

async function downloadYouTubeSong(songUrl, outputPath, mainWindow, songIndex, totalSongs) {
    const args = [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--write-thumbnail',
        '--convert-thumbnails', 'png',
        '-o', outputPath,
        '--no-playlist',
        songUrl
    ];

    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP_PATH, args, { windowsHide: true });
        activeProcess = proc;

        proc.stdout.on('data', (data) => {
            const line = data.toString();
            const match = line.match(/(\d+\.?\d*)%/);
            if (match) {
                const progress = parseFloat(match[1]);
                mainWindow.webContents.send('playlist-creation-progress', {
                    stage: 'downloading',
                    songIndex,
                    totalSongs,
                    progress
                });
            }
        });

        proc.stderr.on('data', (data) => {
            const line = data.toString();
            const match = line.match(/(\d+\.?\d*)%/);
            if (match) {
                const progress = parseFloat(match[1]);
                mainWindow.webContents.send('playlist-creation-progress', {
                    stage: 'downloading',
                    songIndex,
                    totalSongs,
                    progress
                });
            }
        });

        proc.on('close', (code) => {
            activeProcess = null;
            if (code === 0) {
                const videoId = songUrl.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1] || null;
                resolve({ matchedFrom: 'youtube', matchedId: videoId });
            } else {
                reject(new Error(`Download failed with code ${code}`));
            }
        });

        proc.on('error', reject);
    });
}

async function downloadSpotifySong(song, outputPath, mainWindow, songIndex, totalSongs) {
    const searchQuery = `${song.artist} - ${song.title}`;
    const searchUrl = `ytsearch1:${searchQuery}`;

    const args = [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--write-thumbnail',
        '--convert-thumbnails', 'png',
        '-o', outputPath,
        '--no-playlist',
        '--default-search', 'ytsearch',
        searchUrl
    ];

    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP_PATH, args, { windowsHide: true });
        activeProcess = proc;
        let matchedYoutubeId = null;
        let allOutput = '';

        proc.stdout.on('data', (data) => {
            const line = data.toString();
            allOutput += line;
            const match = line.match(/(\d+\.?\d*)%/);
            if (match) {
                const progress = parseFloat(match[1]);
                mainWindow.webContents.send('playlist-creation-progress', {
                    stage: 'downloading',
                    songIndex,
                    totalSongs,
                    progress
                });
            }
        });

        proc.stderr.on('data', (data) => {
            const line = data.toString();
            allOutput += line;
            const match = line.match(/(\d+\.?\d*)%/);
            if (match) {
                const progress = parseFloat(match[1]);
                mainWindow.webContents.send('playlist-creation-progress', {
                    stage: 'downloading',
                    songIndex,
                    totalSongs,
                    progress
                });
            }
        });

        proc.on('close', (code) => {
            activeProcess = null;
            if (code === 0) {
                const ytMatch = allOutput.match(/\[youtube\]\s*([a-zA-Z0-9_-]{11})/);
                if (ytMatch) {
                    matchedYoutubeId = ytMatch[1];
                }
                resolve({ matchedFrom: 'youtube', matchedId: matchedYoutubeId });
            } else {
                reject(new Error(`Download failed for "${song.title}"`));
            }
        });

        proc.on('error', reject);
    });
}

async function createBassTrack(inputPath, outputPath) {
    const args = [
        '-i', inputPath,
        '-af', 'lowpass=f=250,volume=1.5',
        '-y',
        outputPath
    ];

    await runCommand(FFMPEG_PATH, args);
}

async function generateBeatData(inputPath) {
    const args = [
        '-i', inputPath,
        '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
        '-f', 'null',
        '-'
    ];

    try {
        const output = await runCommand(FFMPEG_PATH, args);
        const values = [];
        const lines = output.split('\n');

        for (const line of lines) {
            const match = line.match(/lavfi\.astats\.Overall\.RMS_level=(-?\d+\.?\d*)/);
            if (match) {
                const db = parseFloat(match[1]);
                const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
                values.push(parseFloat(normalized.toFixed(2)));
            }
        }

        const duration = await getAudioDuration(inputPath);
        const interval = values.length > 0 ? (duration * 1000) / values.length : 42.39;

        return { interval, values };
    } catch (error) {
        return { interval: 42.39, values: [] };
    }
}

async function getAudioDuration(inputPath) {
    const args = [
        '-i', inputPath,
        '-show_entries', 'format=duration',
        '-v', 'quiet',
        '-of', 'csv=p=0'
    ];

    const ffprobePath = path.join(BIN_DIR, 'ffprobe.exe');
    if (fs.existsSync(ffprobePath)) {
        try {
            const output = await runCommand(ffprobePath, args);
            return parseFloat(output.trim()) || 0;
        } catch {
            return 0;
        }
    }

    try {
        const output = await runCommand(FFMPEG_PATH, ['-i', inputPath, '-f', 'null', '-']);
        const match = output.match(/Duration: (\d+):(\d+):(\d+\.?\d*)/);
        if (match) {
            return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
        }
    } catch {}

    return 0;
}

async function resizeThumbnail(inputPath, outputPath) {
    const args = [
        '-i', inputPath,
        '-vf', 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512',
        '-y',
        outputPath
    ];

    await runCommand(FFMPEG_PATH, args);
}

function generateLuaPlaylist(playlistName, songs) {
    const songsLua = songs.map(song => `    {
        title = "${song.title.replace(/"/g, '\\"')}",
        artist = "${song.artist.replace(/"/g, '\\"')}",
        songPath = "art/sound/music/${song.filename}",
        songBassPath = "art/sound/music/${song.filename}_bass",
        songDataPath = "art/sound/music/${song.filename}_data.json",
        albumArt = "local://local/vehicles/common/album_covers/${song.filename}_art.png",
        duration = ${Math.round(song.duration)}
    }`).join(',\n');

    return `-- Created with BeamFinds App
-- https://beamfinds.com

local playlistConfig = require("vehicles/common/lua/sdd_carplay_playlist_config")

local playlistName = "${playlistName.replace(/"/g, '\\"')}"
local playlistCover = "local://local/vehicles/common/album_covers/${sanitizeFilename(playlistName)}.png"

local newSongs = {
${songsLua}
}

local defaultPlaylist = playlistConfig.playlists.default
local currentSize = defaultPlaylist and defaultPlaylist.songs and #defaultPlaylist.songs or 0
print("${playlistName} playlist file loaded, current playlist size: " .. currentSize)
playlistConfig.mergePlaylist("${sanitizeFilename(playlistName)}", playlistName, playlistCover, newSongs)
local customPlaylist = playlistConfig.playlists.${sanitizeFilename(playlistName)}
local newSize = customPlaylist and customPlaylist.songs and #customPlaylist.songs or 0
print("After merging ${playlistName} playlist, size: " .. newSize)

return true
`;
}

async function createPlaylistMod(playlistName, songs, modsFolder, mainWindow, sourceUrl = null) {
    isCancelled = false;
    const tempWorkDir = path.join(TEMP_DIR, `playlist_${Date.now()}`);
    fs.mkdirSync(tempWorkDir, { recursive: true });

    const musicDir = path.join(tempWorkDir, 'art', 'sound', 'music');
    const coversDir = path.join(tempWorkDir, 'vehicles', 'common', 'album_covers');
    const luaDir = path.join(tempWorkDir, 'vehicles', 'common', 'lua', 'songs');

    fs.mkdirSync(musicDir, { recursive: true });
    fs.mkdirSync(coversDir, { recursive: true });
    fs.mkdirSync(luaDir, { recursive: true });

    const processedSongs = [];
    const songMetadata = [];
    let firstThumbnail = null;
    const playlistSource = songs[0]?.source || 'youtube';

    for (let i = 0; i < songs.length; i++) {
        if (isCancelled) {
            fs.rmSync(tempWorkDir, { recursive: true, force: true });
            return { success: false, error: 'Cancelled by user' };
        }

        const song = songs[i];
        const filename = sanitizeFilename(song.title);

        mainWindow.webContents.send('playlist-creation-progress', {
            stage: 'downloading',
            songIndex: i + 1,
            totalSongs: songs.length,
            songTitle: song.title,
            progress: 0
        });

        try {
            const mp3Output = path.join(musicDir, filename);
            const downloadResult = await downloadSong(song, mp3Output, mainWindow, i + 1, songs.length);

            const mp3File = path.join(musicDir, `${filename}.mp3`);
            if (!fs.existsSync(mp3File)) {
                const files = fs.readdirSync(musicDir).filter(f => f.startsWith(filename) && f.endsWith('.mp3') && !f.includes('_bass'));
                if (files.length > 0) {
                    fs.renameSync(path.join(musicDir, files[0]), mp3File);
                }
            }

            mainWindow.webContents.send('playlist-creation-progress', {
                stage: 'processing_bass',
                songIndex: i + 1,
                totalSongs: songs.length,
                songTitle: song.title
            });

            const bassFile = path.join(musicDir, `${filename}_bass.mp3`);
            await createBassTrack(mp3File, bassFile);

            mainWindow.webContents.send('playlist-creation-progress', {
                stage: 'generating_beat_data',
                songIndex: i + 1,
                totalSongs: songs.length,
                songTitle: song.title
            });

            const beatData = await generateBeatData(mp3File);
            const dataFile = path.join(musicDir, `${filename}_data.json`);
            fs.writeFileSync(dataFile, JSON.stringify(beatData));

            mainWindow.webContents.send('playlist-creation-progress', {
                stage: 'processing_thumbnail',
                songIndex: i + 1,
                totalSongs: songs.length,
                songTitle: song.title
            });

            let thumbPath = null;
            const coverOutput = path.join(coversDir, `${filename}_art.png`);

            if (song.albumArt && Buffer.isBuffer(song.albumArt)) {
                const tempThumb = path.join(musicDir, `${filename}_temp_art.png`);
                fs.writeFileSync(tempThumb, song.albumArt);
                await resizeThumbnail(tempThumb, coverOutput);
                fs.unlinkSync(tempThumb);
                if (!firstThumbnail) firstThumbnail = coverOutput;
            } else {
                const thumbFiles = fs.readdirSync(musicDir).filter(f => f.startsWith(filename) && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')));
                if (thumbFiles.length > 0) {
                    thumbPath = path.join(musicDir, thumbFiles[0]);
                }

                if (thumbPath && fs.existsSync(thumbPath)) {
                    await resizeThumbnail(thumbPath, coverOutput);
                    fs.unlinkSync(thumbPath);
                    if (!firstThumbnail) firstThumbnail = coverOutput;
                }
            }

            const duration = await getAudioDuration(mp3File);

            processedSongs.push({
                title: song.title,
                artist: song.artist,
                filename,
                duration
            });

            songMetadata.push({
                title: song.title,
                artist: song.artist,
                album: song.album || null,
                duration: Math.round(duration),
                filename,
                source: song.source || 'youtube',
                sourceId: song.sourceId || song.id || null,
                matchedFrom: downloadResult?.matchedFrom || null,
                matchedId: downloadResult?.matchedId || null,
                addedAt: new Date().toISOString()
            });

        } catch (error) {
            console.error(`Failed to process song ${song.title}:`, error);
            mainWindow.webContents.send('playlist-creation-progress', {
                stage: 'error',
                songIndex: i + 1,
                totalSongs: songs.length,
                songTitle: song.title,
                error: error.message
            });
        }
    }

    if (processedSongs.length === 0) {
        fs.rmSync(tempWorkDir, { recursive: true, force: true });
        return { success: false, error: 'No songs were processed successfully' };
    }

    mainWindow.webContents.send('playlist-creation-progress', {
        stage: 'finalizing',
        progress: 90
    });

    const playlistFilename = sanitizeFilename(playlistName);

    if (firstThumbnail && fs.existsSync(firstThumbnail)) {
        const playlistCover = path.join(coversDir, `${playlistFilename}.png`);
        fs.copyFileSync(firstThumbnail, playlistCover);
    }

    const luaContent = generateLuaPlaylist(playlistName, processedSongs);
    fs.writeFileSync(path.join(luaDir, `${playlistFilename}.lua`), luaContent);

    const totalDuration = songMetadata.reduce((sum, s) => sum + (s.duration || 0), 0);
    const beamfindsJson = {
        name: playlistName,
        source: playlistSource,
        sourceUrl: sourceUrl || null,
        createdAt: new Date().toISOString(),
        createdWith: 'BeamFinds App',
        version: '1.0',
        songs: songMetadata,
        totalDuration,
        coverSource: firstThumbnail ? 'first_track' : null
    };
    fs.writeFileSync(path.join(tempWorkDir, 'beamfinds.json'), JSON.stringify(beamfindsJson, null, 2));

    mainWindow.webContents.send('playlist-creation-progress', {
        stage: 'creating_zip',
        progress: 95
    });

    const zipFilename = `${playlistFilename}.zip`;
    const zipPath = path.join(modsFolder, zipFilename);

    const zip = new AdmZip();
    addDirectoryToZip(zip, tempWorkDir, '');
    zip.writeZip(zipPath);

    fs.rmSync(tempWorkDir, { recursive: true, force: true });

    await updatePlaylistsJson(modsFolder, {
        name: playlistName,
        filename: zipFilename,
        songs: processedSongs.length,
        source: playlistSource,
        createdAt: new Date().toISOString(),
        cover: firstThumbnail ? `${playlistFilename}.png` : null
    });

    mainWindow.webContents.send('playlist-creation-progress', {
        stage: 'complete',
        progress: 100
    });

    const Store = require('electron-store');
    const authStore = new Store();
    const token = authStore.get('authToken');
    if (token) {
        const { trackEvent } = require('./analytics');
        trackEvent('playlist_create', { mod_count: processedSongs.length }, token);
    }

    return { success: true, filename: zipFilename, songsProcessed: processedSongs.length };
}

function addDirectoryToZip(zip, dirPath, zipPath) {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const itemZipPath = zipPath ? `${zipPath}/${item}` : item;

        if (fs.statSync(fullPath).isDirectory()) {
            addDirectoryToZip(zip, fullPath, itemZipPath);
        } else {
            zip.addLocalFile(fullPath, zipPath || undefined);
        }
    }
}

async function updatePlaylistsJson(modsFolder, playlistInfo) {
    const jsonPath = path.join(modsFolder, 'beamfinds_playlists.json');
    let data = { playlists: [] };

    if (fs.existsSync(jsonPath)) {
        try {
            data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        } catch {}
    }

    data.playlists = data.playlists.filter(p => p.filename !== playlistInfo.filename);
    data.playlists.push(playlistInfo);

    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
}

async function getCreatedPlaylists(modsFolder) {
    const jsonPath = path.join(modsFolder, 'beamfinds_playlists.json');

    if (!fs.existsSync(jsonPath)) {
        return { playlists: [] };
    }

    try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const validPlaylists = data.playlists.filter(p => {
            const zipPath = path.join(modsFolder, p.filename);
            return fs.existsSync(zipPath);
        });

        if (validPlaylists.length !== data.playlists.length) {
            data.playlists = validPlaylists;
            fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
        }

        return data;
    } catch {
        return { playlists: [] };
    }
}

async function deletePlaylist(modsFolder, filename) {
    const zipPath = path.join(modsFolder, filename);

    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
    }

    const jsonPath = path.join(modsFolder, 'beamfinds_playlists.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            data.playlists = data.playlists.filter(p => p.filename !== filename);
            fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
        } catch {}
    }

    return { success: true };
}

async function getPlaylistSongs(modsFolder, filename) {
    const zipPath = path.join(modsFolder, filename);

    if (!fs.existsSync(zipPath)) {
        return { success: false, error: 'Playlist file not found' };
    }

    try {
        const zip = new AdmZip(zipPath);
        const beamfindsEntry = zip.getEntry('beamfinds.json');

        if (!beamfindsEntry) {
            return { success: false, error: 'Invalid playlist file - missing metadata' };
        }

        const metadata = JSON.parse(beamfindsEntry.getData().toString('utf-8'));

        return {
            success: true,
            name: metadata.name,
            source: metadata.source,
            sourceUrl: metadata.sourceUrl,
            createdAt: metadata.createdAt,
            songs: metadata.songs || [],
            totalDuration: metadata.totalDuration || 0
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function updatePlaylist(playlistName, originalFilename, songs, modsFolder, mainWindow) {
    isCancelled = false;
    const tempWorkDir = path.join(TEMP_DIR, `playlist_update_${Date.now()}`);
    fs.mkdirSync(tempWorkDir, { recursive: true });

    const musicDir = path.join(tempWorkDir, 'art', 'sound', 'music');
    const coversDir = path.join(tempWorkDir, 'vehicles', 'common', 'album_covers');
    const luaDir = path.join(tempWorkDir, 'vehicles', 'common', 'lua', 'songs');

    fs.mkdirSync(musicDir, { recursive: true });
    fs.mkdirSync(coversDir, { recursive: true });
    fs.mkdirSync(luaDir, { recursive: true });

    const originalZipPath = path.join(modsFolder, originalFilename);
    let originalZip = null;

    if (fs.existsSync(originalZipPath)) {
        originalZip = new AdmZip(originalZipPath);
    }

    const processedSongs = [];
    const songMetadata = [];
    let firstThumbnail = null;
    const playlistSource = songs.length > 0 ? (songs.some(s => !s.isExisting) ? 'mixed' : songs[0]?.source || 'mixed') : 'mixed';

    const existingSongs = songs.filter(s => s.isExisting);
    const newSongs = songs.filter(s => !s.isExisting);
    const totalSteps = existingSongs.length + newSongs.length;
    let currentStep = 0;

    for (const song of existingSongs) {
        if (isCancelled) {
            fs.rmSync(tempWorkDir, { recursive: true, force: true });
            return { success: false, error: 'Cancelled by user' };
        }

        currentStep++;
        mainWindow.webContents.send('playlist-creation-progress', {
            stage: 'copying',
            songIndex: currentStep,
            totalSongs: totalSteps,
            songTitle: song.title,
            progress: 50
        });

        try {
            const filename = song.filename;

            if (originalZip) {
                const mp3Entry = originalZip.getEntry(`art/sound/music/${filename}.mp3`);
                const bassEntry = originalZip.getEntry(`art/sound/music/${filename}_bass.mp3`);
                const dataEntry = originalZip.getEntry(`art/sound/music/${filename}_data.json`);
                const coverEntry = originalZip.getEntry(`vehicles/common/album_covers/${filename}_art.png`);

                if (mp3Entry) {
                    fs.writeFileSync(path.join(musicDir, `${filename}.mp3`), mp3Entry.getData());
                }
                if (bassEntry) {
                    fs.writeFileSync(path.join(musicDir, `${filename}_bass.mp3`), bassEntry.getData());
                }
                if (dataEntry) {
                    fs.writeFileSync(path.join(musicDir, `${filename}_data.json`), dataEntry.getData());
                }
                if (coverEntry) {
                    const coverPath = path.join(coversDir, `${filename}_art.png`);
                    fs.writeFileSync(coverPath, coverEntry.getData());
                    if (!firstThumbnail) firstThumbnail = coverPath;
                }
            }

            processedSongs.push({
                title: song.title,
                artist: song.artist,
                filename,
                duration: song.duration || 0
            });

            songMetadata.push({
                title: song.title,
                artist: song.artist,
                album: song.album || null,
                duration: song.duration || 0,
                filename,
                source: song.source || 'unknown',
                sourceId: song.sourceId || null,
                matchedFrom: song.matchedFrom || null,
                matchedId: song.matchedId || null,
                addedAt: song.addedAt || new Date().toISOString()
            });

        } catch (error) {
            console.error(`Failed to copy song ${song.title}:`, error);
        }
    }

    for (let i = 0; i < newSongs.length; i++) {
        if (isCancelled) {
            fs.rmSync(tempWorkDir, { recursive: true, force: true });
            return { success: false, error: 'Cancelled by user' };
        }

        const song = newSongs[i];
        currentStep++;
        const filename = sanitizeFilename(song.title);

        mainWindow.webContents.send('playlist-creation-progress', {
            stage: 'downloading',
            songIndex: currentStep,
            totalSongs: totalSteps,
            songTitle: song.title,
            progress: 0
        });

        try {
            const mp3Output = path.join(musicDir, filename);
            const downloadResult = await downloadSong(song, mp3Output, mainWindow, currentStep, totalSteps);

            const mp3File = path.join(musicDir, `${filename}.mp3`);
            if (!fs.existsSync(mp3File)) {
                const files = fs.readdirSync(musicDir).filter(f => f.startsWith(filename) && f.endsWith('.mp3') && !f.includes('_bass'));
                if (files.length > 0) {
                    fs.renameSync(path.join(musicDir, files[0]), mp3File);
                }
            }

            mainWindow.webContents.send('playlist-creation-progress', {
                stage: 'processing_bass',
                songIndex: currentStep,
                totalSongs: totalSteps,
                songTitle: song.title
            });

            const bassFile = path.join(musicDir, `${filename}_bass.mp3`);
            await createBassTrack(mp3File, bassFile);

            mainWindow.webContents.send('playlist-creation-progress', {
                stage: 'generating_beat_data',
                songIndex: currentStep,
                totalSongs: totalSteps,
                songTitle: song.title
            });

            const beatData = await generateBeatData(mp3File);
            const dataFile = path.join(musicDir, `${filename}_data.json`);
            fs.writeFileSync(dataFile, JSON.stringify(beatData));

            mainWindow.webContents.send('playlist-creation-progress', {
                stage: 'processing_thumbnail',
                songIndex: currentStep,
                totalSongs: totalSteps,
                songTitle: song.title
            });

            const coverOutput = path.join(coversDir, `${filename}_art.png`);

            if (song.albumArt && Buffer.isBuffer(song.albumArt)) {
                const tempThumb = path.join(musicDir, `${filename}_temp_art.png`);
                fs.writeFileSync(tempThumb, song.albumArt);
                await resizeThumbnail(tempThumb, coverOutput);
                fs.unlinkSync(tempThumb);
                if (!firstThumbnail) firstThumbnail = coverOutput;
            } else {
                const thumbFiles = fs.readdirSync(musicDir).filter(f => f.startsWith(filename) && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')));
                if (thumbFiles.length > 0) {
                    const thumbPath = path.join(musicDir, thumbFiles[0]);
                    await resizeThumbnail(thumbPath, coverOutput);
                    fs.unlinkSync(thumbPath);
                    if (!firstThumbnail) firstThumbnail = coverOutput;
                }
            }

            const duration = await getAudioDuration(mp3File);

            processedSongs.push({
                title: song.title,
                artist: song.artist,
                filename,
                duration
            });

            songMetadata.push({
                title: song.title,
                artist: song.artist,
                album: song.album || null,
                duration: Math.round(duration),
                filename,
                source: song.source || 'youtube',
                sourceId: song.sourceId || song.id || null,
                matchedFrom: downloadResult?.matchedFrom || null,
                matchedId: downloadResult?.matchedId || null,
                addedAt: new Date().toISOString()
            });

        } catch (error) {
            console.error(`Failed to process song ${song.title}:`, error);
            mainWindow.webContents.send('playlist-creation-progress', {
                stage: 'error',
                songIndex: currentStep,
                totalSongs: totalSteps,
                songTitle: song.title,
                error: error.message
            });
        }
    }

    if (processedSongs.length === 0) {
        fs.rmSync(tempWorkDir, { recursive: true, force: true });
        return { success: false, error: 'No songs were processed successfully' };
    }

    mainWindow.webContents.send('playlist-creation-progress', {
        stage: 'finalizing',
        progress: 90
    });

    const playlistFilename = sanitizeFilename(playlistName);

    if (firstThumbnail && fs.existsSync(firstThumbnail)) {
        const playlistCover = path.join(coversDir, `${playlistFilename}.png`);
        fs.copyFileSync(firstThumbnail, playlistCover);
    }

    const luaContent = generateLuaPlaylist(playlistName, processedSongs);
    fs.writeFileSync(path.join(luaDir, `${playlistFilename}.lua`), luaContent);

    const totalDuration = songMetadata.reduce((sum, s) => sum + (s.duration || 0), 0);
    const beamfindsJson = {
        name: playlistName,
        source: playlistSource,
        sourceUrl: null,
        createdAt: new Date().toISOString(),
        createdWith: 'BeamFinds App',
        version: '1.0',
        songs: songMetadata,
        totalDuration,
        coverSource: firstThumbnail ? 'first_track' : null
    };
    fs.writeFileSync(path.join(tempWorkDir, 'beamfinds.json'), JSON.stringify(beamfindsJson, null, 2));

    mainWindow.webContents.send('playlist-creation-progress', {
        stage: 'creating_zip',
        progress: 95
    });

    const newZipFilename = `${playlistFilename}.zip`;
    const newZipPath = path.join(modsFolder, newZipFilename);

    if (originalFilename !== newZipFilename && fs.existsSync(originalZipPath)) {
        fs.unlinkSync(originalZipPath);
    }

    if (fs.existsSync(newZipPath)) {
        fs.unlinkSync(newZipPath);
    }

    const zip = new AdmZip();
    addDirectoryToZip(zip, tempWorkDir, '');
    zip.writeZip(newZipPath);

    fs.rmSync(tempWorkDir, { recursive: true, force: true });

    const jsonPath = path.join(modsFolder, 'beamfinds_playlists.json');
    let playlistsData = { playlists: [] };

    if (fs.existsSync(jsonPath)) {
        try {
            playlistsData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        } catch {}
    }

    playlistsData.playlists = playlistsData.playlists.filter(p => p.filename !== originalFilename && p.filename !== newZipFilename);
    playlistsData.playlists.push({
        name: playlistName,
        filename: newZipFilename,
        songs: processedSongs.length,
        source: playlistSource,
        createdAt: new Date().toISOString(),
        cover: firstThumbnail ? `${playlistFilename}.png` : null
    });

    fs.writeFileSync(jsonPath, JSON.stringify(playlistsData, null, 2));

    mainWindow.webContents.send('playlist-creation-progress', {
        stage: 'complete',
        progress: 100
    });

    return { success: true, filename: newZipFilename, songsProcessed: processedSongs.length };
}

function cancelCreation() {
    isCancelled = true;
    if (activeProcess) {
        activeProcess.kill();
        activeProcess = null;
    }
    return { success: true };
}

function registerPlaylistHandlers(mainWindow, store) {
    if (process.platform !== 'win32') return;

    ipcMain.handle('playlist-check-dependencies', (event, source) => {
        return checkDependencies(source);
    });

    ipcMain.handle('playlist-install-dependency', async (event, dependency) => {
        if (dependency === 'ffmpeg') {
            return await installFFmpeg(mainWindow);
        } else if (dependency === 'yt-dlp') {
            return await installYtDlp(mainWindow);
        } else if (dependency === 'spotdl') {
            return await installSpotdl(mainWindow);
        }
        return { success: false, error: 'Unknown dependency' };
    });

    ipcMain.handle('playlist-fetch-info', async (event, url, source) => {
        return await fetchPlaylistInfo(url, source);
    });

    ipcMain.handle('playlist-process-local-files', async (event, filePaths) => {
        return await processLocalMp3Files(filePaths);
    });

    ipcMain.handle('playlist-create-mod', async (event, playlistName, songs, sourceUrl) => {
        const modsFolder = store.get('modsFolder');
        if (!modsFolder) {
            return { success: false, error: 'Mods folder not configured' };
        }
        return await createPlaylistMod(playlistName, songs, modsFolder, mainWindow, sourceUrl);
    });

    ipcMain.handle('playlist-get-created', async () => {
        const modsFolder = store.get('modsFolder');
        if (!modsFolder) {
            return { playlists: [] };
        }
        return await getCreatedPlaylists(modsFolder);
    });

    ipcMain.handle('playlist-delete', async (event, filename) => {
        const modsFolder = store.get('modsFolder');
        if (!modsFolder) {
            return { success: false, error: 'Mods folder not configured' };
        }
        return await deletePlaylist(modsFolder, filename);
    });

    ipcMain.handle('playlist-get-songs', async (event, filename) => {
        const modsFolder = store.get('modsFolder');
        if (!modsFolder) {
            return { success: false, error: 'Mods folder not configured' };
        }
        return await getPlaylistSongs(modsFolder, filename);
    });

    ipcMain.handle('playlist-update', async (event, playlistName, originalFilename, songs) => {
        const modsFolder = store.get('modsFolder');
        if (!modsFolder) {
            return { success: false, error: 'Mods folder not configured' };
        }
        return await updatePlaylist(playlistName, originalFilename, songs, modsFolder, mainWindow);
    });

    ipcMain.handle('playlist-cancel-creation', () => {
        return cancelCreation();
    });

    ipcMain.handle('playlist-open-dependency-url', (event, dependency) => {
        if (dependency === 'ffmpeg') {
            shell.openExternal('https://ffmpeg.org/download.html');
        } else if (dependency === 'yt-dlp') {
            shell.openExternal('https://github.com/yt-dlp/yt-dlp/releases');
        } else if (dependency === 'spotdl') {
            shell.openExternal('https://github.com/spotDL/spotify-downloader/releases');
        }
    });
}

module.exports = { registerPlaylistHandlers };