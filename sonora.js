// Sonora usa una simulación: el temporizador no reproduce archivos de audio.
const dataElement = document.getElementById('sonora-data');
let rawData = {};
try { rawData = JSON.parse(dataElement?.textContent || '{}'); } catch (_) { /* datos opcionales */ }
const tracks = Array.isArray(rawData.tracks)
    ? rawData.tracks.filter((track) => track && track.id != null && Number(track.duration) > 0)
        .map((track) => ({ ...track, id: String(track.id), duration: Number(track.duration) }))
    : [];
const storageKey = 'sonora-player-v1';
const readStorage = (key) => { try { return localStorage.getItem(key); } catch (_) { return null; } };
const writeStorage = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* almacenamiento no disponible */ } };
let saved = {};
try { saved = JSON.parse(readStorage(storageKey) || '{}') || {}; } catch (_) { /* usar valores iniciales */ }
const globalQueue = tracks.map((track) => track.id);
const savedQueue = Array.isArray(saved.queue)
    ? saved.queue.map(String).filter((id) => globalQueue.includes(id))
    : [];
let queue = savedQueue.length ? savedQueue : [...globalQueue];
let index = Math.max(0, tracks.findIndex((track) => track.id === String(saved.id)));
if (tracks[index] && !queue.includes(tracks[index].id)) queue = [...globalQueue];
let elapsed = Math.max(0, Math.min(Number(saved.elapsed) || 0, tracks[index]?.duration || 0));
let playing = Boolean(saved.playing && tracks.length);
let shuffle = Boolean(saved.shuffle);
let lastTick = Date.now();

const all = (selector) => document.querySelectorAll(selector);
const formatTime = (seconds) => {
    const time = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;
};
const persist = () => writeStorage(storageKey, JSON.stringify({
    id: tracks[index]?.id, elapsed, playing, shuffle, queue,
}));
const chooseNext = (direction = 1) => {
    if (!queue.length) return;
    let position = Math.max(0, queue.indexOf(tracks[index]?.id));
    if (shuffle && queue.length > 1 && direction > 0) {
        position = (position + 1 + Math.floor(Math.random() * (queue.length - 1))) % queue.length;
    } else {
        position = (position + direction + queue.length) % queue.length;
    }
    index = tracks.findIndex((track) => track.id === queue[position]);
    elapsed = 0;
};
const update = () => {
    const track = tracks[index];
    if (!track) return;
    all('#player-title, [data-now-title]').forEach((el) => { el.textContent = track.title || ''; });
    all('#player-artist, [data-now-artist]').forEach((el) => { el.textContent = track.artist || ''; });
    all('#player-current, [data-now-current]').forEach((el) => { el.textContent = formatTime(elapsed); });
    all('#player-duration, [data-now-duration]').forEach((el) => { el.textContent = formatTime(track.duration); });
    all('#player-progress, [data-now-progress]').forEach((el) => {
        el.max = String(track.duration);
        el.value = String(Math.min(elapsed, track.duration));
        el.setAttribute('aria-valuetext', `${formatTime(elapsed)} de ${formatTime(track.duration)}`);
        el.style.setProperty('--progress', `${Math.min(100, elapsed / track.duration * 100)}%`);
    });
    all('#player-toggle, [data-player-action="toggle"]').forEach((button) => {
        button.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
        button.setAttribute('aria-pressed', String(playing));
        button.querySelectorAll('[data-icon-play]').forEach((icon) => { icon.hidden = playing; });
        button.querySelectorAll('[data-icon-pause]').forEach((icon) => { icon.hidden = !playing; });
    });
    all('#player-shuffle, [data-player-action="shuffle"]').forEach((button) => {
        button.setAttribute('aria-pressed', String(shuffle));
        button.setAttribute('aria-label', shuffle ? 'Desactivar reproducción aleatoria' : 'Activar reproducción aleatoria');
    });
    all('[data-play-track]').forEach((button) => {
        const current = button.dataset.playTrack === track.id;
        button.toggleAttribute('data-current', current);
        if (current) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
        const buttonTrack = tracks.find((item) => item.id === button.dataset.playTrack);
        if (buttonTrack) button.setAttribute('aria-label', `${current && playing ? 'Pausar' : 'Reproducir'} ${buttonTrack.title}`);
    });
};
const setPlaying = (value) => {
    playing = Boolean(value && tracks.length);
    lastTick = Date.now();
    update();
    persist();
};
const advance = (direction) => {
    chooseNext(direction);
    lastTick = Date.now();
    update();
    persist();
};

document.addEventListener('click', (event) => {
    const playlistButton = event.target.closest('[data-play-playlist]');
    if (playlistButton) {
        const playlist = Array.isArray(rawData.playlists)
            ? rawData.playlists.find((item) => String(item.id) === playlistButton.dataset.playPlaylist)
            : null;
        const selectedQueue = Array.isArray(playlist?.tracks)
            ? playlist.tracks.map(String).filter((id) => globalQueue.includes(id))
            : [];
        if (!selectedQueue.length) return;
        queue = selectedQueue;
        index = tracks.findIndex((track) => track.id === queue[0]);
        elapsed = 0;
        setPlaying(true);
        return;
    }
    const trackButton = event.target.closest('[data-play-track]');
    if (trackButton) {
        const selected = tracks.findIndex((track) => track.id === trackButton.dataset.playTrack);
        if (selected < 0) return;
        queue = [...globalQueue];
        if (selected === index) setPlaying(!playing);
        else { index = selected; elapsed = 0; setPlaying(true); }
        return;
    }
    const button = event.target.closest('#player-toggle, #player-prev, #player-next, #player-shuffle, [data-player-action]');
    if (!button) return;
    const action = button.dataset.playerAction || button.id.replace('player-', '');
    if (action === 'toggle') setPlaying(!playing);
    else if (action === 'prev') advance(-1);
    else if (action === 'next') advance(1);
    else if (action === 'shuffle') { shuffle = !shuffle; update(); persist(); }
});

document.addEventListener('input', (event) => {
    if (!event.target.matches('#player-progress, [data-now-progress]') || !tracks.length) return;
    elapsed = Math.max(0, Math.min(Number(event.target.value) || 0, tracks[index].duration));
    lastTick = Date.now();
    update();
    persist();
});

setInterval(() => {
    const now = Date.now();
    if (playing && tracks.length) {
        elapsed += (now - lastTick) / 1000;
        let guard = 0;
        while (elapsed >= tracks[index].duration && guard < tracks.length * 2) {
            const remainder = elapsed - tracks[index].duration;
            chooseNext(1);
            elapsed = remainder;
            guard++;
        }
        if (guard >= tracks.length * 2) elapsed = 0;
        update();
        persist();
    }
    lastTick = now;
}, 1000);

const root = document.documentElement;
const savedTheme = readStorage('sonora-theme');
if (savedTheme === 'light' || savedTheme === 'dark') root.dataset.theme = savedTheme;
const themeButton = document.getElementById('theme-toggle');
const updateTheme = () => {
    if (!themeButton) return;
    const dark = root.dataset.theme !== 'light';
    themeButton.setAttribute('aria-label', dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    themeButton.setAttribute('aria-pressed', String(!dark));
};
themeButton?.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    writeStorage('sonora-theme', root.dataset.theme);
    updateTheme();
});
updateTheme();
update();
