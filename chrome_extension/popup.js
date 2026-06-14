// ===============================
// LOAD THEME FROM STORAGE
// ===============================
chrome.storage.local.get(["theme"], (result) => {
  if (result.theme === "light") {
    document.body.classList.add("light");
  }
});

const API = "http://127.0.0.1:5000";

let playlist = [];
let currentIndex = 0;
let stream = null;

const canvas = document.getElementById("faceCanvas");
const ctx = canvas.getContext("2d");

// 🔥 NEW (ONLY ADDITION)
let faceDetector = null;

let detectionMode = "focus";
let smoothingWindow = 3;
let moodHistoryBuffer = [];

let lastFaceRect = null;
let lastFaceDetectionTime = 0;

chrome.storage.local.get(["detectionMode", "smoothingWindow"], (res) => {
  if (res.detectionMode) detectionMode = res.detectionMode;
  if (res.smoothingWindow) smoothingWindow = Number(res.smoothingWindow);
});

// Single unified storage change listener
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.theme) {
    const newTheme = changes.theme.newValue;
    if (newTheme === "light") {
      document.body.classList.add("light");
    } else {
      document.body.classList.remove("light");
    }
  }

  if (changes.detectionMode) {
    detectionMode = changes.detectionMode.newValue;
  }

  if (changes.smoothingWindow) {
    smoothingWindow = Number(changes.smoothingWindow.newValue);
  }

  if (changes.spotifyConnected) {
    checkSpotifyPopupStatus();
    chrome.storage.local.get(["currentMood", "language"], (res) => {
      loadPlaylist(res.currentMood || "happy", res.language || "punjabi");
    });
  }

  if (changes.spotifyAutoGenerate) {
    const toggle = document.getElementById("spotifyAutoGenerateToggle");
    if (toggle) toggle.checked = changes.spotifyAutoGenerate.newValue;
    chrome.storage.local.get(["currentMood", "language"], (res) => {
      loadPlaylist(res.currentMood || "happy", res.language || "punjabi");
    });
  }

  if (changes.language) {
    const langSelect = document.getElementById("languageSelect");
    if (langSelect) langSelect.value = changes.language.newValue;
    chrome.storage.local.get(["currentMood"], (res) => {
      loadPlaylist(res.currentMood || "happy", changes.language.newValue);
    });
  }

  if (changes.currentMood) {
    const mood = changes.currentMood.newValue;
    currentMood = mood;
    document.querySelectorAll(".mood-btn").forEach(btn => {
      btn.classList.remove("active");
    });
    const btn = document.querySelector(`[data-mood="${mood}"]`);
    if (btn) btn.classList.add("active");
    applyMoodTheme(mood);
    chrome.storage.local.get(["language"], (res) => {
      loadPlaylist(mood, res.language || "punjabi");
    });
  }

  if (changes.spotifyPlaybackState) {
    const state = changes.spotifyPlaybackState.newValue;
    if (state && state.song) {
      const songIndex = playlist.findIndex(s => s.spotify_uri === state.song.spotify_uri);
      if (songIndex !== -1) {
        currentIndex = songIndex;
      }
      document.getElementById("songTitle").innerText = state.song.title;
      document.getElementById("songArtist").innerText = state.song.artist;
      highlightActive();

      updatePlayBtnIcon(state.isPlaying);
    }
  }
});

function getEmotionColor(emotion) {
  const colors = {
    happy: "#2dd4bf",     // teal
    sad: "#60a5fa",       // blue
    neutral: "#a78bfa",   // purple
    angry: "#f87171",     // red
    surprise: "#fbbf24"   // amber
  };
  return colors[emotion.toLowerCase()] || "#00ff88";
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


// ===============================
// 🔥 SAVE MOOD (NEW)
// ===============================
function saveMood(mood) {
  if (!mood) return;
  const today = new Date().toLocaleDateString();

  chrome.storage.local.get(["moodHistory"], (result) => {
    let history = result.moodHistory || {};

    if (!history[today]) {
      history[today] = [];
    }

    const formatted = mood.charAt(0).toUpperCase() + mood.slice(1);

    history[today].push(formatted);

    chrome.storage.local.set({ moodHistory: history });

    console.log("Mood saved:", formatted);
  });
}


// ===============================
// API STATUS
// ===============================
async function checkAPI() {
  const badge = document.getElementById("statusBadge");

  try {
    const res = await fetch(API + "/health");
    if (res.ok) {
      badge.textContent = "Online";
      badge.className = "status online";
    }
  } catch {
    badge.textContent = "Offline";
    badge.className = "status offline";
  }
}
checkAPI();


// ===============================
// UPDATE STATUS
// ===============================
function updateStatus(data) {
  const badge = document.getElementById("statusBadge");

  if (!data || !data.emotion) return;

  const mood = data.emotion;
  const conf = Math.round((data.confidence || 0.9) * 100);

  let text = `${mood} (${conf}%)`;
  if (data.faces_detected && data.faces_detected > 1) {
    text += ` | 👥 ${data.faces_detected}`;
  }

  badge.textContent = text;
  badge.className = "status online";
}


// ===============================
// SELECT MOOD
// ===============================
let currentMood = "";

function selectMood(mood) {
  if (!mood) return;

  const moodChanged = currentMood !== mood;
  currentMood = mood;

  chrome.storage.local.set({ currentMood: mood });

  document.querySelectorAll(".mood-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  const btn = document.querySelector(`[data-mood="${mood}"]`);
  if (btn) btn.classList.add("active");

  applyMoodTheme(mood);

  // ONLY load the playlist and update the UI if the mood actually changed!
  // This completely eliminates the 3-second interface lag and network spam.
  if (moodChanged) {
    loadPlaylist(mood);
  }
}


// ===============================
// BUTTON CLICK HANDLING
// ===============================
document.querySelectorAll(".mood-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const mood = btn.dataset.mood;

    selectMood(mood);
    saveMood(mood);
  });
});


// ===============================
// LOAD PLAYLIST
// ===============================
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
      if (moodLower === "happy") queries = ["bollywood happy hits", "bollywood dance hits", "bollywood feel good", "bollywood upbeat"];
      else if (moodLower === "sad") queries = ["bollywood sad songs", "bollywood emotional", "bollywood heartbreak", "hindi sad melodies"];
      else if (moodLower === "angry") queries = ["bollywood energetic workout", "hindi rock energetic", "bollywood high energy", "hindi powerful songs"];
      else if (moodLower === "neutral") queries = ["bollywood chill lofi", "hindi soothing acoustic", "bollywood soft romantic", "hindi chill travel"];
      else queries = ["bollywood party dance", "bollywood celebration", "hindi wedding dance", "bollywood dynamic club"];
    } else if (langLower === "punjabi") {
      if (moodLower === "happy") queries = ["punjabi happy bhangra", "punjabi dance hits", "punjabi upbeat bhangra", "punjabi high energy bhangra"];
      else if (moodLower === "sad") queries = ["punjabi sad emotional", "punjabi heartbreak", "punjabi sad songs", "punjabi emotional melodies"];
      else if (moodLower === "angry") queries = ["punjabi energetic high bass", "punjabi power hits", "punjabi aggressive workout", "punjabi heavy bass beats"];
      else if (moodLower === "neutral") queries = ["punjabi slow chill lofi", "punjabi acoustic soft", "punjabi sweet romantic", "punjabi relaxing melodies"];
      else queries = ["punjabi dance club", "punjabi party bhangra", "punjabi wedding hits", "punjabi fast beat dance"];
    } else {
      // English / other fallback
      if (moodLower === "happy") queries = ["happy pop hits", "upbeat feel good pop", "summer happy vibes", "feel good classics"];
      else if (moodLower === "sad") queries = ["sad acoustic aesthetic", "melancholy piano romantic", "heartbreak acoustic", "chill sad pop"];
      else if (moodLower === "angry") queries = ["energetic rock gym", "workout motivation power", "aggressive hard rock", "epic motivational trailer"];
      else if (moodLower === "neutral") queries = ["lofi chill study", "relaxing acoustic coffeehouse", "ambient chillout room", "soft acoustic guitar"];
      else queries = ["dance party club", "electronic dance hits", "festival mainstage edm", "groove house dance"];
    }

    const query = queries[Math.floor(Math.random() * queries.length)] || "happy pop hits";
    const randomOffset = Math.floor(Math.random() * 41); // offset between 0 and 40

    console.log(`Querying Spotify Search: "${query}" with offset ${randomOffset}`);
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10&offset=${randomOffset}`;

    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) {
      console.error(`Spotify Search API error ${res.status}:`, await res.text());
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
    console.error("Spotify recommendations search failed (will fallback):", err.message || err);
    return [];
  }
}

function formatTime(time) {
  if (isNaN(time)) return "0:00";
  const min = Math.floor(time / 60);
  const sec = Math.floor(time % 60);
  return `${min}:${sec < 10 ? "0" + sec : sec}`;
}

// ===============================
// LOAD PLAYLIST
// ===============================
// ===============================
// LOAD PLAYLIST
// ===============================
async function loadPlaylist(mood, lang = null) {
  if (!mood) return;
  const container = document.getElementById("playlistContainer");
  container.innerHTML = "Loading...";

  let songs = [];

  // Step 1: Try Spotify auto-generation
  try {
    const resLang = await new Promise(resolve => {
      chrome.storage.local.get(["language", "spotifyAutoGenerate", "spotifyConnected"], resolve);
    });

    const activeLang = lang || resLang.language || "punjabi";

    if (resLang.spotifyConnected && resLang.spotifyAutoGenerate) {
      console.log(`Generating Spotify recommendations for mood: ${mood}, language: ${activeLang}`);
      songs = await generateSpotifyRecommendations(mood, activeLang);
    }

    // Step 2: Fallback to backend if Spotify is off or returned empty
    if (!songs || songs.length === 0) {
      console.log(`Loading curated playlist from backend: ${activeLang}/${mood}`);
      const res = await fetch(`${API}/playlist/${activeLang}/${mood}`);
      if (!res.ok) throw new Error(`Backend returned HTTP ${res.status}`);
      const data = await res.json();
      songs = data.playlist?.songs || [];
      console.log(`Loaded ${songs.length} songs from backend for ${activeLang}/${mood}`);
    }
  } catch (err) {
    console.error("Error in loadPlaylist:", err.message || err);
    container.innerHTML = '<p style="opacity:0.5; font-size:11px; padding: 6px 0; color:#ef4444;">Error loading playlist. Is backend running?</p>';
    return;
  }

  playlist = songs;
  container.innerHTML = "";

  if (playlist.length === 0) {
    container.innerHTML = `<p style="opacity:0.5; font-size:11px; padding: 6px 0;">No songs found. Try changing language or mood.</p>`;
    return;
  }

  playlist.forEach((song, i) => {
    const div = document.createElement("div");
    div.className = "song-item";
    div.innerHTML = `
      <strong>${song.title}</strong> - <span>${song.artist}</span>
      <span style="float:right; font-size:10px; opacity:0.6;">${song.duration || ''}</span>
    `;

    div.onclick = () => {
      currentIndex = i;
      updateNowPlaying();
      highlightActive();

      chrome.storage.local.get(['spotifyConnected'], async (res) => {
        if (res.spotifyConnected) {
          const token = await getSpotifyAccessToken();
          if (token) {
            const success = await playSongSpotify(song);
            if (success) {
              updatePlayBtnIcon(true);
              setSpotifyPlaybackState(true, song, 0);
              ensureDashboardOpen();
            }
          }
        } else {
          if (song.url && (song.url.startsWith("http") || song.url.startsWith("www") || song.url.includes("youtu"))) {
            chrome.tabs.create({ url: song.url });
          }
        }
      });
    };

    container.appendChild(div);
  });

  chrome.storage.local.get(['spotifyPlaybackState'], (resState) => {
    const state = resState.spotifyPlaybackState;
    if (state && state.song) {
      const idx = playlist.findIndex(s => s.spotify_uri === state.song.spotify_uri);
      if (idx !== -1) {
        currentIndex = idx;
      } else {
        currentIndex = 0;
      }
    } else {
      currentIndex = 0;
    }
    updateNowPlaying();
    highlightActive();
  });
}


// ===============================
// NOW PLAYING
// ===============================
function updateNowPlaying() {
  if (!playlist.length) return;

  const song = playlist[currentIndex];
  document.getElementById("songTitle").innerText = song.title;
  document.getElementById("songArtist").innerText = song.artist;
}


// ===============================
// HIGHLIGHT SONG
// ===============================
function highlightActive() {
  document.querySelectorAll(".song-item").forEach((el, i) => {
    el.classList.toggle("active", i === currentIndex);
  });
}

// ===============================
// UPDATE PLAY/PAUSE BUTTON ICON
// ===============================
function updatePlayBtnIcon(isPlaying) {
  const playBtn = document.getElementById("playBtn");
  if (!playBtn) return;
  const img = playBtn.querySelector("img");
  if (!img) return;
  img.src = isPlaying ? "icons/pause-button.png" : "icons/play-button.png";
  img.alt = isPlaying ? "Pause Icon" : "Play Icon";
}


// ===============================
// SPOTIFY HELPERS FOR POPUP
// ===============================
function ensureDashboardOpen() {
  const dashboardUrl = chrome.runtime.getURL("dashboard.html");
  chrome.tabs.query({}, (tabs) => {
    const hasDashboard = tabs.some(tab => tab.url && tab.url.split('?')[0] === dashboardUrl);
    if (!hasDashboard) {
      console.log("No FeelFlow Dashboard tab open. Opening one in background...");
      chrome.tabs.create({ url: dashboardUrl, active: false });
    }
  });
}

function setSpotifyPlaybackState(isPlaying, song, progressMs = 0) {
  chrome.storage.local.set({
    spotifyPlaybackState: {
      isPlaying: isPlaying,
      song: song,
      startTime: Date.now(),
      progressMs: progressMs,
      lastUpdated: Date.now()
    }
  }, () => {
    console.log("Updated spotifyPlaybackState in storage:", isPlaying, song?.title);
  });
}

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

      if (Date.now() + 180 * 1000 >= res.spotifyTokenExpiresAt) {
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
            resolve(null);
          }
        } catch (err) {
          resolve(null);
        }
      } else {
        resolve(res.spotifyAccessToken);
      }
    });
  });
}

async function playSongSpotify(song) {
  const token = await getSpotifyAccessToken();
  if (!token) return false;

  let uri = song.spotify_uri;
  if (!uri) {
    console.log(`Resolving Spotify URI in popup for: ${song.title} - ${song.artist}`);
    const query = encodeURIComponent(`track:${song.title} artist:${song.artist}`);
    try {
      const searchRes = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.tracks && searchData.tracks.items.length > 0) {
          uri = searchData.tracks.items[0].uri;
          song.spotify_uri = uri;
        }
      }
    } catch (err) {
      console.error("Error searching Spotify in popup:", err);
    }
  }

  if (!uri) {
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
      return true;
    } else if (playRes.status === 404) {
      alert("No active Spotify device found. Please open Spotify on your device first.");
      return false;
    } else {
      return false;
    }
  } catch (err) {
    return false;
  }
}

// ===============================
// PLAY / NEXT
// ===============================
document.getElementById("playBtn").onclick = () => {
  if (!playlist.length) return;
  const song = playlist[currentIndex];

  chrome.storage.local.get(['spotifyConnected'], async (res) => {
    if (res.spotifyConnected) {
      const token = await getSpotifyAccessToken();
      if (token) {
        try {
          const playerRes = await fetch("https://api.spotify.com/v1/me/player", {
            headers: { "Authorization": `Bearer ${token}` }
          });

          if (playerRes.status === 200) {
            const playerData = await playerRes.json();
            if (playerData.is_playing) {
              await fetch("https://api.spotify.com/v1/me/player/pause", {
                method: "PUT",
                headers: { "Authorization": `Bearer ${token}` }
              });
              // Update icon to play immediately
              updatePlayBtnIcon(false);
              // Save paused state to storage
              chrome.storage.local.get(['spotifyPlaybackState'], (stateRes) => {
                const oldState = stateRes.spotifyPlaybackState || {};
                const elapsedMs = oldState.isPlaying ? (Date.now() - oldState.startTime) : 0;
                setSpotifyPlaybackState(false, song, (oldState.progressMs || 0) + elapsedMs);
              });
              return;
            }
          }

          const success = await playSongSpotify(song);
          if (success) {
            // Update icon to pause immediately
            updatePlayBtnIcon(true);
            chrome.storage.local.get(['spotifyPlaybackState'], (stateRes) => {
              const oldState = stateRes.spotifyPlaybackState || {};
              const isSameSong = oldState.song && oldState.song.spotify_uri === song.spotify_uri;
              setSpotifyPlaybackState(true, song, isSameSong ? (oldState.progressMs || 0) : 0);
              ensureDashboardOpen();
            });
          }
        } catch (err) {
          console.error("Spotify action failed, fallback to browser tab:", err);
          chrome.tabs.create({ url: song.url });
        }
        return;
      }
    }

    chrome.tabs.create({
      url: song.url
    });
  });
};

document.getElementById("nextBtn").onclick = () => {
  if (!playlist.length) return;

  chrome.storage.local.get(["shuffle", "spotifyConnected"], async (res) => {
    const shuffle = res.shuffle ?? true;
    if (shuffle) {
      currentIndex = Math.floor(Math.random() * playlist.length);
    } else {
      currentIndex = (currentIndex + 1) % playlist.length;
    }

    updateNowPlaying();
    highlightActive();

    const song = playlist[currentIndex];
    if (res.spotifyConnected) {
      const token = await getSpotifyAccessToken();
      if (token) {
        const success = await playSongSpotify(song);
        if (success) {
          updatePlayBtnIcon(true);
          setSpotifyPlaybackState(true, song, 0);
          ensureDashboardOpen();
        }
      }
    }
  });
};


// ===============================
// LOAD SAVED MOOD
// ===============================
chrome.storage.local.get(["currentMood"], (result) => {
  const mood = result.currentMood || "happy";
  selectMood(mood);
});


// ===============================
// CAMERA
// ===============================
const toggle = document.getElementById("cameraToggle");
const video = document.getElementById("video");
const cameraBox = document.getElementById("cameraBox");

toggle.addEventListener("change", async () => {
  if (toggle.checked) {
    cameraBox.classList.remove("hidden");

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      await initFaceDetection();
      startFaceOverlay();
    } catch (err) {
      console.log("Camera not found or permission denied:", err);
    }

    detectLoop();
  } else {
    cameraBox.classList.add("hidden");

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
  }
});


// ===============================
// DETECTION LOOP
// ===============================
async function detectLoop() {
  if (!toggle.checked) return;

  let img = null;

  if (video.videoWidth > 0) {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = 300;
    tempCanvas.height = 300;

    const tempCtx = tempCanvas.getContext("2d");
    const minDim = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - minDim) / 2;
    const sy = (video.videoHeight - minDim) / 2;

    tempCtx.drawImage(video, sx, sy, minDim, minDim, 0, 0, 300, 300);
    img = tempCanvas.toDataURL("image/jpeg", 0.7);
  } else {
    img = "data:image/jpeg;base64,test";
  }

  try {
    const res = await fetch(API + "/emotion", {
      method: "POST",
      body: JSON.stringify({ image: img, mode: detectionMode }),
      headers: { "Content-Type": "application/json" }
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();

    if (!data || data.status !== "success" || !data.emotion) {
      throw new Error(data && data.error ? data.error : "Failed to detect emotion");
    }

    // Temporal smoothing (voting window)
    moodHistoryBuffer.push(data.emotion);
    if (moodHistoryBuffer.length > smoothingWindow) {
      moodHistoryBuffer.shift();
    }

    // Find majority mood
    const counts = {};
    let smoothedEmotion = data.emotion;
    let maxCount = 0;
    for (const mood of moodHistoryBuffer) {
      counts[mood] = (counts[mood] || 0) + 1;
      if (counts[mood] > maxCount) {
        maxCount = counts[mood];
        smoothedEmotion = mood;
      }
    }

    updateStatus({
      emotion: smoothedEmotion,
      confidence: data.confidence,
      faces_detected: data.faces_detected
    });
    selectMood(smoothedEmotion);
    saveMood(smoothedEmotion);

    if (data.face_rect && video.videoWidth > 0) {
      const minDim = Math.min(video.videoWidth, video.videoHeight);
      const sx = (video.videoWidth - minDim) / 2;
      const sy = (video.videoHeight - minDim) / 2;

      lastFaceRect = {
        x: sx + (data.face_rect.x / 300) * minDim,
        y: sy + (data.face_rect.y / 300) * minDim,
        w: (data.face_rect.w / 300) * minDim,
        h: (data.face_rect.h / 300) * minDim,
        emotion: smoothedEmotion,
        confidence: data.confidence
      };
      lastFaceDetectionTime = Date.now();
    } else {
      lastFaceRect = null;
    }

  } catch (err) {
    const moods = ["happy", "sad", "angry", "neutral", "surprise"];
    const random = moods[Math.floor(Math.random() * moods.length)];

    moodHistoryBuffer.push(random);
    if (moodHistoryBuffer.length > smoothingWindow) {
      moodHistoryBuffer.shift();
    }

    const counts = {};
    let smoothedEmotion = random;
    let maxCount = 0;
    for (const m of moodHistoryBuffer) {
      counts[m] = (counts[m] || 0) + 1;
      if (counts[m] > maxCount) {
        maxCount = counts[m];
        smoothedEmotion = m;
      }
    }

    updateStatus({
      emotion: smoothedEmotion,
      confidence: 0.90,
      faces_detected: 1
    });

    selectMood(smoothedEmotion);
    saveMood(smoothedEmotion);

    if (video.videoWidth > 0) {
      const fw = video.videoWidth * 0.4;
      const fh = video.videoHeight * 0.5;
      lastFaceRect = {
        x: (video.videoWidth - fw) / 2,
        y: (video.videoHeight - fh) / 2.5,
        w: fw,
        h: fh,
        emotion: smoothedEmotion,
        confidence: 0.90
      };
      lastFaceDetectionTime = Date.now();
    } else {
      lastFaceRect = null;
    }
  }

  setTimeout(detectLoop, 3000);
}


// ===============================
// 🔥 FACE DETECTOR INIT (NEW)
// ===============================
async function initFaceDetection() {
  if ("FaceDetector" in window) {
    faceDetector = new FaceDetector({
      fastMode: true,
      maxDetectedFaces: 1
    });
  }
}


// ===============================
// 🔥 DRAW BOX (UPDATED)
// ===============================
function drawFaceBox(x, y, width, height, emotion, confidence) {
  const color = emotion ? getEmotionColor(emotion) : "#00ff88";

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);

  const time = Date.now() / 5;
  const scanY = y + (time % height);

  let rgbaColor = "rgba(0,255,136,0.6)";
  if (emotion) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    rgbaColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
  }

  ctx.strokeStyle = rgbaColor;
  ctx.beginPath();
  ctx.moveTo(x, scanY);
  ctx.lineTo(x + width, scanY);
  ctx.stroke();

  if (emotion && confidence !== null) {
    const label = `${emotion.toUpperCase()} (${Math.round(confidence * 100)}%)`;
    ctx.font = "bold 13px 'Inter', sans-serif";
    ctx.textBaseline = "bottom";

    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 24, textWidth + 12, 24);

    ctx.fillStyle = "#0f172a";
    ctx.fillText(label, x + 6, y - 5);
  }
}


// ===============================
// 🔥 FACE TRACKING LOOP (UPDATED)
// ===============================
function startFaceOverlay() {

  async function loop() {

    if (!toggle.checked) return;

    if (!video.videoWidth) {
      requestAnimationFrame(loop);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (lastFaceRect && (Date.now() - lastFaceDetectionTime < 4000)) {
      drawFaceBox(
        lastFaceRect.x,
        lastFaceRect.y,
        lastFaceRect.w,
        lastFaceRect.h,
        lastFaceRect.emotion,
        lastFaceRect.confidence
      );
    } else {
      const pulse = 1 + 0.05 * Math.sin(Date.now() / 200);
      const w = canvas.width * 0.4 * pulse;
      const h = canvas.height * 0.5 * pulse;
      drawFaceBox(
        (canvas.width - w) / 2,
        (canvas.height - h) / 2.5,
        w,
        h,
        null,
        null
      );
    }

    requestAnimationFrame(loop);
  }

  loop();
}


// ===============================
// AUTO START CAMERA
// ===============================
window.addEventListener("load", async () => {
  const langSelect = document.getElementById("languageSelect");
  if (langSelect) {
    chrome.storage.local.get(["language"], (res) => {
      langSelect.value = res.language || "punjabi";
    });
    langSelect.onchange = () => {
      chrome.storage.local.set({ language: langSelect.value }, () => {
        console.log("Language changed to:", langSelect.value);
        chrome.storage.local.get(["currentMood"], (result) => {
          loadPlaylist(result.currentMood || "happy", langSelect.value);
        });
      });
    };
  }

  // Refresh Playlist Button click handler
  const refreshPlaylistBtn = document.getElementById("refreshPlaylistBtn");
  if (refreshPlaylistBtn) {
    refreshPlaylistBtn.onclick = () => {
      refreshPlaylistBtn.disabled = true;
      refreshPlaylistBtn.innerText = "Loading...";
      chrome.storage.local.get(["currentMood", "language"], (resStorage) => {
        loadPlaylist(resStorage.currentMood || "happy", resStorage.language || "punjabi").finally(() => {
          refreshPlaylistBtn.disabled = false;
          refreshPlaylistBtn.innerText = "\u21BB Refresh";
        });
      });
    };
  }

  // Camera is OFF by default (manual activation required)
  toggle.checked = false;
  cameraBox.classList.add("hidden");

  // Spotify Init
  checkSpotifyPopupStatus();

  const autoGenToggle = document.getElementById("spotifyAutoGenerateToggle");
  if (autoGenToggle) {
    chrome.storage.local.get(["spotifyAutoGenerate"], (res) => {
      autoGenToggle.checked = res.spotifyAutoGenerate ?? false;
    });
    autoGenToggle.onchange = () => {
      chrome.storage.local.set({ spotifyAutoGenerate: autoGenToggle.checked }, () => {
        console.log("Spotify AI Auto-generate in popup set to:", autoGenToggle.checked);
        chrome.storage.local.get(["currentMood"], (result) => {
          loadPlaylist(result.currentMood || "happy");
        });
      });
    };
  }

  // Load and apply initial Spotify playback state
  chrome.storage.local.get(['spotifyPlaybackState'], (res) => {
    const state = res.spotifyPlaybackState;
    if (state && state.song) {
      document.getElementById("songTitle").innerText = state.song.title;
      document.getElementById("songArtist").innerText = state.song.artist;

      updatePlayBtnIcon(state.isPlaying);
    }
  });
});

// ===============================
// SPOTIFY INITIALIZATION FOR POPUP
// ===============================
const spotifyPopupConnectBtn = document.getElementById("spotifyPopupConnectBtn");
const spotifyPopupStatus = document.getElementById("spotifyPopupStatus");

async function checkSpotifyPopupStatus() {
  chrome.storage.local.get(['spotifyConnected'], async (res) => {
    if (!res.spotifyConnected) {
      if (spotifyPopupStatus) { spotifyPopupStatus.innerText = "Disconnected"; spotifyPopupStatus.style.color = "#ef4444"; }
      if (spotifyPopupConnectBtn) { spotifyPopupConnectBtn.innerText = "Connect"; spotifyPopupConnectBtn.style.background = "#1db954"; }
      return;
    }
    if (spotifyPopupStatus) { spotifyPopupStatus.innerText = "Connected"; spotifyPopupStatus.style.color = "#1db954"; }
    if (spotifyPopupConnectBtn) { spotifyPopupConnectBtn.innerText = "Disconnect"; spotifyPopupConnectBtn.style.background = "#ef4444"; }
  });
}

if (spotifyPopupConnectBtn) {
  spotifyPopupConnectBtn.onclick = async () => {
    chrome.storage.local.get(['spotifyConnected'], async (res) => {
      if (res.spotifyConnected) {
        // Disconnect
        chrome.storage.local.remove([
          'spotifyAccessToken',
          'spotifyRefreshToken',
          'spotifyTokenExpiresAt',
          'spotifyConnected'
        ], () => {
          checkSpotifyPopupStatus();
        });
      } else {
        // Connect — pre-check backend status first
        spotifyPopupConnectBtn.innerText = "Connecting...";
        spotifyPopupConnectBtn.disabled = true;
        try {
          const statusRes = await fetch("http://127.0.0.1:5000/spotify/status");
          if (!statusRes.ok) {
            alert("⚠️ Backend is not running!\n\nStart it with: python backend/app.py");
            return;
          }
          const statusData = await statusRes.json();
          if (!statusData.configured) {
            alert("⚠️ Spotify credentials not set!\n\nAdd to backend/.env:\n  SPOTIFY_CLIENT_ID=...\n  SPOTIFY_CLIENT_SECRET=...");
            return;
          }

          const extensionId = chrome.runtime.id;
          const loginRes = await fetch(`http://127.0.0.1:5000/spotify/login?extension_id=${extensionId}`);
          if (loginRes.ok) {
            const data = await loginRes.json();
            if (data.status === 'configured') {
              chrome.tabs.create({ url: data.auth_url });
            } else {
              alert("Spotify credentials not configured. Check backend/.env.");
            }
          } else {
            const errData = await loginRes.json().catch(() => ({}));
            alert(errData.error || "Failed to initiate Spotify login.");
          }
        } catch (err) {
          console.error("Popup Spotify connect error:", err);
          alert("⚠️ Cannot reach backend.\n\nIs Flask running on port 5000?");
        } finally {
          spotifyPopupConnectBtn.innerText = "Connect";
          spotifyPopupConnectBtn.disabled = false;
          checkSpotifyPopupStatus();
        }
      }
    });
  };
}


// ===============================
// OPEN DASHBOARD
// ===============================
document.getElementById("openDashboard").addEventListener("click", () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("dashboard.html")
  });
});


// NOTE: Consolidated theme changes in the single storage listener above.