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

// ===============================
// LOAD PLAYLIST
// ===============================
async function loadPlaylist(mood = "happy") {
    try {
        currentMood = mood;

        const res = await fetch(`http://127.0.0.1:5000/playlist/${language}/${mood}`);
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

    if (!audio) {
        console.error("Audio element not found");
        return;
    }

    audio.src = song.url;

    document.getElementById("songTitle").innerText = song.title;
    document.getElementById("songArtist").innerText = song.artist;

    console.log("Loaded:", song.title);

    // ❌ REMOVE auto play
    // playSong();

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
   // playBtn.innerText = "⏸";
}

function pauseSong() {
    audio.pause();
    isPlaying = false;
    playBtn.innerText = "▶";
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
if(prevBtn) {
    prevBtn.onclick = () => {
        if (!currentPlaylist.length) return;

        currentIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
        loadSong(currentIndex);
        playSong(); // 🔥 force play on click
    };
}

if (nextBtn) {
    nextBtn.onclick = () => {
        if (!currentPlaylist.length) return;

        currentIndex = (currentIndex + 1) % currentPlaylist.length;
        loadSong(currentIndex);

        audio.play().then(() => {
            isPlaying = true;
            playBtn.innerText = "⏸";
        }).catch(() => {});
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
        nextBtn.click();
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
    volumeSlider.oninput = () => {
        audio.volume = volumeSlider.value;
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
    language = result.language || "punjabi"; // 🔥 IMPORTANT

    loadPlaylist(mood);
    saveMood(mood.toLowerCase());
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.currentMood) {
        const mood = changes.currentMood.newValue;

        loadPlaylist(mood);
        saveMood(mood.toLowerCase());
    }
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

  // Load saved or default Punjabi
chrome.storage.local.get(["language"], (res) => {
    const lang = res.language || "punjabi";
    language = lang; // 🔥 ADD THIS
    langSelect.value = lang;
});

  langSelect.addEventListener("change", () => {
    const lang = langSelect.value;

    chrome.storage.local.set({ language: lang });

    console.log("Language selected:", lang);

    // 🔥 Reload playlist based on current mood
    loadPlaylist(currentMood);
  });
}