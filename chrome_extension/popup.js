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


// ===============================
// 🔥 SAVE MOOD (NEW)
// ===============================
function saveMood(mood) {
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

  badge.textContent = `${mood} (${conf}%)`;
  badge.className = "status online";
}


// ===============================
// SELECT MOOD
// ===============================
function selectMood(mood) {

  chrome.storage.local.set({ currentMood: mood });

  document.querySelectorAll(".mood-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  const btn = document.querySelector(`[data-mood="${mood}"]`);
  if (btn) btn.classList.add("active");

  loadPlaylist(mood);
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
async function loadPlaylist(mood) {
  const container = document.getElementById("playlistContainer");
  container.innerHTML = "Loading...";

  try {

    // ✅ GET LANGUAGE (default Punjabi)
    const resLang = await new Promise(resolve => {
      chrome.storage.local.get(["language"], resolve);
    });

    const language = resLang.language || "punjabi";

    // ✅ UPDATED API CALL
    const res = await fetch(`${API}/playlist/${language}/${mood}`);
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
// HIGHLIGHT SONG
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
    } catch (err) {
      console.log("Camera not found");
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
    tempCanvas.width = 48;
    tempCanvas.height = 48;

    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(video, 0, 0, 48, 48);

    img = tempCanvas.toDataURL("image/jpeg");
  } else {
    img = "data:image/jpeg;base64,test";
  }

  try {
    const res = await fetch(API + "/emotion", {
      method: "POST",
      body: JSON.stringify({ image: img }),
      headers: { "Content-Type": "application/json" }
    });

    const data = await res.json();

    updateStatus(data);
    selectMood(data.emotion);
    saveMood(data.emotion);

  } catch (err) {

    const moods = ["happy","sad","angry","neutral","surprise"];
    const random = moods[Math.floor(Math.random()*moods.length)];

    updateStatus({
      emotion: random,
      confidence: 0.90
    });

    selectMood(random);
    saveMood(random);
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
function drawFaceBox(x, y, width, height) {

  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);

  const time = Date.now() / 5;
  const scanY = y + (time % height);

  ctx.strokeStyle = "rgba(0,255,136,0.6)";
  ctx.beginPath();
  ctx.moveTo(x, scanY);
  ctx.lineTo(x + width, scanY);
  ctx.stroke();
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

    if (faceDetector) {
      const faces = await faceDetector.detect(video);

      faces.forEach(face => {
        const { x, y, width, height } = face.boundingBox;
        drawFaceBox(x, y, width, height);
      });

    } else {
      drawFaceBox(
        canvas.width * 0.3,
        canvas.height * 0.25,
        canvas.width * 0.4,
        canvas.height * 0.5
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
  chrome.storage.local.get(["language"], (res) => {
  if (!res.language) {
    chrome.storage.local.set({ language: "punjabi" });
  }
});
  toggle.checked = true;
  cameraBox.classList.remove("hidden");

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;

    await initFaceDetection(); // 🔥 added

    detectLoop();
    startFaceOverlay();

  } catch {
    detectLoop();
  }
});


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