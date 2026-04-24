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


// ===============================
// LOAD PLAYLIST
// ===============================
async function loadPlaylist(mood = "happy") {
    try {
        currentMood = mood;

        const res = await fetch(`http://127.0.0.1:5000/playlist/${mood}`);
        const data = await res.json();

        currentPlaylist = data.playlist.songs || [];
        currentIndex = 0;

        renderPlaylist(currentPlaylist);
        loadSong(currentIndex);

    } catch (err) {
        console.error("Error loading playlist:", err);
    }
}


// ===============================
// LOAD SONG
// ===============================
function loadSong(index) {
    if (!currentPlaylist.length) return;

    currentIndex = index;
    const song = currentPlaylist[index];

    audio.src = song.url;

    document.getElementById("songTitle").innerText = song.title;
    document.getElementById("songArtist").innerText = song.artist;

    playSong();
    renderPlaylist(currentPlaylist);
}


// ===============================
// PLAY / PAUSE
// ===============================
function playSong() {
    audio.play().catch(() => {
        console.warn("Autoplay blocked");
    });

    isPlaying = true;
    playBtn.innerText = "⏸";
}

function pauseSong() {
    audio.pause();
    isPlaying = false;
    playBtn.innerText = "▶";
}


// ===============================
// THEME SYSTEM (SYNC WITH POPUP)
// ===============================
const themeToggleHome = document.getElementById("themeToggleHome");
const themeToggleSettings = document.getElementById("themeToggleSettings");

// Load theme
chrome.storage.local.get(["theme"], (result) => {
    if (result.theme === "light") {
        document.body.classList.add("light");
    }
    updateThemeIcon();
});

// Toggle
function toggleTheme() {
    document.body.classList.toggle("light");

    const isLight = document.body.classList.contains("light");

    chrome.storage.local.set({
        theme: isLight ? "light" : "dark"
    });

    updateThemeIcon();
}

// Update icon
function updateThemeIcon() {
    const isLight = document.body.classList.contains("light");

    if (themeToggleHome) {
        themeToggleHome.innerText = isLight ? "☀️" : "🌙";
    }

    if (themeToggleSettings) {
        themeToggleSettings.innerText = isLight ? "☀️ Toggle Theme" : "🌙 Toggle Theme";
    }
}

// Button events
if (themeToggleHome) themeToggleHome.onclick = toggleTheme;
if (themeToggleSettings) themeToggleSettings.onclick = toggleTheme;

// Listen for changes (from popup)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.theme) {
        const newTheme = changes.theme.newValue;

        if (newTheme === "light") {
            document.body.classList.add("light");
        } else {
            document.body.classList.remove("light");
        }

        updateThemeIcon();
    }
});


// ===============================
// BUTTON CONTROLS
// ===============================
playBtn.onclick = () => {
    if (!currentPlaylist.length) return;

    if (isPlaying) pauseSong();
    else playSong();
};

nextBtn.onclick = () => {
    if (!currentPlaylist.length) return;

    currentIndex = (currentIndex + 1) % currentPlaylist.length;
    loadSong(currentIndex);
};


// ===============================
// PROGRESS BAR
// ===============================
audio.addEventListener("timeupdate", () => {
    if (!audio.duration) return;

    const progress = (audio.currentTime / audio.duration) * 100;
    progressBar.style.width = progress + "%";

    currentTimeEl.innerText = formatTime(audio.currentTime);
    durationEl.innerText = formatTime(audio.duration);
});


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
// AUTO NEXT
// ===============================
audio.addEventListener("ended", () => {
    nextBtn.click();
});


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
// RENDER PLAYLIST
// ===============================
function renderPlaylist(songs) {
    const container = document.getElementById("playlist");
    if (!container) return;

    container.innerHTML = "";

    songs.forEach((song, index) => {
        const div = document.createElement("div");
        div.className = "song-item";

        if (index === currentIndex) {
            div.classList.add("active");
        }

        div.innerHTML = `
            <strong>${song.title}</strong><br>
            <span>${song.artist}</span>
        `;

        div.onclick = () => loadSong(index);

        container.appendChild(div);
    });
}


// ===============================
// SETTINGS
// ===============================
const clearBtn = document.getElementById("clearData");

if (clearBtn) {
    clearBtn.onclick = () => {
        chrome.storage.local.clear(); // ✅ FIXED (not localStorage)
        alert("Data cleared!");
    };
}


// ===============================
// INIT (SYNC WITH POPUP MOOD)
// ===============================
chrome.storage.local.get(["currentMood"], (result) => {
    const mood = result.currentMood || "happy";
    loadPlaylist(mood);
});

// 🔥 LIVE SYNC (IMPORTANT FIX)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.currentMood) {
        loadPlaylist(changes.currentMood.newValue);
    }
});