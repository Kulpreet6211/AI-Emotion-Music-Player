// ===============================
// CREATE ALARM BASED ON TIMER
// ===============================
function createAlarm(minutes) {
  // chrome.alarms.clear("rescanAlarm");

  chrome.alarms.create("rescanAlarm", {
    delayInMinutes: Number(minutes)
  });

  console.log("✅ Alarm set for", minutes, "minutes");
}

// ===============================
// STOP ALARM (🔥 NEW)
// ===============================
function stopAlarm() {
  chrome.alarms.clear("rescanAlarm");
  console.log("⛔ Alarm stopped (API OFF)");
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  // =========================
  // TIMER UPDATE
  // =========================
  if (changes.rescanTime) {
    chrome.storage.local.set({
      rescanTime: changes.rescanTime.newValue
    });
    createAlarm(changes.rescanTime.newValue);
  }

  // =========================
  // NOTIFICATION TOGGLE FIX
  // =========================
  if (changes.enableNotif) {
    const isEnabled = changes.enableNotif.newValue;
    if (isEnabled) {
      console.log("🔔 Notifications ENABLED → restarting timer automatically");
      chrome.storage.local.get(["rescanTime"], (result) => {
        const time = result.rescanTime || 5;
        createAlarm(time);
      });
    } else {
      console.log("🔕 Notifications DISABLED → stopping alarm");
      stopAlarm();
    }
  }

  // =========================
  // PLAYBACK STATE SYNC
  // =========================
  if (changes.localPlaybackState || changes.spotifyPlaybackState || changes.spotifyConnected) {
    updateNotificationPlayer();
  }
});

// ===============================
// LISTEN FOR DIRECT MESSAGE
// ===============================
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "updateTimer") {

    // 🔥 ADDED: persist last selected timer
    chrome.storage.local.set({
      rescanTime: msg.time
    });

    createAlarm(msg.time);
  }
});

// ===============================
// INITIAL LOAD
// ===============================
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["rescanTime"], (result) => {
    createAlarm(result.rescanTime || 5);
  });
});


// 🔥🔥🔥 ADDED FIX: RESTORE TIMER WHEN EXTENSION STARTS / RELOADS
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(["rescanTime"], (result) => {
    const savedTime = result.rescanTime || 5;

    console.log("🔄 Restoring last selected timer:", savedTime);

    createAlarm(savedTime);
  });
});


// ===============================
// WHEN ALARM TRIGGERS (STRICT MODE)
// ===============================
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "rescanAlarm") return;

  try {
    const res = await fetch("http://127.0.0.1:5000/health");

    // ❌ API DOWN → STOP TIMER COMPLETELY
    if (!res.ok) {
      console.log("⚠️ API not OK → stopping timer");
      stopAlarm();
      return;
    }

    // 🔔 CHECK NOTIFICATION TOGGLE
    chrome.storage.local.get(["enableNotif"], (result) => {
      const enabled = result.enableNotif ?? true;

      if (!enabled) {
        console.log("🔕 Notifications OFF → skipping");
        return;
      }

      console.log("✅ Showing notification");
      showNotification();
    });

  } catch (err) {
    // ❌ API NOT REACHABLE → STOP TIMER
    console.log("❌ API OFF → stopping timer completely");
    stopAlarm();
  }
});

// ===============================
// SHOW NOTIFICATION
// ===============================
function showNotification() {
  chrome.notifications.create("rescanMood", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "FeelFlow",
    message: "Do you want to rescan your mood?",
    buttons: [
      { title: "Yes" },
      { title: "No" }
    ],
    priority: 2
  });
}

// ===============================
// HANDLE BUTTON CLICK
// ===============================
chrome.notifications.onButtonClicked.addListener((notifId, btnIndex) => {
  if (notifId === "feelFlowPlayer") {
    if (btnIndex === 0) {
      chrome.runtime.sendMessage({ action: "playerControl", command: "togglePlay" }, () => {
        if (chrome.runtime.lastError) { /* ignore console warning if pages are closed */ }
      });
    } else if (btnIndex === 1) {
      chrome.runtime.sendMessage({ action: "playerControl", command: "nextSong" }, () => {
        if (chrome.runtime.lastError) { /* ignore console warning if pages are closed */ }
      });
    }
    return;
  }

  // Handle rescan alarm notification click
  chrome.storage.local.get(["rescanTime"], (result) => {
    const time = result.rescanTime || 5;

    if (btnIndex === 0) {
      chrome.windows.create({
        url: chrome.runtime.getURL("popup.html"),
        type: "popup",
        width: 420,
        height: 650,
        focused: true
      });
      console.log("User clicked YES → opened popup extension");
    } else {
      console.log("User clicked NO");
    }

    createAlarm(time);
  });
});

// ===============================
// HANDLE NOTIFICATION BODY CLICK
// ===============================
chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId === "feelFlowPlayer") {
    const dashboardUrl = chrome.runtime.getURL("dashboard.html");
    chrome.tabs.query({}, (tabs) => {
      const dashboardTab = tabs.find(tab => tab.url && tab.url.split('?')[0] === dashboardUrl);
      if (dashboardTab) {
        chrome.tabs.update(dashboardTab.id, { active: true });
        if (dashboardTab.windowId) {
          chrome.windows.update(dashboardTab.windowId, { focused: true });
        }
      } else {
        chrome.tabs.create({ url: dashboardUrl });
      }
    });
  }
});

// ===============================
// UPDATE NOTIFICATION PLAYER
// ===============================
function updateNotificationPlayer() {
  chrome.storage.local.get(["spotifyConnected", "localPlaybackState", "spotifyPlaybackState"], (res) => {
    const isSpotify = res.spotifyConnected ?? false;
    const state = isSpotify ? res.spotifyPlaybackState : res.localPlaybackState;

    if (state && state.song) {
      const isPlaying = state.isPlaying;
      const title = state.song.title || "Unknown Track";
      const artist = state.song.artist || "Unknown Artist";

      chrome.notifications.create("feelFlowPlayer", {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: title,
        message: artist,
        buttons: [
          { title: isPlaying ? "⏸ Pause" : "▶ Play" },
          { title: "⏭ Next" }
        ],
        priority: 2
      });
    } else {
      chrome.notifications.clear("feelFlowPlayer");
    }
  });
}