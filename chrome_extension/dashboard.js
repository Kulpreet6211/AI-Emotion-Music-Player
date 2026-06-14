// ===============================
// TAB SWITCHING
// ===============================
const tabButtons = document.querySelectorAll(".tab-btn");
const tabs = document.querySelectorAll(".tab-content");

tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        tabButtons.forEach(b => b.classList.remove("active"));
        tabs.forEach(t => t.classList.remove("active"));

        btn.classList.add("active");
        document.getElementById(btn.dataset.tab).classList.add("active");
    });
});


// ===============================
// AUDIO SETUP
// ===============================
const audio = document.getElementById("audioPlayer");
const playBtn = document.getElementById("playBtn");
const nextBtn = document.getElementById("nextBtn");
const prevBtn = document.getElementById("prevBtn");

const progressBar = document.getElementById("progressBar");
const progressContainer = document.querySelector(".progress-container");

const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");


// ===============================
// GLOBAL STATE
// ===============================
let currentPlaylist = [];
let currentIndex = 0;
let isPlaying = false;
let currentMood = "happy";
let moodChartInstance = null;
let language = "punjabi"; // default

// Spotify State
let spotifyTimer = null;
let spotifyCurrentTime = 0;
let spotifyDuration = 180;
let lastPlaybackStateTimestamp = 0;

// ===============================
// SPOTIFY HELPERS
// ===============================
async function getSpotifyAccessToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get([
            'spotifyAccessToken',
            'spotifyRefreshToken',
            'spotifyTokenExpiresAt',
            'spotifyConnected'
        ], async (res) => {
            if (!res.spotifyConnected || !res.spotifyAccessToken) {
                resolve(null);
                return;
            }
            
            // If token is expiring in 3 minutes, refresh it
            if (Date.now() + 180 * 1000 >= res.spotifyTokenExpiresAt) {
                console.log("Spotify token expiring, refreshing...");
                try {
                    const response = await fetch('http://127.0.0.1:5000/spotify/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refresh_token: res.spotifyRefreshToken })
                    });
                    if (response.ok) {
                        const data = await response.json();
                        const newExpiresAt = Date.now() + data.expires_in * 1000;
                        chrome.storage.local.set({
                            spotifyAccessToken: data.access_token,
                            spotifyTokenExpiresAt: newExpiresAt
                        });
                        resolve(data.access_token);
                    } else {
                        console.error("Failed to refresh Spotify token");
                        resolve(null);
                    }
                } catch (err) {
                    console.error("Error refreshing Spotify token:", err);
                    resolve(null);
                }
            } else {
                resolve(res.spotifyAccessToken);
            }
        });
    });
}

async function checkSpotifyStatus() {
    const statusText = document.getElementById("spotifyStatus");
    const connectBtn = document.getElementById("spotifyConnectBtn");
    const disconnectBtn = document.getElementById("spotifyDisconnectBtn");
    const deviceInfo = document.getElementById("spotifyDeviceInfo");
    const deviceName = document.getElementById("spotifyDeviceName");
    const sourceBadge = document.getElementById("playerSourceBadge");
    
    chrome.storage.local.get(['spotifyConnected'], async (res) => {
        if (!res.spotifyConnected) {
            if (statusText) { statusText.innerText = "Disconnected"; statusText.style.color = "#ef4444"; }
            if (connectBtn) connectBtn.style.display = "block";
            if (disconnectBtn) disconnectBtn.style.display = "none";
            if (deviceInfo) deviceInfo.style.display = "none";
            if (sourceBadge) sourceBadge.innerText = "Local Player";
            return;
        }
        
        if (statusText) { statusText.innerText = "Connected"; statusText.style.color = "#1db954"; }
        if (connectBtn) connectBtn.style.display = "none";
        if (disconnectBtn) disconnectBtn.style.display = "block";
        
        const token = await getSpotifyAccessToken();
        if (!token) {
            if (statusText) { statusText.innerText = "Session Expired"; statusText.style.color = "#f59e0b"; }
            if (connectBtn) connectBtn.style.display = "block";
            if (disconnectBtn) disconnectBtn.style.display = "none";
            if (deviceInfo) deviceInfo.style.display = "none";
            return;
        }
        
        try {
            const playerRes = await fetch("https://api.spotify.com/v1/me/player", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            
            if (playerRes.status === 200) {
                const playerData = await playerRes.json();
                if (playerData.device) {
                    if (deviceInfo) deviceInfo.style.display = "block";
                    if (deviceName) deviceName.innerText = `${playerData.device.name} (${playerData.device.type})`;
                    if (sourceBadge) sourceBadge.innerText = `Spotify: ${playerData.device.name}`;
                } else {
                    if (deviceInfo) deviceInfo.style.display = "block";
                    if (deviceName) deviceName.innerText = "No active device (open Spotify)";
                    if (sourceBadge) sourceBadge.innerText = "Spotify (No Device)";
                }
            } else if (playerRes.status === 204) {
                if (deviceInfo) deviceInfo.style.display = "block";
                if (deviceName) deviceName.innerText = "No active device (open Spotify)";
                if (sourceBadge) sourceBadge.innerText = "Spotify (No Device)";
            } else {
                if (deviceInfo) deviceInfo.style.display = "none";
            }
        } catch (err) {
            console.error("Error fetching Spotify player state:", err);
        }
    });
}

function startSpotifyProgressTimer(durationStr) {
    clearInterval(spotifyTimer);
    
    let parts = durationStr.split(':');
    if (parts.length === 2) {
        spotifyDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else {
        spotifyDuration = 180;
    }
    
    spotifyCurrentTime = 0;
    if (durationEl) durationEl.innerText = durationStr;
    if (currentTimeEl) currentTimeEl.innerText = "0:00";
    if (progressBar) progressBar.style.width = "0%";
    
    spotifyTimer = setInterval(() => {
        if (!isPlaying) return;
        spotifyCurrentTime++;
        if (spotifyCurrentTime >= spotifyDuration) {
            clearInterval(spotifyTimer);
            handleTrackEnded();
            return;
        }
        if (currentTimeEl) currentTimeEl.innerText = formatTime(spotifyCurrentTime);
        if (progressBar && spotifyDuration > 0) {
            progressBar.style.width = (spotifyCurrentTime / spotifyDuration * 100) + "%";
        }
    }, 1000);
}

function stopSpotifyProgressTimer() {
    clearInterval(spotifyTimer);
}

function setSpotifyPlaybackState(isPlaying, song, progressMs = 0) {
    lastPlaybackStateTimestamp = Date.now();
    chrome.storage.local.set({
        spotifyPlaybackState: {
            isPlaying: isPlaying,
            song: song,
            startTime: Date.now(),
            progressMs: progressMs,
            lastUpdated: lastPlaybackStateTimestamp
        }
    }, () => {
        console.log("Dashboard updated spotifyPlaybackState in storage:", isPlaying, song?.title);
    });
}

function syncSpotifyPlaybackState(state) {
    if (!state || !state.song) return;

    console.log("Dashboard syncing playback state from storage:", state.song.title, "isPlaying:", state.isPlaying);

    const song = state.song;
    
    // Find song in currentPlaylist
    const songIndex = currentPlaylist.findIndex(s => s.spotify_uri === song.spotify_uri);
    if (songIndex !== -1) {
        currentIndex = songIndex;
    } else {
        currentPlaylist = [song];
        currentIndex = 0;
    }

    // Update UI Now Playing card
    document.getElementById("songTitle").innerText = song.title;
    document.getElementById("songArtist").innerText = song.artist;
    renderPlaylist(currentPlaylist);

    if (state.isPlaying) {
        isPlaying = true;
        if (playBtn) playBtn.innerText = "⏸";
        // Calculate elapsed offset
        const elapsedMs = Date.now() - state.startTime + (state.progressMs || 0);
        const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
        
        startSpotifyProgressTimerFromOffset(song.duration, elapsedSec);
    } else {
        isPlaying = false;
        if (playBtn) playBtn.innerText = "▶";
        stopSpotifyProgressTimer();
        
        let parts = song.duration.split(':');
        let durationSec = 180;
        if (parts.length === 2) {
            durationSec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
        const progressSec = Math.max(0, Math.floor((state.progressMs || 0) / 1000));
        if (durationEl) durationEl.innerText = song.duration;
        if (currentTimeEl) currentTimeEl.innerText = formatTime(progressSec);
        if (progressBar && durationSec > 0) {
            progressBar.style.width = (progressSec / durationSec * 100) + "%";
        }
    }
}

function startSpotifyProgressTimerFromOffset(durationStr, elapsedSec) {
    clearInterval(spotifyTimer);
    
    let parts = durationStr.split(':');
    if (parts.length === 2) {
        spotifyDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else {
        spotifyDuration = 180;
    }
    
    spotifyCurrentTime = elapsedSec;
    if (durationEl) durationEl.innerText = durationStr;
    if (currentTimeEl) currentTimeEl.innerText = formatTime(spotifyCurrentTime);
    if (progressBar && spotifyDuration > 0) {
        progressBar.style.width = (spotifyCurrentTime / spotifyDuration * 100) + "%";
    }
    
    spotifyTimer = setInterval(() => {
        if (!isPlaying) return;
        spotifyCurrentTime++;
        if (spotifyCurrentTime >= spotifyDuration) {
            clearInterval(spotifyTimer);
            handleTrackEnded();
            return;
        }
        if (currentTimeEl) currentTimeEl.innerText = formatTime(spotifyCurrentTime);
        if (progressBar && spotifyDuration > 0) {
            progressBar.style.width = (spotifyCurrentTime / spotifyDuration * 100) + "%";
        }
    }, 1000);
}

async function playSongSpotify(song) {
    const token = await getSpotifyAccessToken();
    if (!token) return false;
    
    let uri = song.spotify_uri;
    if (!uri) {
        console.log(`Resolving Spotify URI for: ${song.title} - ${song.artist}`);
        const query = encodeURIComponent(`track:${song.title} artist:${song.artist}`);
        try {
            const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (searchRes.ok) {
                const searchData = await searchRes.json();
                if (searchData.tracks && searchData.tracks.items.length > 0) {
                    uri = searchData.tracks.items[0].uri;
                    song.spotify_uri = uri; // Cache in memory
                    console.log("Resolved to URI:", uri);
                }
            }
        } catch (err) {
            console.error("Error searching song on Spotify:", err);
        }
    }
    
    if (!uri) {
        console.warn("Could not find song on Spotify.");
        alert(`Could not find "${song.title} - ${song.artist}" on Spotify.`);
        return false;
    }
    
    try {
        const playRes = await fetch("https://api.spotify.com/v1/me/player/play", {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ uris: [uri] })
        });
        
        if (playRes.status === 204) {
            console.log("Spotify playback started successfully!");
            isPlaying = true;
            if (playBtn) playBtn.innerText = "⏸";
            return true;
        } else if (playRes.status === 404) {
            alert("No active Spotify device found. Please open Spotify on your phone, computer, or web browser and play any track, then try again.");
            return false;
        } else {
            const errText = await playRes.text();
            console.error("Spotify playback error:", errText);
            return false;
        }
    } catch (err) {
        console.error("Error calling Spotify play API:", err);
        return false;
    }
}

async function generateSpotifyRecommendations(mood, lang) {
    try {
        const token = await getSpotifyAccessToken();
        if (!token) {
            console.log("Spotify not connected, skipping recommendations.");
            return [];
        }
        
        const moodLower = (mood || "happy").toLowerCase();
        const langLower = (lang || "punjabi").toLowerCase();
        let queries = [];

        if (langLower === "hindi" || langLower === "bollywood") {
            if (moodLower === "happy")        queries = ["bollywood happy hits", "bollywood dance hits", "bollywood feel good", "bollywood upbeat"];
            else if (moodLower === "sad")     queries = ["bollywood sad songs", "bollywood emotional", "bollywood heartbreak", "hindi sad melodies"];
            else if (moodLower === "angry")   queries = ["bollywood energetic workout", "hindi rock energetic", "bollywood high energy", "hindi powerful songs"];
            else if (moodLower === "neutral") queries = ["bollywood chill lofi", "hindi soothing acoustic", "bollywood soft romantic", "hindi chill travel"];
            else                              queries = ["bollywood party dance", "bollywood celebration", "hindi wedding dance", "bollywood dynamic club"];
        } else if (langLower === "punjabi") {
            if (moodLower === "happy")        queries = ["punjabi happy bhangra", "punjabi dance hits", "punjabi upbeat bhangra", "punjabi high energy bhangra"];
            else if (moodLower === "sad")     queries = ["punjabi sad emotional", "punjabi heartbreak", "punjabi sad songs", "punjabi emotional melodies"];
            else if (moodLower === "angry")   queries = ["punjabi energetic high bass", "punjabi power hits", "punjabi aggressive workout", "punjabi heavy bass beats"];
            else if (moodLower === "neutral") queries = ["punjabi slow chill lofi", "punjabi acoustic soft", "punjabi sweet romantic", "punjabi relaxing melodies"];
            else                              queries = ["punjabi dance club", "punjabi party bhangra", "punjabi wedding hits", "punjabi fast beat dance"];
        } else {
            // English / other fallback
            if (moodLower === "happy")        queries = ["happy pop hits", "upbeat feel good pop", "summer happy vibes", "feel good classics"];
            else if (moodLower === "sad")     queries = ["sad acoustic aesthetic", "melancholy piano romantic", "heartbreak acoustic", "chill sad pop"];
            else if (moodLower === "angry")   queries = ["energetic rock gym", "workout motivation power", "aggressive hard rock", "epic motivational trailer"];
            else if (moodLower === "neutral") queries = ["lofi chill study", "relaxing acoustic coffeehouse", "ambient chillout room", "soft acoustic guitar"];
            else                              queries = ["dance party club", "electronic dance hits", "festival mainstage edm", "groove house dance"];
        }

        const query = queries[Math.floor(Math.random() * queries.length)] || "happy pop hits";
        const randomOffset = Math.floor(Math.random() * 41); // offset between 0 and 40

        console.log(`Querying Spotify Search for recommendations: "${query}" with offset ${randomOffset}`);
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10&offset=${randomOffset}`;
        
        const res = await fetch(url, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (!res.ok) {
            const errText = await res.text();
            console.error(`Spotify Search API error ${res.status}:`, errText);
            return [];
        }
        
        const data = await res.json();
        const tracks = data.tracks?.items || [];
        if (tracks.length === 0) {
            console.warn("Spotify search returned 0 tracks.");
            return [];
        }
        
        return tracks.map(track => ({
            title: track.name,
            artist: track.artists.map(a => a.name).join(", "),
            duration: formatTime(track.duration_ms / 1000),
            url: track.external_urls.spotify,
            spotify_uri: track.uri
        }));
        
    } catch (err) {
        // Isolated catch: Spotify errors must never propagate outside this function
        console.error("Error generating search-based recommendations (will use fallback):", err.message || err);
        return [];
    }
}

// ===============================
// LOAD PLAYLIST
// ===============================
async function loadPlaylist(mood = "happy", lang = null) {
    // Always use the most up-to-date language
    const activeLang = lang || language;
    currentMood = mood;
    
    let songs = [];
    
    try {
        // Step 1: Check if Spotify auto-generate is enabled
        const autoGenRes = await new Promise(resolve => {
            chrome.storage.local.get(["spotifyAutoGenerate", "spotifyConnected"], resolve);
        });
        
        if (autoGenRes.spotifyConnected && autoGenRes.spotifyAutoGenerate) {
            console.log(`Generating Spotify recommendations for mood: ${mood}, language: ${activeLang}`);
            songs = await generateSpotifyRecommendations(mood, activeLang);
        }
    } catch (err) {
        console.warn("Storage check failed, skipping Spotify step:", err);
    }
    
    // Step 2: Fallback to local backend if Spotify returned nothing
    if (!songs || songs.length === 0) {
        try {
            console.log(`Loading curated playlist from backend: ${activeLang}/${mood}`);
            const res = await fetch(`http://127.0.0.1:5000/playlist/${activeLang}/${mood}`);
            if (!res.ok) throw new Error(`Backend returned HTTP ${res.status}`);
            const data = await res.json();
            songs = data.playlist?.songs || [];
            console.log(`Loaded ${songs.length} songs from backend for ${activeLang}/${mood}`);
        } catch (err) {
            console.error("Error loading fallback playlist from backend:", err.message || err);
            songs = [];
        }
    }

    currentPlaylist = songs;
    currentIndex = 0;
    renderPlaylist(currentPlaylist);
    if (currentPlaylist.length > 0) {
        chrome.storage.local.get(['spotifyPlaybackState'], (resState) => {
            const state = resState.spotifyPlaybackState;
            if (state && state.song) {
                const idx = currentPlaylist.findIndex(s => s.spotify_uri === state.song.spotify_uri);
                if (idx !== -1) {
                    currentIndex = idx;
                    loadSong(currentIndex, false);
                    if (state.isPlaying) {
                        syncSpotifyPlaybackState(state);
                    }
                    return;
                }
            }
            loadSong(currentIndex, false);
        });
    }
}

// ===============================
// LOAD SONG
// ===============================
function loadSong(index, startPlayback = false) {
    if (!currentPlaylist.length) return;

    currentIndex = index;
    const song = currentPlaylist[index];

    document.getElementById("songTitle").innerText = song.title;
    document.getElementById("songArtist").innerText = song.artist;

    console.log("Loaded song:", song.title);

    renderPlaylist(currentPlaylist);

    chrome.storage.local.get(['spotifyConnected'], async (res) => {
        if (res.spotifyConnected) {
            const token = await getSpotifyAccessToken();
            if (token) {
                if (audio) {
                    audio.pause();
                    audio.src = "";
                }
                if (startPlayback) {
                    const success = await playSongSpotify(song);
                    if (success) {
                        startSpotifyProgressTimer(song.duration);
                        setSpotifyPlaybackState(true, song, 0);
                    }
                } else {
                    if (durationEl) durationEl.innerText = song.duration;
                    if (currentTimeEl) currentTimeEl.innerText = "0:00";
                    if (progressBar) progressBar.style.width = "0%";
                    stopSpotifyProgressTimer();
                    isPlaying = false;
                    if (playBtn) playBtn.innerText = "▶";
                    setSpotifyPlaybackState(false, song, 0);
                }
                return;
            }
        }
        
        if (!res.spotifyConnected) {
            if (song.url && (song.url.includes("youtube.com") || song.url.includes("youtu.be"))) {
                if (startPlayback) {
                    chrome.tabs.create({ url: song.url, active: true });
                }
                return;
            }
            
            if (audio) {
                audio.src = song.url;
                if (startPlayback) {
                    playSong();
                } else {
                    pauseSong();
                }
            }
            return;
        }
    });
}

// ===============================
// PLAY / PAUSE
// ===============================
function playSong() {
    audio.play().then(() => {
        isPlaying = true;
        if (playBtn) playBtn.innerText = "⏸";
    }).catch((err) => {
        console.warn("Autoplay blocked or local play error:", err);
        isPlaying = false;
        if (playBtn) playBtn.innerText = "▶";
    });
}

function pauseSong() {
    if (audio) audio.pause();
    isPlaying = false;
    if (playBtn) playBtn.innerText = "▶";
}


// ===============================
// THEME SYSTEM
// ===============================
const themeToggleHome = document.getElementById("themeToggleHome");
const themeToggleSettings = document.getElementById("themeToggleSettings");

chrome.storage.local.get(["theme"], (result) => {
    if (result.theme === "light") {
        document.body.classList.add("light");
    }
    updateThemeIcon();
});

function toggleTheme() {
    document.body.classList.toggle("light");

    const isLight = document.body.classList.contains("light");

    chrome.storage.local.set({
        theme: isLight ? "light" : "dark"
    });

    updateThemeIcon();
}

function updateThemeIcon() {
    const isLight = document.body.classList.contains("light");

    if (themeToggleHome) {
        themeToggleHome.innerText = isLight ? "☀️" : "🌙";
    }

    if (themeToggleSettings) {
        themeToggleSettings.innerText = isLight ? "☀️ Toggle Theme" : "🌙 Toggle Theme";
    }
}

if (themeToggleHome) themeToggleHome.onclick = toggleTheme;
if (themeToggleSettings) themeToggleSettings.onclick = toggleTheme;

function getEmotionColor(emotion) {
  const colors = {
    happy: "#2dd4bf",     // teal
    sad: "#60a5fa",       // blue
    neutral: "#a78bfa",   // purple
    angry: "#f87171",     // red
    surprise: "#fbbf24"   // amber
  };
  return colors[emotion.toLowerCase()] || "#2dd4bf";
}

function applyMoodTheme(mood) {
  const root = document.documentElement;
  const color = getEmotionColor(mood);
  root.style.setProperty("--accent", color);
  
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  root.style.setProperty("--glow", `rgba(${r}, ${g}, ${b}, 0.4)`);
}

// Single unified storage change listener (prevents duplicate calls and lag)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    // Theme
    if (changes.theme) {
        const newTheme = changes.theme.newValue;
        if (newTheme === "light") {
            document.body.classList.add("light");
        } else {
            document.body.classList.remove("light");
        }
        updateThemeIcon();
    }

    // Language change
    if (changes.language) {
        language = changes.language.newValue;
        const selectEl = document.getElementById("languageSelect");
        if (selectEl) selectEl.value = language;
        loadPlaylist(currentMood, language);
    }

    // Mood change
    if (changes.currentMood) {
        const mood = changes.currentMood.newValue;
        loadPlaylist(mood, language);
        saveMood(mood.toLowerCase());
        applyMoodTheme(mood);

        const textEl = document.getElementById("currentMoodText");
        if (textEl) textEl.innerText = mood.charAt(0).toUpperCase() + mood.slice(1);

        const emojiEl = document.getElementById("moodEmoji");
        if (emojiEl) {
            const emojis = {
                happy: '<img src="icons/happy.png" alt="Happy">',
                sad: '<img src="icons/sad.png" alt="Sad">',
                angry: '<img src="icons/angry.png" alt="Angry">',
                neutral: '<img src="icons/neutral.png" alt="Neutral">',
                surprise: '<img src="icons/surprise.png" alt="Surprise">'
            };
            emojiEl.innerHTML = emojis[mood.toLowerCase()] || '<img src="icons/neutral.png" alt="Neutral">';
        }
    }

    // Spotify auto-generate toggle
    if (changes.spotifyAutoGenerate) {
        const toggle = document.getElementById("spotifyAutoGenerate");
        if (toggle) toggle.checked = changes.spotifyAutoGenerate.newValue;
        loadPlaylist(currentMood, language);
    }

    // Spotify connected/disconnected
    if (changes.spotifyConnected) {
        checkSpotifyStatus();
        loadPlaylist(currentMood, language);
    }

    // Shuffle state change
    if (changes.shuffle) {
        const toggle = document.getElementById("shuffleToggle");
        if (toggle) toggle.checked = changes.shuffle.newValue;
    }

    // Spotify playback state sync
    if (changes.spotifyPlaybackState) {
        const state = changes.spotifyPlaybackState.newValue;
        if (state && state.lastUpdated > lastPlaybackStateTimestamp) {
            lastPlaybackStateTimestamp = state.lastUpdated;
            syncSpotifyPlaybackState(state);
        }
    }
});


// ===============================
// BUTTON CONTROLS
// ===============================
if (playBtn) {
    playBtn.onclick = () => {
        if (!currentPlaylist.length) return;
        
        chrome.storage.local.get(['spotifyConnected'], async (res) => {
            if (res.spotifyConnected) {
                const token = await getSpotifyAccessToken();
                if (token) {
                    if (isPlaying) {
                        try {
                            const pauseRes = await fetch("https://api.spotify.com/v1/me/player/pause", {
                                method: "PUT",
                                headers: { "Authorization": `Bearer ${token}` }
                            });
                            if (pauseRes.ok || pauseRes.status === 204) {
                                isPlaying = false;
                                playBtn.innerText = "▶";
                                stopSpotifyProgressTimer();
                                
                                // Update storage state
                                chrome.storage.local.get(['spotifyPlaybackState'], (stateRes) => {
                                    const song = currentPlaylist[currentIndex];
                                    const oldState = stateRes.spotifyPlaybackState || {};
                                    const elapsedMs = oldState.isPlaying ? (Date.now() - oldState.startTime) : 0;
                                    setSpotifyPlaybackState(false, song, (oldState.progressMs || 0) + elapsedMs);
                                });
                            }
                        } catch (err) {
                            console.error("Error pausing Spotify:", err);
                        }
                    } else {
                        const song = currentPlaylist[currentIndex];
                        const success = await playSongSpotify(song);
                        if (success) {
                            startSpotifyProgressTimer(song.duration);
                            
                            // Update storage state
                            chrome.storage.local.get(['spotifyPlaybackState'], (stateRes) => {
                                const oldState = stateRes.spotifyPlaybackState || {};
                                const isSameSong = oldState.song && oldState.song.spotify_uri === song.spotify_uri;
                                setSpotifyPlaybackState(true, song, isSameSong ? (oldState.progressMs || 0) : 0);
                            });
                        }
                    }
                    return;
                }
            }
            
            if (isPlaying) {
                pauseSong();
            } else {
                playSong();
            }
        });
    };
}

if (prevBtn) {
    prevBtn.onclick = () => {
        if (!currentPlaylist.length) return;
        currentIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
        loadSong(currentIndex, true);
    };
}

if (nextBtn) {
    nextBtn.onclick = () => {
        if (!currentPlaylist.length) return;
        chrome.storage.local.get(["shuffle"], (res) => {
            const shuffle = res.shuffle ?? true;
            if (shuffle) {
                currentIndex = Math.floor(Math.random() * currentPlaylist.length);
            } else {
                currentIndex = (currentIndex + 1) % currentPlaylist.length;
            }
            loadSong(currentIndex, true);
        });
    };
}

// ===============================
// PROGRESS BAR
// ===============================
if (audio) {
    audio.addEventListener("timeupdate", () => {
        if (!audio.duration) return;

        const progress = (audio.currentTime / audio.duration) * 100;
        progressBar.style.width = progress + "%";

        currentTimeEl.innerText = formatTime(audio.currentTime);
        durationEl.innerText = formatTime(audio.duration);
    });

    audio.addEventListener("ended", () => {
        handleTrackEnded();
    });
}


// ===============================
// SEEK
// ===============================
if (progressContainer) {
    progressContainer.addEventListener("click", (e) => {
        if (!audio.duration) return;

        const width = progressContainer.clientWidth;
        const clickX = e.offsetX;

        audio.currentTime = (clickX / width) * audio.duration;
    });
}


// ===============================
// FORMAT TIME
// ===============================
function formatTime(time) {
    if (isNaN(time)) return "0:00";

    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);

    return `${min}:${sec < 10 ? "0" + sec : sec}`;
}

// ===============================
// TRACK ENDED HANDLER
// ===============================
function handleTrackEnded() {
    chrome.storage.local.get(["autoPlay", "loop", "shuffle"], (res) => {
        const autoPlay = res.autoPlay ?? true;
        const loop = res.loop ?? false;
        const shuffle = res.shuffle ?? true;
        
        if (!autoPlay) {
            isPlaying = false;
            if (playBtn) playBtn.innerText = "▶";
            if (currentPlaylist.length > 0) {
                setSpotifyPlaybackState(false, currentPlaylist[currentIndex], 0);
            }
            return;
        }

        if (shuffle && currentPlaylist.length > 0) {
            const nextIdx = Math.floor(Math.random() * currentPlaylist.length);
            loadSong(nextIdx, true);
            return;
        }
        
        if (currentIndex >= currentPlaylist.length - 1) {
            if (loop) {
                currentIndex = 0;
                loadSong(currentIndex, true);
            } else {
                console.log("End of playlist. Auto-fetching a new dynamic playlist for continuous play...");
                loadPlaylist(currentMood, language).then(() => {
                    if (currentPlaylist.length > 0) {
                        loadSong(0, true);
                    } else {
                        isPlaying = false;
                        if (playBtn) playBtn.innerText = "▶";
                        if (currentPlaylist.length > 0) {
                            setSpotifyPlaybackState(false, currentPlaylist[currentIndex], 0);
                        }
                    }
                });
            }
        } else {
            currentIndex++;
            loadSong(currentIndex, true);
        }
    });
}


// ===============================
// RENDER PLAYLIST
// ===============================
function renderPlaylist(songs) {
    const container = document.getElementById("playlist");
    if (!container) return;

    container.innerHTML = "";

    if (!songs || songs.length === 0) {
        container.innerHTML = `<p style="opacity:0.5; font-size:13px; padding: 12px 0;">No songs found. Try changing language or mood.</p>`;
        return;
    }

    songs.forEach((song, index) => {
        const div = document.createElement("div");
        div.className = "song-item";

        if (index === currentIndex) {
            div.classList.add("active");
        }

        div.innerHTML = `
            <strong>${song.title}</strong><br>
            <span>${song.artist}</span>
            <span style="float:right; font-size:11px; opacity:0.6;">${song.duration || ''}</span>
        `;

        // Click on song item triggers playback
        div.onclick = () => loadSong(index, true);

        container.appendChild(div);
    });
}


// ===============================
// SETTINGS - CLEAR HISTORY
// ===============================

const clearBtn = document.getElementById("clearData");

if (clearBtn) {
    clearBtn.addEventListener("click", () => {
        try {
            const confirmDelete = window.confirm(
                "Are you sure you want to clear your mood history?"
            );

            if (!confirmDelete) {
                console.log("User cancelled deletion");
                return;
            }

            chrome.storage?.local?.remove(["moodHistory"], () => {
                if (chrome.runtime?.lastError) {
                    console.error("Error clearing mood history:", chrome.runtime.lastError);
                    alert("Failed to clear mood history!");
                    return;
                }

                console.log("Mood history cleared successfully");
                alert("Mood history cleared successfully!");
            });

        } catch (error) {
            console.error("Unexpected error while clearing history:", error);
        }
    });
} else {
    console.warn("clearData button not found in DOM");
}

// ===============================
// SETTINGS LOGIC
// ===============================

// AUTO PLAY
const autoPlayToggle = document.getElementById("autoPlay");
if (autoPlayToggle) {
    chrome.storage.local.get(["autoPlay"], (res) => {
        autoPlayToggle.checked = res.autoPlay ?? true;
    });

    autoPlayToggle.onchange = () => {
        chrome.storage.local.set({ autoPlay: autoPlayToggle.checked });
    };
}

// SHUFFLE
const shuffleToggle = document.getElementById("shuffleToggle");
if (shuffleToggle) {
    chrome.storage.local.get(["shuffle"], (res) => {
        shuffleToggle.checked = res.shuffle ?? true;
    });

    shuffleToggle.onchange = () => {
        chrome.storage.local.set({ shuffle: shuffleToggle.checked });
    };
}

// LOOP
const loopToggle = document.getElementById("loopPlaylist");
if (loopToggle) {
    chrome.storage.local.get(["loop"], (res) => {
        loopToggle.checked = res.loop ?? false;
    });

    loopToggle.onchange = () => {
        chrome.storage.local.set({ loop: loopToggle.checked });
    };
}

// VOLUME
const volumeSlider = document.getElementById("volumeSlider");
if (volumeSlider) {
    chrome.storage.local.get(["volume"], (res) => {
        const vol = res.volume ?? 0.5;
        volumeSlider.value = vol;
        if (audio) audio.volume = vol;
    });

    volumeSlider.oninput = () => {
        const vol = parseFloat(volumeSlider.value);
        if (audio) audio.volume = vol;
        chrome.storage.local.set({ volume: vol });
    };
}

// NOTIFICATIONS
const notifToggle = document.getElementById("enableNotif");
if (notifToggle) {
    chrome.storage.local.get(["enableNotif"], (res) => {
        notifToggle.checked = res.enableNotif ?? true;
    });

    notifToggle.onchange = () => {
        chrome.storage.local.set({ enableNotif: notifToggle.checked });
    };
}


// ===============================
// INIT
// ===============================
chrome.storage.local.get(["currentMood", "language"], (result) => {
    const mood = result.currentMood || "happy";
    language = result.language || "punjabi";

    // Set language selector UI
    const selectEl = document.getElementById("languageSelect");
    if (selectEl) selectEl.value = language;

    loadPlaylist(mood, language);
    saveMood(mood.toLowerCase());
    applyMoodTheme(mood);

    // Update mood UI
    const textEl = document.getElementById("currentMoodText");
    if (textEl) textEl.innerText = mood.charAt(0).toUpperCase() + mood.slice(1);
});


// ===============================
// TIME SLIDER
// ===============================
const slider = document.getElementById("timeSlider");
const timeText = document.getElementById("timeValue");

if (slider && timeText) {
    chrome.storage.local.get(["rescanTime"], (result) => {
        const time = result.rescanTime || 5;
        slider.value = time;
        timeText.textContent = time;
    });

    slider.addEventListener("input", () => {
        const value = Number(slider.value);

        timeText.textContent = value;

        chrome.storage.local.set({ rescanTime: value });

        chrome.runtime.sendMessage({
            action: "updateTimer",
            time: value
        });
    });
}


// ===============================
// DETECTOR OPTIONS
// ===============================
const detectionSelect = document.getElementById("detectionModeSelect");
const smoothingSlider = document.getElementById("smoothingSlider");
const smoothingText = document.getElementById("smoothingValue");

if (detectionSelect) {
    chrome.storage.local.get(["detectionMode"], (result) => {
        detectionSelect.value = result.detectionMode || "focus";
    });

    detectionSelect.addEventListener("change", () => {
        chrome.storage.local.set({ detectionMode: detectionSelect.value });
        console.log("Detection mode set to:", detectionSelect.value);
    });
}

if (smoothingSlider && smoothingText) {
    chrome.storage.local.get(["smoothingWindow"], (result) => {
        const val = result.smoothingWindow || 3;
        smoothingSlider.value = val;
        smoothingText.textContent = val;
    });

    smoothingSlider.addEventListener("input", () => {
        const val = Number(smoothingSlider.value);
        smoothingText.textContent = val;
        chrome.storage.local.set({ smoothingWindow: val });
        console.log("Smoothing window set to:", val);
    });
}


// ===============================
// SAVE MOOD
// ===============================
function saveMood(mood) {
    const today = new Date().toLocaleDateString();

    chrome.storage.local.get(["moodHistory"], (result) => {
        let history = result.moodHistory || {};

        if (!history[today]) {
            history[today] = [];
        }

        history[today].push(
            mood.charAt(0).toUpperCase() + mood.slice(1)
        );

        chrome.storage.local.set({ moodHistory: history });
    });
}


// ===============================
// WEEKLY DATA
// ===============================
function getWeeklyData(callback) {
    chrome.storage.local.get(["moodHistory"], (result) => {
        const history = result.moodHistory || {};

        const days = [];
        const allMoods = ["happy", "sad", "neutral", "angry", "surprise"];
        const moodCounts = {};

        allMoods.forEach(m => moodCounts[m] = []);

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);

            const dateStr = d.toLocaleDateString();
            days.push(dateStr);

            const moods = history[dateStr] || [];

            const count = {};
            allMoods.forEach(m => count[m] = 0);

            moods.forEach(m => {
                m = m.toLowerCase();
                if (count[m] !== undefined) count[m]++;
            });

            allMoods.forEach(m => {
                moodCounts[m].push(count[m]);
            });
        }

        callback(days, moodCounts, allMoods);
    });
}


// ===============================
// RENDER CHART
// ===============================
function renderChart() {
    getWeeklyData((labels, data, moods) => {

        const ctx = document.getElementById("moodChart");
        if (!ctx || typeof Chart === "undefined") return;

        if (moodChartInstance) {
            moodChartInstance.destroy();
        }

        const colors = {
            happy: "#2dd4bf",
            sad: "#60a5fa",
            neutral: "#a78bfa",
            angry: "#f87171",
            surprise: "#fbbf24"
        };

        const datasets = moods.map(mood => ({
            label: mood.charAt(0).toUpperCase() + mood.slice(1),
            data: data[mood],
            borderWidth: 2,
            borderColor: colors[mood],
            tension: 0.4
        }));

        moodChartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true
            }
        });
    });
}


// ===============================
// LOAD CHART ON TAB CLICK
// ===============================
tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        if (btn.dataset.tab === "analytics") {
            setTimeout(renderChart, 200);
        }
    });
});

window.addEventListener("load", () => {
    const analyticsTab = document.getElementById("analytics");

    if (analyticsTab && analyticsTab.classList.contains("active")) {
        renderChart();
    }
});

chrome.storage.local.get(["currentMood"], (res) => {
  const mood = res.currentMood || "happy";

  document.getElementById("currentMoodText").innerText =
    mood.charAt(0).toUpperCase() + mood.slice(1);

const emojis = {
  happy: '<img src="icons/happy.png" alt="Happy">',
  sad: '<img src="icons/sad.png" alt="Sad">',
  angry: '<img src="icons/angry.png" alt="Angry">',
  neutral: '<img src="icons/neutral.png" alt="Neutral">',
  surprise: '<img src="icons/surprise.png" alt="Surprise">'
};

document.getElementById("moodEmoji").innerHTML =
  emojis[mood] || '<img src="icons/neutral.png" alt="Neutral">';
});

// ===============================
// MINI MOOD PIE CHART (HOME)
// ===============================
function renderMiniChart() {
  chrome.storage.local.get(["moodHistory"], (res) => {
    const history = res.moodHistory || {};

    const today = new Date().toLocaleDateString();
    const moods = history[today] || [];

    const counts = {
      happy: 0,
      sad: 0,
      angry: 0,
      neutral: 0,
      surprise: 0
    };

    moods.forEach(m => {
      m = m.toLowerCase();
      if (counts[m] !== undefined) counts[m]++;
    });

    const ctx = document.getElementById("miniMoodChart");
    if (!ctx || typeof Chart === "undefined") return;

    new Chart(ctx, {
      type: "pie", // 🔥 CHANGE HERE
      data: {
        labels: Object.keys(counts),
        datasets: [{
          data: Object.values(counts),
          backgroundColor: [
            "#4ade80", // happy
            "#60a5fa", // sad
            "#f87171", // angry
            "#a78bfa", // neutral
            "#fbbf24"  // surprise
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom"
          }
        }
      }
    });
  });
  console.log("Chart running");
}


// ===============================
// LOAD MINI GRAPH ON PAGE LOAD
// ===============================
window.addEventListener("load", () => {
  renderMiniChart();
});

// ===============================
// LANGUAGE SELECTOR
// ===============================
const langSelect = document.getElementById("languageSelect");

if (langSelect) {
  // Language value is already set during INIT block above
  // Just listen for manual changes here
  langSelect.addEventListener("change", () => {
      const lang = langSelect.value;
      language = lang;
      chrome.storage.local.set({ language: lang });
      console.log("Language selected:", lang);
      loadPlaylist(currentMood, lang);
  });
}

// ===============================
// REFRESH BUTTON
// ===============================
const refreshPlaylistBtn = document.getElementById("refreshPlaylistBtn");
if (refreshPlaylistBtn) {
    refreshPlaylistBtn.onclick = () => {
        refreshPlaylistBtn.disabled = true;
        refreshPlaylistBtn.innerText = "Loading...";
        loadPlaylist(currentMood, language).finally(() => {
            refreshPlaylistBtn.disabled = false;
            refreshPlaylistBtn.innerText = "\u21BB Refresh Songs";
        });
    };
}

// ===============================
// SPOTIFY INITIALIZATION & EVENTS
// ===============================
const spotifyConnectBtn = document.getElementById("spotifyConnectBtn");
if (spotifyConnectBtn) {
    spotifyConnectBtn.onclick = async () => {
        spotifyConnectBtn.innerText = "Connecting...";
        spotifyConnectBtn.disabled = true;
        try {
            // First check backend is up and credentials are configured
            const statusRes = await fetch("http://127.0.0.1:5000/spotify/status");
            if (!statusRes.ok) {
                alert("⚠️ Backend is not running!\n\nPlease start the Flask backend first:\n  python backend/app.py");
                return;
            }
            const statusData = await statusRes.json();
            if (!statusData.configured) {
                alert("⚠️ Spotify credentials not found!\n\nPlease add your credentials to backend/.env:\n  SPOTIFY_CLIENT_ID=...\n  SPOTIFY_CLIENT_SECRET=...");
                return;
            }
            
            const extensionId = chrome.runtime.id;
            const res = await fetch(`http://127.0.0.1:5000/spotify/login?extension_id=${extensionId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'configured') {
                    chrome.tabs.create({ url: data.auth_url });
                } else {
                    alert("Spotify credentials not configured. Check your backend/.env file.");
                }
            } else {
                const errData = await res.json().catch(() => ({}));
                alert(errData.error || "Failed to trigger Spotify login.");
            }
        } catch (err) {
            console.error("Spotify login trigger error:", err);
            alert("⚠️ Cannot reach backend.\n\nMake sure the Flask server is running on port 5000.");
        } finally {
            spotifyConnectBtn.innerText = "Connect Spotify";
            spotifyConnectBtn.disabled = false;
        }
    };
}

const spotifyDisconnectBtn = document.getElementById("spotifyDisconnectBtn");
if (spotifyDisconnectBtn) {
    spotifyDisconnectBtn.onclick = () => {
        chrome.storage.local.remove([
            'spotifyAccessToken',
            'spotifyRefreshToken',
            'spotifyTokenExpiresAt',
            'spotifyConnected'
        ], () => {
            console.log("Spotify disconnected");
            checkSpotifyStatus();
        });
    };
}

// NOTE: All storage.onChanged logic is consolidated in the single listener above.
// This avoids duplicate loadPlaylist calls that caused lag.

// Extract tokens from URL if coming back from redirect callback
window.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('spotify_auth') === 'success') {
        const accessToken = urlParams.get('access_token');
        const refreshToken = urlParams.get('refresh_token');
        const expiresIn = Number(urlParams.get('expires_in'));
        
        chrome.storage.local.set({
            spotifyAccessToken: accessToken,
            spotifyRefreshToken: refreshToken,
            spotifyTokenExpiresAt: Date.now() + expiresIn * 1000,
            spotifyConnected: true
        }, () => {
            console.log("Spotify connected and tokens saved!");
            window.history.replaceState({}, document.title, window.location.pathname);
            checkSpotifyStatus();
        });
    } else {
        checkSpotifyStatus();
    }
    
    const autoGenToggle = document.getElementById("spotifyAutoGenerate");
    if (autoGenToggle) {
        chrome.storage.local.get(["spotifyAutoGenerate"], (res) => {
            autoGenToggle.checked = res.spotifyAutoGenerate ?? false;
        });
        autoGenToggle.onchange = () => {
            chrome.storage.local.set({ spotifyAutoGenerate: autoGenToggle.checked }, () => {
                console.log("Spotify AI Auto-generate set to:", autoGenToggle.checked);
                loadPlaylist(currentMood);
            });
        };
    }
    
    // Periodically sync status
    setInterval(checkSpotifyStatus, 10000);
});