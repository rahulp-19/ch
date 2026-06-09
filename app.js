// app.js - NikkuChat Core Logic
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getDatabase, 
  ref, 
  set, 
  push, 
  onValue, 
  onDisconnect, 
  serverTimestamp,
  limitToLast,
  query
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { 
  getStorage, 
  ref as storageRef, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { firebaseConfig, APP_CONFIG } from "./firebase-config.js";

// ==========================================================================
// 1. App State & Global Variables
// ==========================================================================
let db, storage;
let currentUser = localStorage.getItem("nikku_chat_user") || null;
let partnerUser = null;
let databaseConnected = false;

// Media Recording variables
let mediaRecorder = null;
let audioChunks = [];
let recordingInterval = null;
let recordingStartTime = null;

// Typing Indicator variables
let typingTimeout = null;
let isCurrentlyTyping = false;

// DOM Cache
const passcodeScreen = document.getElementById("passcodeScreen");
const passcodeForm = document.getElementById("passcodeForm");
const passcodeField = document.getElementById("passcodeField");
const passcodeCard = document.getElementById("passcodeCard");
const passcodeErrorMsg = document.getElementById("passcodeErrorMsg");

const userSelectorScreen = document.getElementById("userSelectorScreen");
const userSelectCards = document.querySelectorAll(".user-select-card");

const chatDashboard = document.getElementById("chatDashboard");
const logoutBtn = document.getElementById("logoutBtn");
const partnerAvatar = document.getElementById("partnerAvatar");
const partnerInitials = document.getElementById("partnerInitials");
const partnerPresenceDot = document.getElementById("partnerPresenceDot");
const partnerName = document.getElementById("partnerName");
const partnerStatusText = document.getElementById("partnerStatusText");
const relationshipDays = document.getElementById("relationshipDays");

const chatArea = document.getElementById("chatArea");
const messagesList = document.getElementById("messagesList");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");
const voiceRecordBtn = document.getElementById("voiceRecordBtn");

const chatImageInput = document.getElementById("chatImageInput");
const galleryUploadInput = document.getElementById("galleryUploadInput");
const galleryToggleBtn = document.getElementById("galleryToggleBtn");
const galleryDrawer = document.getElementById("galleryDrawer");
const galleryCloseBtn = document.getElementById("galleryCloseBtn");
const galleryGrid = document.getElementById("galleryGrid");
const galleryUploadProgress = document.getElementById("galleryUploadProgress");
const galleryProgressBarFill = document.getElementById("galleryProgressBarFill");
const galleryProgressText = document.getElementById("galleryProgressText");

const voiceRecordingOverlay = document.getElementById("voiceRecordingOverlay");
const recordingTimer = document.getElementById("recordingTimer");
const voiceCancelBtn = document.getElementById("voiceCancelBtn");
const voiceStopAndSendBtn = document.getElementById("voiceStopAndSendBtn");

const typingIndicatorWrapper = document.getElementById("typingIndicatorWrapper");
const typingIndicatorText = document.getElementById("typingIndicatorText");

const emojiPanelBtn = document.getElementById("emojiPanelBtn");
const emojiPicker = document.getElementById("emojiPicker");
const emojiPickerClose = document.getElementById("emojiPickerClose");
const emojiBtnItems = document.querySelectorAll(".emoji-btn-item");

const lightboxModal = document.getElementById("lightboxModal");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxCloseBtn = document.getElementById("lightboxCloseBtn");

// ==========================================================================
// 2. State Machine & Routing Transitions
// ==========================================================================
function initApp() {
  generateFloatingHearts();
  
  // State 1: Check if passcode has been verified previously
  const isPasscodeVerified = localStorage.getItem("nikku_chat_passcode_verified") === "true";
  
  if (!isPasscodeVerified) {
    showScreen("passcode");
  } else if (!currentUser) {
    showScreen("selector");
  } else {
    showScreen("chat");
    startChatApplication();
  }
  
  setupAuthEventListeners();
}

function showScreen(screen) {
  passcodeScreen.classList.add("hidden");
  userSelectorScreen.classList.add("hidden");
  chatDashboard.classList.add("hidden");
  
  if (screen === "passcode") {
    passcodeScreen.classList.remove("hidden");
    passcodeField.focus();
  } else if (screen === "selector") {
    userSelectorScreen.classList.remove("hidden");
  } else if (screen === "chat") {
    chatDashboard.classList.remove("hidden");
  }
}

function setupAuthEventListeners() {
  // Passcode submission
  passcodeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const entered = passcodeField.value.trim();
    
    if (entered === APP_CONFIG.PASSCODE) {
      localStorage.setItem("nikku_chat_passcode_verified", "true");
      passcodeErrorMsg.classList.remove("visible");
      showScreen("selector");
    } else {
      // Shake animation on error
      passcodeCard.classList.add("shake");
      passcodeErrorMsg.classList.add("visible");
      passcodeField.value = "";
      
      setTimeout(() => {
        passcodeCard.classList.remove("shake");
      }, 400);
    }
  });

  // User Profile Select Click
  userSelectCards.forEach(card => {
    card.addEventListener("click", () => {
      const selectedUser = card.getAttribute("data-user");
      currentUser = selectedUser;
      localStorage.setItem("nikku_chat_user", selectedUser);
      showScreen("chat");
      startChatApplication();
    });
  });

  // Log Out / Profile Reset Click
  logoutBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to lock and log out of your profile?")) {
      // Disconnect status from Firebase immediately
      updatePresenceStatus("offline");
      
      localStorage.removeItem("nikku_chat_user");
      localStorage.removeItem("nikku_chat_passcode_verified");
      currentUser = null;
      partnerUser = null;
      
      // Reload page to reset all memory variables cleanly
      window.location.reload();
    }
  });
}

// ==========================================================================
// 3. Core Chat Initialization (Firebase & Context Setup)
// ==========================================================================
function startChatApplication() {
  // Identify partner user
  partnerUser = currentUser === "Rahul" ? "Nikku" : "Rahul";
  
  // Initialize UI variables for user & partner
  partnerName.textContent = partnerUser;
  partnerInitials.textContent = partnerUser.charAt(0);
  
  // Set up anniversary relationship counter
  updateAnniversaryCounter();
  setInterval(updateAnniversaryCounter, 60000); // refresh every minute

  // Adjust avatar classes
  partnerAvatar.className = `user-avatar-small ${partnerUser.toLowerCase()}-bg`;
  
  // Initialize Firebase (Only once)
  try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    storage = getStorage(app);
    
    // Trigger listeners & presence
    setupFirebasePresence();
    setupTypingDetection();
    listenToMessages();
    listenToTypingIndicator();
    listenToGallery();
    setupChatControls();
  } catch (error) {
    console.error("Firebase Initialization Failed:", error);
    alert("Could not load Firebase. Check your settings in firebase-config.js.");
  }
}

// ==========================================================================
// 4. Firebase Connection & Presence System
// ==========================================================================
function setupFirebasePresence() {
  const connectedRef = ref(db, ".info/connected");
  const myStatusRef = ref(db, `status/${currentUser}`);
  
  onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      databaseConnected = true;
      
      // Set online status in database
      const onlineStatus = {
        state: "online",
        last_changed: serverTimestamp()
      };
      
      set(myStatusRef, onlineStatus);
      
      // On connection drop, set offline status
      onDisconnect(myStatusRef).set({
        state: "offline",
        last_changed: serverTimestamp()
      });
    } else {
      databaseConnected = false;
    }
  });
  
  // Listen to partner presence
  const partnerStatusRef = ref(db, `status/${partnerUser}`);
  onValue(partnerStatusRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      partnerPresenceDot.classList.remove("online");
      partnerStatusText.textContent = "Offline";
      return;
    }
    
    if (data.state === "online") {
      partnerPresenceDot.classList.add("online");
      partnerStatusText.textContent = "online";
    } else {
      partnerPresenceDot.classList.remove("online");
      if (data.last_changed) {
        partnerStatusText.textContent = getRelativeTime(data.last_changed);
      } else {
        partnerStatusText.textContent = "Offline";
      }
    }
  });
}

function updatePresenceStatus(state) {
  if (db && currentUser) {
    set(ref(db, `status/${currentUser}`), {
      state: state,
      last_changed: serverTimestamp()
    });
  }
}

// ==========================================================================
// 5. Typing Detection Logic
// ==========================================================================
function setupTypingDetection() {
  messageInput.addEventListener("input", () => {
    if (!isCurrentlyTyping && messageInput.value.trim().length > 0) {
      setTypingState(true);
    }
    
    // Clear typing animation timer
    clearTimeout(typingTimeout);
    
    // If user stops typing for 1.5s, update typing status in DB
    typingTimeout = setTimeout(() => {
      setTypingState(false);
    }, 1500);
  });
}

function setTypingState(typing) {
  isCurrentlyTyping = typing;
  if (db && currentUser) {
    set(ref(db, `typing/${currentUser}`), typing);
  }
}

function listenToTypingIndicator() {
  const partnerTypingRef = ref(db, `typing/${partnerUser}`);
  onValue(partnerTypingRef, (snapshot) => {
    const isTyping = snapshot.val();
    if (isTyping === true) {
      typingIndicatorText.textContent = `${partnerUser} is typing...`;
      typingIndicatorWrapper.classList.remove("hidden");
      autoScrollToBottom();
    } else {
      typingIndicatorWrapper.classList.add("hidden");
    }
  });
}

// ==========================================================================
// 6. Real-Time Messages Pull & Custom Message UI Rendering
// ==========================================================================
function listenToMessages() {
  const messagesQuery = query(ref(db, "messages"), limitToLast(200));
  
  onValue(messagesQuery, (snapshot) => {
    // Empty existing container
    messagesList.innerHTML = "";
    
    const messagesData = snapshot.val();
    if (!messagesData) {
      messagesList.innerHTML = `
        <div class="chat-loading">
          <i class="fa-solid fa-heart pulse"></i>
          <p>No messages yet. Send a heart to get started! 💖</p>
        </div>
      `;
      return;
    }
    
    let lastDateString = "";
    
    // Iterate and render messages sorted by key (keys are push IDs which auto-sort by time)
    Object.keys(messagesData).forEach(msgId => {
      const msg = messagesData[msgId];
      const msgDate = new Date(msg.timestamp || Date.now());
      const dateString = msgDate.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      // Inject date separators
      if (dateString !== lastDateString) {
        lastDateString = dateString;
        const separator = document.createElement("div");
        separator.className = "date-separator";
        separator.innerHTML = `<span class="date-badge">${formatDateHeader(msgDate)}</span>`;
        messagesList.appendChild(separator);
      }
      
      // Build message element
      const messageRow = document.createElement("div");
      const isSent = msg.sender === currentUser;
      messageRow.className = `message-row ${isSent ? 'sent' : 'received'}`;
      
      // Format Timestamp
      const formattedTime = msgDate.toLocaleTimeString(undefined, { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
      });
      
      // Build message HTML contents
      let bodyHTML = "";
      if (msg.imageUrl) {
        bodyHTML = `
          <div class="message-image-wrapper" data-src="${msg.imageUrl}">
            <img src="${msg.imageUrl}" alt="Shared Image">
          </div>
        `;
      } else if (msg.audioUrl) {
        bodyHTML = `
          <div class="voice-player" data-audio-id="${msgId}">
            <button class="play-pause-btn" id="playBtn-${msgId}" title="Play Voice Note">
              <i class="fa-solid fa-play"></i>
            </button>
            <div class="voice-controls-right">
              <div class="voice-progress-container" id="progressContainer-${msgId}">
                <div class="voice-progress-bar" id="progressBar-${msgId}"></div>
              </div>
              <div class="voice-time-info">
                <span id="currentTime-${msgId}">0:00</span>
                <span id="duration-${msgId}">0:00</span>
              </div>
            </div>
            <audio id="audioElement-${msgId}" src="${msg.audioUrl}" preload="metadata"></audio>
          </div>
        `;
      } else {
        bodyHTML = `<div class="message-text">${escapeHTML(msg.text)}</div>`;
      }
      
      // Build Reaction badges HTML
      let reactionBadgesHTML = "";
      if (msg.reactions) {
        const reactionsArray = [];
        Object.keys(msg.reactions).forEach(user => {
          if (msg.reactions[user]) {
            reactionsArray.push(msg.reactions[user]);
          }
        });
        
        if (reactionsArray.length > 0) {
          reactionBadgesHTML = `
            <div class="reaction-badge-list">
              ${reactionsArray.map(emoji => `<span class="reaction-badge-item">${emoji}</span>`).join("")}
            </div>
          `;
        }
      }
      
      // Create reaction popover panel content
      const reactionPopoverHTML = `
        <div class="reaction-popover">
          <button class="reaction-pop-btn" data-emoji="❤️" data-msg-id="${msgId}">❤️</button>
          <button class="reaction-pop-btn" data-emoji="😂" data-msg-id="${msgId}">😂</button>
          <button class="reaction-pop-btn" data-emoji="😍" data-msg-id="${msgId}">😍</button>
          <button class="reaction-pop-btn" data-emoji="👍" data-msg-id="${msgId}">👍</button>
          <button class="reaction-pop-btn" data-emoji="😭" data-msg-id="${msgId}">😭</button>
        </div>
      `;
      
      messageRow.innerHTML = `
        <div class="message-bubble-wrapper">
          ${reactionPopoverHTML}
          <div class="message-bubble">
            ${bodyHTML}
            <div class="message-meta">
              <span>${formattedTime}</span>
              ${isSent ? '<i class="fa-solid fa-check-double" style="margin-left:2px; font-size:9px;"></i>' : ''}
            </div>
            ${reactionBadgesHTML}
          </div>
        </div>
      `;
      
      messagesList.appendChild(messageRow);
    });
    
    // Set up audio player hooks and reaction events
    setupAudioPlayersInChat();
    setupReactionListeners();
    setupImageClickZoom();
    
    autoScrollToBottom();
  });
}

function setupChatControls() {
  // Input heights auto-resize
  messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = (messageInput.scrollHeight) + "px";
    
    // Toggle send vs record button visibility
    const textVal = messageInput.value.trim();
    if (textVal.length > 0) {
      sendMessageBtn.classList.remove("hidden");
      voiceRecordBtn.classList.add("hidden");
    } else {
      sendMessageBtn.classList.add("hidden");
      voiceRecordBtn.classList.remove("hidden");
    }
  });

  // Sending a message
  sendMessageBtn.addEventListener("click", sendTextMessage);
  
  // Enter key submits message, Shift+Enter adds new line
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  });

  // Emoji Panel trigger buttons
  emojiPanelBtn.addEventListener("click", () => {
    emojiPicker.classList.toggle("hidden");
  });
  
  emojiPickerClose.addEventListener("click", () => {
    emojiPicker.classList.add("hidden");
  });
  
  emojiBtnItems.forEach(btn => {
    btn.addEventListener("click", () => {
      const emoji = btn.getAttribute("data-emoji");
      messageInput.value += emoji;
      messageInput.focus();
      
      // Manually trigger input event for auto-resize and button toggle
      messageInput.dispatchEvent(new Event("input"));
      emojiPicker.classList.add("hidden");
    });
  });

  // Chat attachment file trigger
  chatImageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadFileToFirebase(file, false);
      // Reset input
      chatImageInput.value = "";
    }
  });

  // Shared Gallery Upload zone
  galleryUploadInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadFileToFirebase(file, true);
      galleryUploadInput.value = "";
    }
  });

  // Gallery slider toggles
  galleryToggleBtn.addEventListener("click", () => {
    galleryDrawer.classList.toggle("open");
  });
  
  galleryCloseBtn.addEventListener("click", () => {
    galleryDrawer.classList.remove("open");
  });

  // Lightbox Close trigger
  lightboxCloseBtn.addEventListener("click", () => {
    lightboxModal.classList.add("hidden");
    lightboxImg.src = "";
  });
  lightboxModal.addEventListener("click", (e) => {
    if (e.target === lightboxModal) {
      lightboxModal.classList.add("hidden");
      lightboxImg.src = "";
    }
  });

  // Setup Voice Notes logic
  setupVoiceRecorder();
}

// ==========================================================================
// 7. Message Dispatchers (Text, Images, Audio Files)
// ==========================================================================
function sendTextMessage() {
  const text = messageInput.value.trim();
  if (text.length === 0) return;
  
  // Reset fields
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendMessageBtn.classList.add("hidden");
  voiceRecordBtn.classList.remove("hidden");
  
  setTypingState(false);
  clearTimeout(typingTimeout);
  
  // Send message write to RTDB
  const messagesRef = ref(db, "messages");
  push(messagesRef, {
    sender: currentUser,
    text: text,
    timestamp: serverTimestamp()
  }).catch(err => {
    console.error("Message send failed:", err);
  });
}

function uploadFileToFirebase(file, isGalleryDrawerUpload) {
  if (!db || !storage) return;
  
  const timestamp = Date.now();
  const fileExtension = file.name.split('.').pop();
  const uniqueName = `photos/${timestamp}_${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;
  
  const fileRef = storageRef(storage, uniqueName);
  
  // Show progress indicator
  galleryUploadProgress.classList.remove("hidden");
  galleryProgressBarFill.style.width = "0%";
  galleryProgressText.textContent = "Uploading 0%";
  
  // Start upload
  uploadBytes(fileRef, file).then((snapshot) => {
    getDownloadURL(snapshot.ref).then((downloadURL) => {
      // Hide progress
      galleryUploadProgress.classList.add("hidden");
      
      // Save message image entry
      const messagesRef = ref(db, "messages");
      const messagePromise = push(messagesRef, {
        sender: currentUser,
        imageUrl: downloadURL,
        timestamp: serverTimestamp()
      });
      
      // Also record under gallery node for catalog grid
      const galleryRef = ref(db, "gallery");
      const galleryPromise = push(galleryRef, {
        url: downloadURL,
        uploader: currentUser,
        timestamp: serverTimestamp()
      });
      
      Promise.all([messagePromise, galleryPromise]).then(() => {
        if (isGalleryDrawerUpload) {
          alert("Photo added to love gallery and sent in chat! 📸💖");
        }
      });
    });
  }).catch(error => {
    console.error("File upload failed:", error);
    alert("File upload failed. Please verify storage permissions.");
    galleryUploadProgress.classList.add("hidden");
  });
}

// ==========================================================================
// 8. Custom Audio Player Bindings
// ==========================================================================
function setupAudioPlayersInChat() {
  const players = messagesList.querySelectorAll(".voice-player");
  players.forEach(player => {
    const msgId = player.getAttribute("data-audio-id");
    const audio = player.querySelector(`#audioElement-${msgId}`);
    const btn = player.querySelector(`#playBtn-${msgId}`);
    const icon = btn.querySelector("i");
    const progressContainer = player.querySelector(`#progressContainer-${msgId}`);
    const progressBar = player.querySelector(`#progressBar-${msgId}`);
    const curTimeTxt = player.querySelector(`#currentTime-${msgId}`);
    const durTxt = player.querySelector(`#duration-${msgId}`);
    
    // Format Seconds to MM:SS
    const formatTime = (secs) => {
      if (isNaN(secs) || !isFinite(secs)) return "0:00";
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60).toString().padStart(2, "0");
      return `${m}:${s}`;
    };
    
    // Set duration meta
    audio.addEventListener("loadedmetadata", () => {
      durTxt.textContent = formatTime(audio.duration);
    });
    
    // Fallback if metadata already loaded
    if (audio.duration) {
      durTxt.textContent = formatTime(audio.duration);
    }
    
    // Play/Pause button
    btn.addEventListener("click", () => {
      // Pause all other media
      messagesList.querySelectorAll("audio").forEach(otherAudio => {
        if (otherAudio !== audio && !otherAudio.paused) {
          otherAudio.pause();
        }
      });
      
      if (audio.paused) {
        audio.play().catch(err => console.log("Play interrupted:", err));
      } else {
        audio.pause();
      }
    });
    
    // Track playing state animations
    audio.addEventListener("play", () => {
      icon.className = "fa-solid fa-pause";
      // Clear other play buttons
      messagesList.querySelectorAll(".voice-player").forEach(otherPlayer => {
        if (otherPlayer !== player) {
          const otherIcon = otherPlayer.querySelector(".play-pause-btn i");
          if (otherIcon) otherIcon.className = "fa-solid fa-play";
        }
      });
    });
    
    audio.addEventListener("pause", () => {
      icon.className = "fa-solid fa-play";
    });
    
    audio.addEventListener("ended", () => {
      icon.className = "fa-solid fa-play";
      progressBar.style.width = "0%";
      curTimeTxt.textContent = "0:00";
    });
    
    // Progress fill update
    audio.addEventListener("timeupdate", () => {
      if (audio.duration) {
        const pct = (audio.currentTime / audio.duration) * 100;
        progressBar.style.width = `${pct}%`;
        curTimeTxt.textContent = formatTime(audio.currentTime);
      }
    });
    
    // Seeking timeline
    progressContainer.addEventListener("click", (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = clickX / rect.width;
      if (audio.duration) {
        audio.currentTime = pct * audio.duration;
      }
    });
  });
}

// ==========================================================================
// 9. Emoji Reactions Actions
// ==========================================================================
function setupReactionListeners() {
  // Add listeners to reaction popover options
  const popoverBtns = messagesList.querySelectorAll(".reaction-pop-btn");
  popoverBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const emoji = btn.getAttribute("data-emoji");
      const msgId = btn.getAttribute("data-msg-id");
      
      const reactionPath = ref(db, `messages/${msgId}/reactions/${currentUser}`);
      
      // Get current value to toggle (if clicking same reaction, delete it)
      onValue(reactionPath, (snapshot) => {
        const currentReaction = snapshot.val();
        if (currentReaction === emoji) {
          set(reactionPath, null); // Remove reaction
        } else {
          set(reactionPath, emoji); // Update reaction
        }
      }, { onlyOnce: true });
      
      // Close popover trigger wrapper
      const wrapper = btn.closest(".message-bubble-wrapper");
      if (wrapper) wrapper.classList.remove("popover-open");
    });
  });
  
  // Mobile touch hold toggle popover helper
  const bubbleWrappers = messagesList.querySelectorAll(".message-bubble-wrapper");
  bubbleWrappers.forEach(wrap => {
    let pressTimer;
    
    // Handle tap toggles on mobile
    wrap.addEventListener("click", (e) => {
      // Toggle only if clicked on bubble itself, and ignore triggers on controls/images
      if (e.target.closest(".play-pause-btn") || e.target.closest(".voice-progress-container") || e.target.closest(".message-image-wrapper")) {
        return;
      }
      
      // Clear other open popovers
      bubbleWrappers.forEach(otherWrap => {
        if (otherWrap !== wrap) otherWrap.classList.remove("popover-open");
      });
      
      wrap.classList.toggle("popover-open");
    });
    
    // Close popover when clicking anywhere else
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove("popover-open");
      }
    });
  });
}

// ==========================================================================
// 10. Voice Recorder (Audio Capturing & Uploading)
// ==========================================================================
function setupVoiceRecorder() {
  voiceRecordBtn.addEventListener("click", async () => {
    // Request permission and start recording
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Voice recording is not supported in this browser. Please use a modern browser.");
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startRecording(stream);
    } catch (err) {
      console.error("Microphone Access Blocked:", err);
      alert("Microphone permission was denied. Please allow microphone access to record voice notes.");
    }
  });

  voiceCancelBtn.addEventListener("click", cancelRecording);
  voiceStopAndSendBtn.addEventListener("click", stopAndSendRecording);
}

function startRecording(stream) {
  // Set UI State
  voiceRecordingOverlay.classList.remove("hidden");
  messageInput.classList.add("hidden");
  emojiPanelBtn.classList.add("hidden");
  
  audioChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  });
  
  mediaRecorder.addEventListener("stop", () => {
    // Stop all audio capture track channels
    stream.getTracks().forEach(track => track.stop());
  });

  mediaRecorder.start();
  recordingStartTime = Date.now();
  
  // Start HUD Timer clock
  updateRecordingTimer();
  recordingInterval = setInterval(updateRecordingTimer, 1000);
}

function updateRecordingTimer() {
  const elapsed = Date.now() - recordingStartTime;
  const secsTotal = Math.floor(elapsed / 1000);
  const m = Math.floor(secsTotal / 60);
  const s = Math.floor(secsTotal % 60).toString().padStart(2, "0");
  recordingTimer.textContent = `${m}:${s}`;
}

function cancelRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  
  clearInterval(recordingInterval);
  voiceRecordingOverlay.classList.add("hidden");
  messageInput.classList.remove("hidden");
  emojiPanelBtn.classList.remove("hidden");
  
  audioChunks = [];
  mediaRecorder = null;
}

function stopAndSendRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  
  // Setup listener to upload when compile is finalized
  mediaRecorder.addEventListener("stop", () => {
    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    uploadVoiceNoteToFirebase(audioBlob);
  });
  
  mediaRecorder.stop();
  
  // Reset recording timers and widgets
  clearInterval(recordingInterval);
  voiceRecordingOverlay.classList.add("hidden");
  messageInput.classList.remove("hidden");
  emojiPanelBtn.classList.remove("hidden");
}

function uploadVoiceNoteToFirebase(audioBlob) {
  if (!db || !storage) return;
  
  const timestamp = Date.now();
  const fileRef = storageRef(storage, `voice_notes/${timestamp}.webm`);
  
  uploadBytes(fileRef, audioBlob).then((snapshot) => {
    getDownloadURL(snapshot.ref).then((downloadURL) => {
      // Save entry under chat messages RTDB
      const messagesRef = ref(db, "messages");
      push(messagesRef, {
        sender: currentUser,
        audioUrl: downloadURL,
        timestamp: serverTimestamp()
      });
    });
  }).catch(err => {
    console.error("Audio recording upload failed:", err);
    alert("Could not upload voice note. Please check permissions.");
  });
}

// ==========================================================================
// 11. Image Zoom Overlay Lightbox
// ==========================================================================
function setupImageClickZoom() {
  const imgWrappers = messagesList.querySelectorAll(".message-image-wrapper");
  imgWrappers.forEach(wrap => {
    wrap.addEventListener("click", () => {
      const src = wrap.getAttribute("data-src");
      lightboxImg.src = src;
      lightboxModal.classList.remove("hidden");
    });
  });
}

// ==========================================================================
// 12. Shared Photo Gallery Sync
// ==========================================================================
function listenToGallery() {
  const galleryRef = ref(db, "gallery");
  
  onValue(galleryRef, (snapshot) => {
    galleryGrid.innerHTML = "";
    
    const data = snapshot.val();
    if (!data) {
      galleryGrid.innerHTML = `<p class="empty-gallery-msg">No shared photos yet. Send some in chat or upload here! 📸</p>`;
      return;
    }
    
    // Sort array by newest uploads first
    const items = [];
    Object.keys(data).forEach(key => {
      items.push(data[key]);
    });
    items.sort((a, b) => b.timestamp - a.timestamp);
    
    items.forEach(item => {
      const card = document.createElement("div");
      card.className = "gallery-item";
      card.innerHTML = `<img src="${item.url}" alt="Gallery upload by ${item.uploader}" loading="lazy">`;
      
      // Zoom photo in lightbox on click
      card.addEventListener("click", () => {
        lightboxImg.src = item.url;
        lightboxModal.classList.remove("hidden");
      });
      
      galleryGrid.appendChild(card);
    });
  });
}

// ==========================================================================
// 13. Auxiliary Helper & Decorative Functions
// ==========================================================================
function updateAnniversaryCounter() {
  const startStr = APP_CONFIG.RELATIONSHIP_START_DATE;
  const startDate = new Date(startStr);
  const now = new Date();
  
  // Calculate day difference
  const diffTime = now - startDate;
  const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
  
  relationshipDays.textContent = diffDays;
}

function getRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  
  if (secs < 60) return "Last seen just now";
  if (mins < 60) return `Last seen ${mins}m ago`;
  if (hours < 24) return `Last seen ${hours}h ago`;
  return `Last seen ${days}d ago`;
}

function formatDateHeader(dateObj) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  
  if (dateObj.toDateString() === now.toDateString()) {
    return "Today";
  } else if (dateObj.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  } else {
    return dateObj.toLocaleDateString(undefined, { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }
}

function autoScrollToBottom() {
  // Smooth scroll message element container
  chatArea.scrollTo({
    top: chatArea.scrollHeight,
    behavior: "smooth"
  });
}

function generateFloatingHearts() {
  const container = document.getElementById("heartBgContainer");
  if (!container) return;
  
  const heartSymbols = ["❤️", "💖", "💕", "💘", "💜"];
  
  // Generate a floating heart periodically
  setInterval(() => {
    // Only generate if app passcode screen or selectors are showing, or occasionally in chat
    // Limit total hearts on screen to prevent performance lag
    if (container.children.length > 25) {
      container.removeChild(container.firstChild);
    }
    
    const heart = document.createElement("div");
    heart.className = "floating-heart";
    heart.textContent = heartSymbols[Math.floor(Math.random() * heartSymbols.length)];
    
    // Styling properties randomized
    const size = Math.random() * 1.5 + 0.8; // scale size
    const left = Math.random() * 100; // start left offset pct
    const duration = Math.random() * 10 + 8; // speed
    const delay = Math.random() * 2; // offset delay
    
    heart.style.left = `${left}%`;
    heart.style.fontSize = `${size}rem`;
    heart.style.animationDuration = `${duration}s`;
    heart.style.animationDelay = `${delay}s`;
    
    container.appendChild(heart);
  }, 1000);
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Auto-initialize application
document.addEventListener("DOMContentLoaded", initApp);
