// ============ AUDIO & GLOBAL STATE ============
const audio = document.getElementById('audioPlayer');
let songs = [];
let currentIndex = -1;
let isPlaying = false;

// ============ PROGRESS BAR CONTROL ============
const progressBar = document.getElementById('progressBar');
progressBar.addEventListener('input', () => {
  if (audio.duration) audio.currentTime = (progressBar.value / 100) * audio.duration;
});

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progressBar.value = pct;
  progressBar.style.setProperty('--progress', pct + '%');
  document.getElementById('currentTime').textContent = fmt(audio.currentTime);
});

audio.addEventListener('loadedmetadata', () => {
  document.getElementById('totalTime').textContent = fmt(audio.duration);
});

audio.addEventListener('ended', () => nextSong());
audio.addEventListener('play', () => {
  isPlaying = true;
  document.getElementById('playBtn').innerHTML = '&#9646;&#9646;';
});
audio.addEventListener('pause', () => {
  isPlaying = false;
  document.getElementById('playBtn').innerHTML = '&#9654;';
});

document.getElementById('volumeBar').addEventListener('input', e => {
  audio.volume = e.target.value;
});
audio.volume = 0.8;

// ============ UTILITY FUNCTIONS ============
function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ============ SEARCH FUNCTIONALITY ============
function searchGenre(term) {
  document.getElementById('searchInput').value = term;
  searchSongs();
}

// restore categories when input cleared
const searchInputEl = document.getElementById('searchInput');
if (searchInputEl) {
  searchInputEl.addEventListener('input', () => {
    if (!searchInputEl.value.trim()) {
      document.getElementById('songList').innerHTML = '';
      document.getElementById('resultsInfo').textContent = '';
      const cat = document.getElementById('categoryContainer');
      if (cat) cat.style.display = '';
    }
  });
}

// ==== DEFAULT CATEGORIES ==== 
// we'll cache results so clicks work properly
const categoryData = {};

async function fetchSongsForTerm(term, limit = 10) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=${limit}&entity=song`);
    const data = await res.json();
    return data.results.filter(r => r.previewUrl);
  } catch (e) {
    console.warn('fetchSongsForTerm failed', e);
    return [];
  }
}

async function loadDefaultCategories() {
  const categories = ['Pop', 'Rock', 'Jazz', 'Hip-Hop'];
  const container = document.getElementById('categoryContainer');
  if (!container) return;
  container.style.display = '';
  container.innerHTML = `<div style="padding:20px 0;color:var(--sub);font-size:13px"><span class="spinner"></span>Loading categories...</div>`;
  for (const cat of categories) {
    const results = await fetchSongsForTerm(cat, 8);
    categoryData[cat] = results;
  }
  renderCategorySections();
}

function renderCategorySections() {
  const container = document.getElementById('categoryContainer');
  if (!container) return;
  container.innerHTML = '';
  const favorites = getFavorites();
  Object.keys(categoryData).forEach(cat => {
    const list = categoryData[cat] || [];
    if (!list.length) return;
    let html = `<div class="category-section"><h3>${cat}</h3><div class="category-list">`;
    html += list.map((s, i) => {
      const isFavorite = favorites.some(f => f.trackId === s.trackId);
      return `
        <div class="trending-card" onclick="playCategorySong('${cat}', ${i})">
          <img class="trending-card-cover" src="${s.artworkUrl100 || s.artworkUrl60 || ''}" alt="" style="background: linear-gradient(135deg, var(--muted) 0%, #1a2332 100%)">
          <div class="trending-card-title">${s.trackName}</div>
          <div class="trending-card-artist">${s.artistName}</div>
          <button class="trending-fav-btn ${isFavorite ? 'liked' : ''}" onclick="toggleFavoriteInCategory(event,'${cat}',${i})" title="Add to favorites">${isFavorite ? '❤️' : '🤍'}</button>
          <button class="trending-fav-btn" style="bottom:auto;top:8px;left:8px;" onclick="addToPlaylistFromCategory(event,'${cat}',${i})" title="Add to playlist">+</button>
        </div>
      `;
    }).join('');
    html += '</div></div>';
    container.innerHTML += html;
  });
}

// helper wrappers so category clicks use proper song list
function playCategorySong(cat, index) {
  if (!categoryData[cat] || !categoryData[cat].length) return;
  songs = categoryData[cat];
  playSong(index);
}

function toggleFavoriteInCategory(event, cat, index) {
  if (!categoryData[cat]) return;
  songs = categoryData[cat];
  toggleFavorite(event, index);
}

function addToPlaylistFromCategory(event, cat, index) {
  if (!categoryData[cat]) return;
  songs = categoryData[cat];
  addToPlaylistPrompt(event, index);
}

// ============ SEARCH FUNCTIONALITY ============
async function searchSongs() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return;
  // hide default categories when showing results
  const cat = document.getElementById('categoryContainer');
  if (cat) cat.style.display = 'none';

  const listEl = document.getElementById('songList');
  listEl.innerHTML = `<div style="padding:20px 0;color:var(--sub);font-size:13px"><span class="spinner"></span>Searching...</div>`;
  document.getElementById('resultsInfo').textContent = '';

  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=15&entity=song`);
    const data = await res.json();
    songs = data.results.filter(r => r.previewUrl);
    document.getElementById('resultsInfo').textContent = `${songs.length} results`;
    renderSongList();
  } catch (e) {
    listEl.innerHTML = `<div class="lyrics-error" style="padding:16px 0">Failed to fetch. Check your connection.</div>`;
  }
}

function renderSongList() {
  const listEl = document.getElementById('songList');
  if (!songs.length) {
    listEl.innerHTML = `<div class="empty-state"><div class="icon">😔</div><p>No results found</p></div>`;
    return;
  }
  const favorites = getFavorites();
  listEl.innerHTML = songs.map((s, i) => {
    const isFavorite = isSongFavorite(s);
    return `
      <div class="song-item ${i === currentIndex ? 'active' : ''}" onclick="playSong(${i})">
        <img class="song-thumb" src="${s.artworkUrl60 || ''}" alt="" onerror="this.style.background='var(--muted)'">
        <div class="song-meta">
          <div class="song-title">${s.trackName}</div>
          <div class="song-artist">${s.artistName}</div>
        </div>
        <button class="favorite-btn ${isFavorite ? 'liked' : ''}" onclick="toggleFavorite(event, ${i})" title="Add to favorites">${isFavorite ? '❤️' : '🤍'}</button>
        <div class="playing-dot"></div>
        <div class="song-num">${i + 1}</div>
      </div>
    `;
  }).join('');
}

// ============ SONG PLAYBACK ============
async function playSong(index) {
  currentIndex = index;
  const song = songs[index];

  // Update audio
  audio.src = song.previewUrl;
  audio.play();

  // show lyrics panel when a track is selected
  document.getElementById('lyricsPanel').classList.add('visible');

  // Update UI
  renderSongList();
  updatePlayerUI(song);

  // Fetch lyrics
  await fetchLyrics(song.artistName, song.trackName);
}

function updatePlayerUI(song) {
  const art = song.artworkUrl100 || song.artworkUrl60 || '';
  const coverLarge = document.getElementById('coverLarge');

  // Update cover image
  const largeArt = art.replace('100x100', '300x300');
  coverLarge.src = largeArt;
  coverLarge.onerror = function() {
    this.style.display = 'none';
  };
  coverLarge.onload = function() {
    this.style.display = 'block';
  };
  
  document.getElementById('playerName').textContent = song.trackName;
  document.getElementById('playerArtist').textContent = song.artistName;
  document.getElementById('playerName').textContent = song.trackName;
  document.getElementById('playerArtist').textContent = song.artistName;

  // Shift orb color based on song index
  const hues = ['#00ffa3', '#00cfff', '#ff6b9d', '#ffd060', '#a78bfa', '#fb923c'];
  const accent = hues[currentIndex % hues.length];
  document.documentElement.style.setProperty('--accent', accent);
}

async function fetchLyrics(artist, track) {
  const lyricsBox = document.getElementById('lyricsBox');
  lyricsBox.innerHTML = `<div class="lyrics-loading"><span class="spinner"></span>Loading lyrics…</div>`;

  try {
    // Clean track name (remove feat., parentheses, etc.)
    const cleanTrack = track.replace(/\(.*?\)/g, '').replace(/feat\..*$/i, '').trim();
    const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(cleanTrack)}`);
    const data = await res.json();

    if (data.lyrics) {
      lyricsBox.innerHTML = `<div class="lyrics-text">${data.lyrics.trim()}</div>`;
    } else {
      lyricsBox.innerHTML = `<div class="lyrics-error">Lyrics not found for this track.<br><br><span style="font-size:12px;color:var(--muted)">Note: iTunes previews are 30-second clips. Full lyrics are shown when available.</span></div>`;
    }
  } catch (e) {
    lyricsBox.innerHTML = `<div class="lyrics-error">Couldn't load lyrics. Try another song.</div>`;
  }
}

function togglePlay() {
  if (!audio.src) return;
  isPlaying ? audio.pause() : audio.play();
}

function nextSong() {
  if (!songs.length) return;
  playSong((currentIndex + 1) % songs.length);
}

function prevSong() {
  if (!songs.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  playSong((currentIndex - 1 + songs.length) % songs.length);
}

// ============ PLAYLIST & FAVORITES UTILITIES ============
// playlists stored as object { Favorites: [...], "My List": [...] }
function getPlaylists() {
  let p = localStorage.getItem('lyricWavePlaylists');
  if (!p) {
    // initialize with existing favorites if any
    const favs = localStorage.getItem('lyricWaveFavorites');
    const obj = { Favorites: favs ? JSON.parse(favs) : [] };
    localStorage.setItem('lyricWavePlaylists', JSON.stringify(obj));
    return obj;
  }
  return JSON.parse(p);
}

function savePlaylists(obj) {
  localStorage.setItem('lyricWavePlaylists', JSON.stringify(obj));
}

function getFavorites() {
  const p = getPlaylists();
  return p.Favorites || [];
}

function saveFavorite(song) {
  const p = getPlaylists();
  p.Favorites = p.Favorites || [];
  if (!p.Favorites.some(s => s.trackId === song.trackId)) {
    p.Favorites.push(song);
    savePlaylists(p);
  }
}

function removeFavorite(song) {
  const p = getPlaylists();
  p.Favorites = (p.Favorites || []).filter(s => s.trackId !== song.trackId);
  savePlaylists(p);
}

function isSongFavorite(song) {
  return getFavorites().some(s => s.trackId === song.trackId);
}

// playlist operations
function getPlaylistSongs(name) {
  const p = getPlaylists();
  return p[name] || [];
}

function addToPlaylist(name, song) {
  if (!name) return;
  const p = getPlaylists();
  p[name] = p[name] || [];
  if (!p[name].some(s => s.trackId === song.trackId)) {
    p[name].push(song);
    savePlaylists(p);
  }
}

function removeFromPlaylist(event, name, trackId) {
  event.stopPropagation();
  const p = getPlaylists();
  if (!p[name]) return;
  p[name] = p[name].filter(s => s.trackId.toString() !== trackId.toString());
  savePlaylists(p);
  if (name === currentPlaylist) renderLibrary();
}

let currentPlaylist = 'Favorites';

function loadPlaylist(name) {
  currentPlaylist = name;
  const hdr = document.getElementById('libraryHeader');
  if (hdr) hdr.textContent = name + (name === 'Favorites' ? ' ❤️' : '');
  renderLibrary();
  // highlight folder
  document.querySelectorAll('.folder-item').forEach(el => el.classList.toggle('active', el.textContent === name));
}

// ====== MODAL UTILITIES ======
// title: dialog header
// message: optional explanatory text (newline -> <br>)
// placeholder: input placeholder text
// defaultValue: initial input value
function showInputDialog(title, message = '', placeholder = '', defaultValue = '') {
  return new Promise(resolve => {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const okBtn = document.getElementById('modalOk');
    const cancelBtn = document.getElementById('modalCancel');

    titleEl.textContent = title;
    let html = '';
    if (message) {
      html += `<p>${message.replace(/\n/g, '<br>')}</p>`;
    }
    html += `<input type="text" id="modalInput" placeholder="${placeholder}" value="${defaultValue}" />`;
    body.innerHTML = html;
    const inputEl = document.getElementById('modalInput');

    overlay.classList.remove('hidden');
    inputEl.focus();

    function cleanup() {
      overlay.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    }
    function onOk() {
      const val = inputEl.value.trim();
      cleanup();
      resolve(val);
    }
    function onCancel() {
      cleanup();
      resolve(null);
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

function showMessage(msg) {
  return new Promise(resolve => {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const okBtn = document.getElementById('modalOk');
    const cancelBtn = document.getElementById('modalCancel');

    titleEl.textContent = '';
    body.innerHTML = `<p>${msg}</p>`;
    cancelBtn.style.display = 'none';
    okBtn.textContent = 'OK';

    overlay.classList.remove('hidden');

    function cleanup() {
      overlay.classList.add('hidden');
      okBtn.textContent = 'OK';
      cancelBtn.style.display = '';
      okBtn.removeEventListener('click', onOk);
    }
    function onOk() {
      cleanup();
      resolve();
    }
    okBtn.addEventListener('click', onOk);
  });
}

async function createPlaylist() {
  const name = await showInputDialog('New playlist', '', 'Playlist name');
  if (!name) return;
  const p = getPlaylists();
  if (!p[name]) {
    p[name] = [];
    savePlaylists(p);
    populateFolderList();
    loadPlaylist(name);
  } else {
    await showMessage('Playlist already exists');
  }
}

function populateFolderList() {
  const container = document.getElementById('folderList');
  if (!container) return;
  const p = getPlaylists();
  // clear existing items except header
  container.querySelectorAll('.folder-item').forEach(el => el.remove());
  Object.keys(p).forEach(n => {
    const div = document.createElement('div');
    div.className = 'folder-item' + (n === currentPlaylist ? ' active' : '');
    div.textContent = n;
    div.onclick = () => loadPlaylist(n);
    container.appendChild(div);
  });
}

// helper for adding from search/explore
async function addToPlaylistPrompt(event, index) {
  event.stopPropagation();
  const song = songs[index];
  const playlists = Object.keys(getPlaylists());
  const msg =
    'Add "' + song.trackName + '" to which playlist?\n' +
    '(existing: ' + playlists.join(', ') + ')';
  let name = await showInputDialog('Add to playlist', msg, 'Playlist name');
  if (!name) name = 'Favorites';
  addToPlaylist(name, song);
  populateFolderList();
  await showMessage(`Added "${song.trackName}" to ${name}`);
}

function toggleFavorite(event, index) {
  event.stopPropagation();
  const song = songs[index];
  if (isSongFavorite(song)) {
    removeFavorite(song);
  } else {
    saveFavorite(song);
  }
  renderSongList();
}

// ============ PAGE SWITCHING ============
function showPage(pageName) {
  // update navbar links
  document.querySelectorAll('.nav-link').forEach(a => a.classList.toggle('active', a.getAttribute('onclick').includes(pageName)));

  // Hide all pages
  document.getElementById('homePage').classList.remove('active');
  document.getElementById('explorePage').classList.remove('active');
  document.getElementById('libraryPage').classList.remove('active');

  // lyrics panel visibility now controlled by playback rather than page
  // (no action here)
  // Show selected page
  if (pageName === 'home') {
    document.getElementById('homePage').classList.add('active');
    loadDefaultCategories();
  } else if (pageName === 'explore') {
    document.getElementById('explorePage').classList.add('active');
    loadTrending();
  } else if (pageName === 'library') {
    document.getElementById('libraryPage').classList.add('active');
    renderLibrary();
  }
}

let trendingSongsCache = [];
let trendingRenderedCount = 0;
const TREND_CHUNK = 20;

async function loadTrending() {
  const container = document.getElementById('trendingContainer');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--sub)"><span class="spinner"></span> Loading top songs...</div>';

  try {
    const res = await fetch('https://itunes.apple.com/in/rss/topsongs/limit=100/json');
    const data = await res.json();
    const entries = data.feed && data.feed.entry ? data.feed.entry : [];

    trendingSongsCache = entries.map(e => {
      let preview = '';
      if (Array.isArray(e.link)) {
        const enc = e.link.find(l => l.attributes && l.attributes.rel === 'enclosure');
        if (enc && enc.attributes && enc.attributes.href) preview = enc.attributes.href;
      }
      const artArr = e['im:image'] || [];
      const art = artArr.length ? artArr[artArr.length - 1].label : '';
      return {
        trackName: e['im:name'] && e['im:name'].label ? e['im:name'].label : '',
        artistName: e['im:artist'] && e['im:artist'].label ? e['im:artist'].label : '',
        artworkUrl100: art,
        previewUrl: preview,
        trackId: e.id && e.id.attributes && e.id.attributes['im:id'] ? e.id.attributes['im:id'] : ''
      };
    }).filter(s => s.previewUrl);

    trendingRenderedCount = 0;
    container.innerHTML = '';
    renderMoreTrending();
    setupTrendingScroll();
  } catch (e) {
    console.error('loadTrending error', e);
    container.innerHTML = '<div class="lyrics-error" style="padding:40px;text-align:center">Failed to load trending songs. Check your connection.</div>';
  }
}

function renderMoreTrending() {
  const container = document.getElementById('trendingContainer');
  const favorites = getFavorites();
  const slice = trendingSongsCache.slice(trendingRenderedCount, trendingRenderedCount + TREND_CHUNK);
  if (!slice.length) return;
  container.innerHTML += slice.map(song => {
    const isFavorite = favorites.some(s => s.trackId === song.trackId);
    return `
      <div class="trending-card" onclick="playFromExplore('${song.previewUrl}', '${song.trackName.replace(/'/g, "\\'")}', '${song.artistName.replace(/'/g, "\\'")}', '${song.artworkUrl100 || ''}')">
        <img class="trending-card-cover" src="${song.artworkUrl100 || ''}" alt="" style="background: linear-gradient(135deg, var(--muted) 0%, #1a2332 100%)">
        <div class="trending-card-title">${song.trackName}</div>
        <div class="trending-card-artist">${song.artistName}</div>
        <button class="trending-fav-btn ${isFavorite ? 'liked' : ''}" onclick="toggleExploreFavorite(event, '${encodeURIComponent(JSON.stringify(song))}', '${song.trackId}')" title="Add to favorites">${isFavorite ? '❤️' : '🤍'}</button>
      </div>
    `;
  }).join('');
  trendingRenderedCount += slice.length;
}

function setupTrendingScroll() {
  window.removeEventListener('scroll', trendingScrollHandler);
  window.addEventListener('scroll', trendingScrollHandler);
}

function trendingScrollHandler() {
  const container = document.getElementById('trendingContainer');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  if (rect.bottom - window.innerHeight < 150) {
    renderMoreTrending();
  }
}

function playFromExplore(previewUrl, trackName, artistName, artworkUrl) {
  audio.src = previewUrl;
  audio.play();
  
  // show lyrics panel for explore playback
  document.getElementById('lyricsPanel').classList.add('visible');

  // Update player UI
  document.getElementById('playerName').textContent = trackName;
  document.getElementById('playerArtist').textContent = artistName;
  // try to bump up resolution by swapping any 2-digit size to 300x300
  document.getElementById('coverLarge').src = artworkUrl ? artworkUrl.replace(/\d+x\d+/, '300x300') : '';

  isPlaying = true;
  document.getElementById('playBtn').innerHTML = '&#9646;&#9646;';

  fetchLyrics(artistName, trackName);
}

function toggleExploreFavorite(event, songJson, trackId) {
  event.stopPropagation();
  const song = JSON.parse(decodeURIComponent(songJson));
  
  if (isSongFavorite(song)) {
    removeFavorite(song);
    event.target.classList.remove('liked');
    event.target.textContent = '🤍';
  } else {
    saveFavorite(song);
    event.target.classList.add('liked');
    event.target.textContent = '❤️';
  }
}

// when script loads we want some category results
loadDefaultCategories();

// ============ LIBRARY PAGE ============
function renderLibrary() {
  const songsList = getPlaylistSongs(currentPlaylist);
  const libraryList = document.getElementById('libraryList');

  if (!songsList.length) {
    libraryList.innerHTML = `
      <div class="empty-library">
        <div class="icon">📭</div>
        <p>No songs in "${currentPlaylist}" yet</p>
        <p style="font-size:14px;color:var(--muted)">Add tracks from search or explore</p>
      </div>
    `;
    return;
  }

  libraryList.innerHTML = `
    <div style="padding: 20px 0;">
      <div style="font-size:12px;color:var(--sub);margin-bottom:12px;">🎶 ${songsList.length} track${songsList.length !== 1 ? 's' : ''} in ${currentPlaylist}</div>
      ${songsList.map((song, i) => {
        return `
          <div class="song-item" onclick="playFromLibrary('${song.previewUrl}', '${song.trackName.replace(/'/g, "\\'")}', '${song.artistName.replace(/'/g, "\\'")}', '${(song.artworkUrl100 || '').replace(/'/g, "\\'")}')">
            <img class="song-thumb" src="${song.artworkUrl60 || ''}" alt="" style="background: linear-gradient(135deg, var(--muted) 0%, #1a2332 100%)">
            <div class="song-meta">
              <div class="song-title">${song.trackName}</div>
              <div class="song-artist">${song.artistName}</div>
            </div>
            <button class="favorite-btn liked" onclick="removeFromPlaylist(event, '${currentPlaylist}', '${song.trackId}')" title="Remove from playlist">🗑️</button>
            <div class="song-num">${i + 1}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function playFromLibrary(previewUrl, trackName, artistName, artworkUrl) {
  audio.src = previewUrl;
  audio.play();
  
  document.getElementById('lyricsPanel').classList.add('visible');

  document.getElementById('playerName').textContent = trackName;
  document.getElementById('playerArtist').textContent = artistName;
  document.getElementById('coverLarge').src = artworkUrl.replace('100x100', '300x300');

  isPlaying = true;
  document.getElementById('playBtn').innerHTML = '&#9646;&#9646;';

  fetchLyrics(artistName, trackName);
}


// ============ INITIALIZATION ============
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchSongs();
});

// show/hide player according to playback
function showPlayer() { document.querySelector('.player').style.display = 'flex'; }
function hidePlayer() { document.querySelector('.player').style.display = 'none'; }
audio.addEventListener('play', showPlayer);
// keep player visible on pause so user can resume
// audio.addEventListener('pause', hidePlayer);
audio.addEventListener('ended', hidePlayer);

// prepare playlists UI
populateFolderList();
loadPlaylist(currentPlaylist);

// Auto-load on start
searchSongs();