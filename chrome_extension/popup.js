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
// SELECT MOOD (MAIN FUNCTION)
// ===============================
function selectMood(mood) {
  // ✅ Save mood globally
  chrome.storage.local.set({ currentMood: mood });

  // ✅ UI update
  document.querySelectorAll(".mood-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  const btn = document.querySelector(`[data-mood="${mood}"]`);
  if (btn) btn.classList.add("active");

  // ✅ Load playlist
  loadPlaylist(mood);
}


// ===============================
// BUTTON CLICK HANDLING
// ===============================
document.querySelectorAll(".mood-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    selectMood(btn.dataset.mood); // ✅ FIXED
  });
});


// ===============================
// LOAD PLAYLIST
// ===============================
async function loadPlaylist(mood) {
  const container = document.getElementById("playlistContainer");
  container.innerHTML = "Loading...";

  try {
    const res = await fetch(`${API}/playlist/${mood}`);
    const data = await res.json();

    playlist = data.playlist.songs;

    container.innerHTML = "";

    playlist.forEach((song, i) => {
      const div = document.createElement("div");
      div.className = "song-item";
      div.innerText = `${song.title} - ${song.artist}`;

      div.onclick = () => {
        currentIndex = i;
        updateNowPlaying();
        highlightActive();
      };

      container.appendChild(div);
    });

    currentIndex = 0;
    updateNowPlaying();
    highlightActive();

  } catch (err) {
    console.error(err);
    container.innerHTML = "Error loading playlist";
  }
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
// HIGHLIGHT ACTIVE SONG
// ===============================
function highlightActive() {
  document.querySelectorAll(".song-item").forEach((el, i) => {
    el.classList.toggle("active", i === currentIndex);
  });
}


// ===============================
// PLAY / NEXT
// ===============================
document.getElementById("playBtn").onclick = () => {
  if (!playlist.length) return;

  chrome.tabs.create({
    url: playlist[currentIndex].url
  });
};

document.getElementById("nextBtn").onclick = () => {
  if (!playlist.length) return;

  currentIndex = (currentIndex + 1) % playlist.length;
  updateNowPlaying();
  highlightActive();
};


// ===============================
// LOAD SAVED MOOD ON START
// ===============================
chrome.storage.local.get(["currentMood"], (result) => {
  const mood = result.currentMood || "happy";
  selectMood(mood); // ✅ VERY IMPORTANT
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

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;

    detectLoop();
  } else {
    cameraBox.classList.add("hidden");
  }
});


// ===============================
// DETECTION LOOP
// ===============================
async function detectLoop() {
  if (!toggle.checked) return;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  const img = canvas.toDataURL("image/jpeg");

  try {
    const res = await fetch(API + "/detect", {
      method: "POST",
      body: JSON.stringify({ image: img }),
      headers: { "Content-Type": "application/json" }
    });

    const data = await res.json();

    autoSelectMood(data.mood);

  } catch {}

  setTimeout(detectLoop, 3000);
}


// ===============================
// AUTO SELECT (CAMERA)
// ===============================
function autoSelectMood(mood) {
  selectMood(mood); // ✅ FIXED (no click hack)
}


// ===============================
// OPEN DASHBOARD
// ===============================
document.getElementById("openDashboard").addEventListener("click", () => {
    chrome.tabs.create({
        url: chrome.runtime.getURL("dashboard.html")
    });
});


// ===============================
// THEME SYNC
// ===============================
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.theme) {
        const newTheme = changes.theme.newValue;

        if (newTheme === "light") {
            document.body.classList.add("light");
        } else {
            document.body.classList.remove("light");
        }
    }
});