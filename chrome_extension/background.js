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

chrome.storage.onChanged.addListener((changes) => {

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
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Emotion Player",
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