const API_URL = "http://localhost:5000";

let stream = null;
let isDetecting = false;
let currentMood = null;
let currentPlaylist = null;
let currentSongIndex = 0;
let lastMoodChangeTime = 0;
const MOOD_CHANGE_DELAY = 3000;

const moodButtons = document.querySelectorAll(".mood-btn");
const useCameraCheckbox = document.getElementById("useCameraCheckbox");
const cameraSection = document.getElementById("cameraSection");
const camera = document.getElementById("camera");
const canvas = document.getElementById("canvas");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const playlistContainer = document.getElementById("playlistContainer");
const songTitle = document.getElementById("songTitle");
const songArtist = document.getElementById("songArtist");
const apiStatusDot = document.getElementById("apiStatus");
const apiStatusText = document.getElementById("apiStatusText");
const playBtn = document.getElementById("playBtn");
const nextBtn = document.getElementById("nextBtn");

document.addEventListener("DOMContentLoaded", function() {
    console.log("Extension loaded");
    checkAPIHealth();
    setupMoodButtons();
    setupCameraToggle();
    setupPlayButtons();
});

function checkAPIHealth() {
    fetch(API_URL + "/health")
        .then(r => r.ok ? Promise.resolve() : Promise.reject())
        .then(() => {
            apiStatusDot.className = "status-dot online";
            apiStatusText.textContent = "API: Online";
            console.log("✅ API is online");
        })
        .catch(() => {
            apiStatusDot.className = "status-dot offline";
            apiStatusText.textContent = "API: Offline";
            console.log("❌ API is offline");
        });
}

function setupMoodButtons() {
    moodButtons.forEach(btn => {
        btn.addEventListener("click", function() {
            selectMood(this.getAttribute("data-mood"));
        });
    });
}

function selectMood(mood) {
    currentMood = mood;
    console.log("Selected mood: " + mood);
    
    moodButtons.forEach(btn => btn.classList.remove("active"));
    document.querySelector('[data-mood="' + mood + '"]').classList.add("active");
    
    loadPlaylist(mood);
}

function setupCameraToggle() {
    useCameraCheckbox.addEventListener("change", function() {
        if (this.checked) {
            startCamera();
        } else {
            stopCamera();
        }
    });
    
    stopCameraBtn.addEventListener("click", function() {
        useCameraCheckbox.checked = false;
        stopCamera();
    });
}

function setupPlayButtons() {
    playBtn.addEventListener("click", playCurrentSong);
    nextBtn.addEventListener("click", nextSong);
}

async function startCamera() {
    try {
        cameraSection.style.display = "block";
        stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
        });
        camera.srcObject = stream;
        isDetecting = true;
        lastMoodChangeTime = Date.now();
        detectEmotionLoop();
    } catch (error) {
        alert("Camera access denied");
        useCameraCheckbox.checked = false;
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    isDetecting = false;
    cameraSection.style.display = "none";
}

async function detectEmotionLoop() {
    if (!isDetecting) return;
    
    try {
        const frame = captureFrame();
        const response = await fetch(API_URL + "/emotion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: frame })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === "success") {
                const now = Date.now();
                if (now - lastMoodChangeTime > MOOD_CHANGE_DELAY && data.emotion !== currentMood) {
                    console.log("Emotion detected: " + data.emotion);
                    selectMood(data.emotion);
                    lastMoodChangeTime = now;
                }
            }
        }
    } catch (error) {
        console.error("Error:", error);
    }
    
    setTimeout(detectEmotionLoop, 500);
}

function captureFrame() {
    canvas.width = camera.videoWidth;
    canvas.height = camera.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(camera, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.8);
}

async function loadPlaylist(mood) {
    try {
        console.log("Loading playlist for: " + mood);
        const response = await fetch(API_URL + "/playlist/" + mood);
        if (response.ok) {
            const data = await response.json();
            console.log("Playlist data:", data);
            if (data.status === "success") {
                currentPlaylist = { mood: mood, songs: data.playlist.songs };
                currentSongIndex = 0;
                displayPlaylist();
                displayCurrentSong();
            }
        }
    } catch (error) {
        console.error("Error loading playlist:", error);
    }
}

function displayPlaylist() {
    playlistContainer.innerHTML = "";
    if (!currentPlaylist || !currentPlaylist.songs) {
        playlistContainer.innerHTML = '<p class="empty-message">No songs in playlist</p>';
        return;
    }
    
    console.log("Displaying " + currentPlaylist.songs.length + " songs");
    
    currentPlaylist.songs.forEach(function(song, index) {
        const item = document.createElement("div");
        const isActive = index === currentSongIndex;
        item.className = "playlist-item" + (isActive ? " active" : "");
        item.innerHTML = '<p class="playlist-item-title">' + song.title + '</p><p class="playlist-item-artist">' + song.artist + '</p>';
        
        item.addEventListener("click", function() {
            currentSongIndex = index;
            displayPlaylist();
            displayCurrentSong();
        });
        
        playlistContainer.appendChild(item);
    });
}

function displayCurrentSong() {
    if (!currentPlaylist || !currentPlaylist.songs[currentSongIndex]) {
        songTitle.textContent = "No song";
        songArtist.textContent = "-";
        return;
    }
    const song = currentPlaylist.songs[currentSongIndex];
    songTitle.textContent = song.title;
    songArtist.textContent = song.artist;
    console.log("Now playing: " + song.title);
}

function playCurrentSong() {
    if (!currentPlaylist || !currentPlaylist.songs[currentSongIndex]) {
        alert("No song selected");
        return;
    }
    
    const song = currentPlaylist.songs[currentSongIndex];
    console.log("Opening: " + song.url);
    
    // Open song URL in new tab
    chrome.tabs.create({ url: song.url });
}

function nextSong() {
    if (!currentPlaylist || !currentPlaylist.songs.length) return;
    
    currentSongIndex = (currentSongIndex + 1) % currentPlaylist.songs.length;
    displayPlaylist();
    displayCurrentSong();
    console.log("Next song: " + currentPlaylist.songs[currentSongIndex].title);
}