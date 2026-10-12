/**
 * Pulse — Real Online P2P Multi-Peer Video, Audio & Chat Application
 * Features:
 * - Studio Multi-View Navigation: Video Studio, Audio Space Stage, Call History & Launcher
 * - Interactive Audio Space: Host speaking wave ripples, hand raise queue, stage approval
 * - Call History & Instant Launcher: Random room generator, call back, missed call tracking
 * - Local Studio Recorder: MediaRecorder client recording with 1-click WebM download
 * - Virtual Background: Studio blur and glow filter toggle
 * - In-Call Media: Voice note audio memos and image attachments in P2P chat
 * - AV Device Selector & Speaker Test modal with live VU meter
 * - E2EE Direct Channels, Low-Bandwidth adaptation, and Call Endurance keep-alive
 */

(function () {
  'use strict';

  // Read URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room') || 'pulse-room';
  const isSecondTab = window.location.hash.includes('peer') || urlParams.get('peer') === '2';
  const defaultName = isSecondTab ? 'Peer-2' : 'Host';
  const userName = urlParams.get('user') || defaultName;

  // App State
  const state = {
    roomId,
    userName,
    currentView: 'video',  // 'video', 'spaces', 'history'
    callSeconds: 0,
    timerInterval: null,
    isP2PConnected: false,
    webrtc: null,
    activePeers: new Map(), // socketId -> { id, name, stream, isSpeaking, isMuted }
    layoutMode: 'grid',    // 'grid' or 'spotlight'
    pinnedPeerId: null,    // socketId of pinned/spotlight peer
    globalFitMode: 'cover', // 'cover' or 'contain'
    pipSizeIndex: 1,       // 0: S (130px), 1: M (180px), 2: L (260px), 3: XL (340px)
    mobileView: 'stage',   // 'stage' or 'chat'
    unreadChatCount: 0,
    isStudioBlur: false,
    isRecording: false,
    mediaRecorder: null,
    recordedChunks: [],
    recordSeconds: 0,
    recordInterval: null,
    voiceRecorder: null,
    voiceChunks: [],
    isVoiceRecording: false,
    voiceTimer: 0,
    voiceInterval: null,
    audioSpace: null,
    hasRaisedHand: false,
    callLogs: [],
    historyTab: 'all',     // 'all' or 'missed'
    historyFilter: 'all'   // 'all', 'video', 'audio', 'space'
  };

  const PIP_SIZES = [
    { label: 'S', width: 130 },
    { label: 'M', width: 180 },
    { label: 'L', width: 260 },
    { label: 'XL', width: 340 }
  ];

  // Socket.io for Signaling & State Sync
  const socket = io();

  // DOM elements - Global
  const toastEl = document.getElementById('app-toast');
  const audioUnlockBanner = document.getElementById('audio-unlock-banner');
  const callTimerEl = document.getElementById('call-timer');
  const p2pDot = document.getElementById('p2p-dot');
  const p2pStatusLabel = document.getElementById('p2p-status-label');
  const copyInviteBtn = document.getElementById('copy-invite-btn');

  // Navigation Tabs & Views
  const navTabVideo = document.getElementById('navTabVideo');
  const navTabSpaces = document.getElementById('navTabSpaces');
  const navTabHistory = document.getElementById('navTabHistory');
  const viewVideoStudio = document.getElementById('viewVideoStudio');
  const viewAudioSpace = document.getElementById('viewAudioSpace');
  const viewCallsHistory = document.getElementById('viewCallsHistory');
  const quickSpacesBtn = document.getElementById('quickSpacesBtn');
  const returnToCallBtn = document.getElementById('returnToCallBtn');

  // Video Stage DOM elements
  const videoStage = document.getElementById('videoStage');
  const videoGrid = document.getElementById('videoGrid');
  const remotePlaceholder = document.getElementById('remotePlaceholder');
  const invitePeerBtn = document.getElementById('invite-peer-btn');
  const pipBox = document.getElementById('pipBox');
  const localVideoEl = document.getElementById('localVideo');
  const pipBlurBtn = document.getElementById('pipBlurBtn');
  const studioBlurBtn = document.getElementById('studioBlurBtn');
  const recordCallBtn = document.getElementById('recordCallBtn');
  const recordingPill = document.getElementById('recordingPill');
  const recordingTimer = document.getElementById('recordingTimer');
  const stopRecordBtn = document.getElementById('stopRecordBtn');
  const leaveCallBtn = document.getElementById('leaveCallBtn');

  // Video Controls
  const toggleMicBtn = document.getElementById('toggleMicBtn');
  const micIcon = document.getElementById('micIcon');
  const toggleCamBtn = document.getElementById('toggleCamBtn');
  const camIcon = document.getElementById('camIcon');
  const shareScreenBtn = document.getElementById('shareScreenBtn');
  const audioOnlyBtn = document.getElementById('audioOnlyBtn');
  const audioOnlyIcon = document.getElementById('audioOnlyIcon');
  const camFlipBtn = document.getElementById('camFlipBtn');
  const pipFlipCamBtn = document.getElementById('pipFlipCamBtn');
  const viewGridBtn = document.getElementById('viewGridBtn');
  const viewSpotlightBtn = document.getElementById('viewSpotlightBtn');
  const toggleFitBtn = document.getElementById('toggleFitBtn');
  const fitIcon = document.getElementById('fitIcon');
  const fitText = document.getElementById('fitText');
  const stageFullscreenBtn = document.getElementById('stageFullscreenBtn');
  const stageFullscreenIcon = document.getElementById('stageFullscreenIcon');
  const dockFullscreenBtn = document.getElementById('dockFullscreenBtn');
  const dockFullscreenIcon = document.getElementById('dockFullscreenIcon');
  const pipSizeBtn = document.getElementById('pipSizeBtn');
  const pipFitBtn = document.getElementById('pipFitBtn');
  const pipFullscreenBtn = document.getElementById('pipFullscreenBtn');
  const pipResizeHandle = document.getElementById('pipResizeHandle');
  const pipDragHandle = document.getElementById('pipDragHandle');

  // Bandwidth Telemetry
  const bandwidthBtn = document.getElementById('bandwidthBtn');
  const bandwidthLabel = document.getElementById('bandwidthLabel');
  const bandwidthIcon = document.getElementById('bandwidthIcon');
  const netLatency = document.getElementById('netLatency');

  // Mobile Controls
  const mobileTabCallBtn = document.getElementById('mobileTabCallBtn');
  const mobileTabChatBtn = document.getElementById('mobileTabChatBtn');
  const mobileUnreadBadge = document.getElementById('mobileUnreadBadge');
  const dockChatBtn = document.getElementById('dockChatBtn');
  const dockUnreadBadge = document.getElementById('dockUnreadBadge');
  const mobileBackToCallBtn = document.getElementById('mobileBackToCallBtn');

  // Chat Elements
  const chatSection = document.getElementById('chatSection');
  const chatStream = document.getElementById('chat-stream');
  const chatInput = document.getElementById('chat-input');
  const sendMsgBtn = document.getElementById('send-msg-btn');
  const emojiQuickBtn = document.getElementById('emoji-quick-btn');
  const typingIndicator = document.getElementById('typing-indicator');
  const typingText = document.getElementById('typing-text');
  const chatOnlinePill = document.getElementById('chatOnlinePill');
  const exportChatBtn = document.getElementById('exportChatBtn');
  const voiceNoteBtn = document.getElementById('voiceNoteBtn');
  const voiceNoteRecBar = document.getElementById('voiceNoteRecBar');
  const voiceRecTimer = document.getElementById('voiceRecTimer');
  const cancelVoiceNoteBtn = document.getElementById('cancelVoiceNoteBtn');
  const chatFileInput = document.getElementById('chatFileInput');

  // Settings Modal Elements
  const settingsModalBtn = document.getElementById('settingsModalBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const cameraSelect = document.getElementById('cameraSelect');
  const micSelect = document.getElementById('micSelect');
  const micVuBar = document.getElementById('micVuBar');
  const vuLevelText = document.getElementById('vuLevelText');
  const testSpeakerBtn = document.getElementById('testSpeakerBtn');
  const diagRtt = document.getElementById('diagRtt');

  // Audio Space Elements
  const spaceTopicTag = document.getElementById('spaceTopicTag');
  const spaceListenersCount = document.getElementById('spaceListenersCount');
  const spaceTitle = document.getElementById('spaceTitle');
  const spaceDesc = document.getElementById('spaceDesc');
  const spaceSpeakersGrid = document.getElementById('spaceSpeakersGrid');
  const spaceSpeakerBadge = document.getElementById('spaceSpeakerBadge');
  const handRaisesList = document.getElementById('handRaisesList');
  const handRaisesBadge = document.getElementById('handRaisesBadge');
  const spaceAudienceGrid = document.getElementById('spaceAudienceGrid');
  const spaceHandBtn = document.getElementById('spaceHandBtn');
  const spaceHandBtnText = document.getElementById('spaceHandBtnText');
  const spaceMicBtn = document.getElementById('spaceMicBtn');
  const spaceLeaveBtn = document.getElementById('spaceLeaveBtn');

  // Call History Elements
  const launcherRoomInput = document.getElementById('launcherRoomInput');
  const randomizeRoomBtn = document.getElementById('randomizeRoomBtn');
  const launchVideoBtn = document.getElementById('launchVideoBtn');
  const launchSpaceBtn = document.getElementById('launchSpaceBtn');
  const historyTabAll = document.getElementById('historyTabAll');
  const historyTabMissed = document.getElementById('historyTabMissed');
  const callLogsContainer = document.getElementById('callLogsContainer');

  // ==========================================
  // AUDIO SYNTHESIZER (STUDIO CHIMES)
  // ==========================================
  function playStudioChime(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'join') {
        // Ascending harmonic chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'message') {
        // Soft bubble pop
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'speaker-test') {
        // Harmonic studio bell
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.3); // G5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.start(now);
        osc.stop(now + 0.75);
      } else if (type === 'leave') {
        // Descending tone
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.2);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch (e) {
      // AudioContext unavailable or blocked
    }
  }

  // ==========================================
  // INITIALIZE WEBRTC / WEBSOCKET MEDIA
  // ==========================================
  const webrtc = new WebRTCManager(
    socket,
    // On Remote Stream Received (Real Online Peer)
    (remoteSocketId, stream) => {
      console.log('[Mesh] Real remote peer stream connected:', remoteSocketId);
      const existingData = state.activePeers.get(remoteSocketId) || {};
      addRemotePeer(remoteSocketId, {
        id: remoteSocketId,
        name: existingData.name || `Peer (${remoteSocketId.slice(0, 4)})`,
        stream,
        isSpeaking: false,
        isMuted: false
      });
      updateGridUI();
      setP2PStatus(true);
      playStudioChime('join');
      showToast(`Connected with ${state.activePeers.get(remoteSocketId)?.name || 'peer'}`);
    },
    // On Remote Stream Removed
    (remoteSocketId) => {
      console.log('[Mesh] Remote peer stream disconnected:', remoteSocketId);
      if (state.pinnedPeerId === remoteSocketId) {
        state.pinnedPeerId = null;
      }
      removeRemotePeer(remoteSocketId);
      updateGridUI();
      playStudioChime('leave');
      if (state.activePeers.size === 0) {
        setP2PStatus(false);
      }
    },
    // On Audio Volume (Local Visualizer & Settings VU meter)
    (volume) => {
      const pipBars = document.querySelectorAll('.pip-soundwave-bar');
      pipBars.forEach((bar, index) => {
        const height = Math.max(2, Math.min(14, (volume / 100) * 14 * (0.7 + (index % 2) * 0.3)));
        bar.style.height = `${height}px`;
      });
      if (micVuBar) {
        micVuBar.style.width = `${Math.min(100, volume * 1.4)}%`;
      }
    },
    // On P2P Direct Data Message
    (senderSocketId, payload) => {
      handleP2PMessage(senderSocketId, payload);
    },
    // On P2P State Change
    (senderSocketId, channelState) => {
      console.log(`[Mesh] Channel (${senderSocketId}) state: ${channelState}`);
      setP2PStatus(channelState === 'open' || state.activePeers.size > 0);
    }
  );

  if (webrtc.setRoomId) {
    webrtc.setRoomId(state.roomId);
  }
  state.webrtc = webrtc;

  // ==========================================
  // TOP MULTI-VIEW NAVIGATION
  // ==========================================
  function setAppView(view) {
    state.currentView = view;

    // Reset view tabs
    [navTabVideo, navTabSpaces, navTabHistory].forEach(tab => {
      if (tab) {
        tab.className = 'flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 rounded-full text-on-surface-variant hover:text-on-surface transition-all';
      }
    });

    // Hide all views
    if (viewVideoStudio) viewVideoStudio.classList.add('hidden');
    if (viewAudioSpace) viewAudioSpace.classList.add('hidden');
    if (viewCallsHistory) viewCallsHistory.classList.add('hidden');

    if (view === 'video') {
      if (navTabVideo) navTabVideo.className = 'flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 rounded-full bg-primary text-on-primary font-bold shadow-sm transition-all';
      if (viewVideoStudio) viewVideoStudio.classList.remove('hidden');
    } else if (view === 'spaces') {
      if (navTabSpaces) navTabSpaces.className = 'flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 rounded-full bg-secondary text-on-secondary font-bold shadow-sm transition-all relative';
      if (viewAudioSpace) viewAudioSpace.classList.remove('hidden');
      loadAudioSpace();
    } else if (view === 'history') {
      if (navTabHistory) navTabHistory.className = 'flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 rounded-full bg-surface-container-high text-on-surface font-bold shadow-sm transition-all';
      if (viewCallsHistory) viewCallsHistory.classList.remove('hidden');
      loadCallLogs();
    }
  }

  // ==========================================
  // REAL ONLINE PEER GRID & SIZING MANAGEMENT
  // ==========================================
  function addRemotePeer(peerId, peerData) {
    state.activePeers.set(peerId, peerData);
    updatePeerCounters();
  }

  function removeRemotePeer(peerId) {
    state.activePeers.delete(peerId);
    const cardEl = document.getElementById(`peer-card-${peerId}`);
    if (cardEl) cardEl.remove();
    updatePeerCounters();
  }

  function updatePeerCounters() {
    const totalOnline = state.activePeers.size + 1; // local + remote
    if (chatOnlinePill) {
      chatOnlinePill.textContent = `${totalOnline} Online`;
    }
    setP2PStatus(state.activePeers.size > 0);
  }

  function updateGridUI() {
    if (!videoGrid) return;
    const count = state.activePeers.size;

    if (count === 0) {
      if (remotePlaceholder) remotePlaceholder.classList.remove('hidden');
      videoGrid.className = 'w-full h-full grid gap-2 sm:gap-3 transition-all duration-300 peer-grid-1';
      return;
    }

    if (remotePlaceholder) remotePlaceholder.classList.add('hidden');

    // 1. Spotlight Mode
    if (state.layoutMode === 'spotlight' || state.pinnedPeerId) {
      let pinnedId = state.pinnedPeerId;
      if (!pinnedId || !state.activePeers.has(pinnedId)) {
        pinnedId = state.activePeers.keys().next().value;
        state.pinnedPeerId = pinnedId;
      }

      videoGrid.className = 'w-full h-full peer-grid-spotlight relative overflow-hidden transition-all duration-300';
      let thumbStrip = videoGrid.querySelector('.thumbnail-strip');
      if (!thumbStrip) {
        thumbStrip = document.createElement('div');
        thumbStrip.className = 'thumbnail-strip';
      }

      state.activePeers.forEach((peer, peerId) => {
        let cardEl = document.getElementById(`peer-card-${peerId}`);
        if (!cardEl) cardEl = createPeerCardElement(peerId, peer);

        const videoEl = cardEl.querySelector('video');
        if (videoEl && peer.stream && videoEl.srcObject !== peer.stream) {
          playRemoteVideo(videoEl, peer.stream);
        }

        if (peerId === pinnedId) {
          cardEl.classList.add('pinned');
          if (cardEl.parentElement !== videoGrid) {
            videoGrid.insertBefore(cardEl, thumbStrip);
          }
        } else {
          cardEl.classList.remove('pinned');
          thumbStrip.appendChild(cardEl);
        }
      });

      if (thumbStrip.children.length > 0 && !videoGrid.contains(thumbStrip)) {
        videoGrid.appendChild(thumbStrip);
      } else if (thumbStrip.children.length === 0 && videoGrid.contains(thumbStrip)) {
        thumbStrip.remove();
      }
      updateLayoutToolbarUI();
      return;
    }

    // 2. Normal Grid Mode
    const existingStrip = videoGrid.querySelector('.thumbnail-strip');
    if (existingStrip) {
      Array.from(existingStrip.children).forEach(c => videoGrid.appendChild(c));
      existingStrip.remove();
    }

    videoGrid.className = 'w-full h-full grid gap-2 sm:gap-3 transition-all duration-300';
    if (count === 1) videoGrid.classList.add('peer-grid-1');
    else if (count === 2) videoGrid.classList.add('peer-grid-2');
    else if (count <= 4) videoGrid.classList.add('peer-grid-4');
    else videoGrid.classList.add('peer-grid-6');

    state.activePeers.forEach((peer, peerId) => {
      let cardEl = document.getElementById(`peer-card-${peerId}`);
      if (!cardEl) {
        cardEl = createPeerCardElement(peerId, peer);
        videoGrid.appendChild(cardEl);
      }
      cardEl.classList.remove('pinned');
      const videoEl = cardEl.querySelector('video');
      if (videoEl && peer.stream && videoEl.srcObject !== peer.stream) {
        playRemoteVideo(videoEl, peer.stream);
      }
    });

    updateLayoutToolbarUI();
  }

  function playRemoteVideo(videoEl, stream) {
    if (!videoEl || !stream) return;
    videoEl.srcObject = stream;
    videoEl.muted = false;
    videoEl.volume = 1.0;
    videoEl.play().catch(err => {
      console.warn('[Audio] Autoplay blocked, banner visible:', err);
      if (audioUnlockBanner) audioUnlockBanner.classList.remove('hidden');
    });
  }

  function updateLayoutToolbarUI() {
    if (!viewGridBtn || !viewSpotlightBtn) return;
    const isSpotlight = state.layoutMode === 'spotlight' || Boolean(state.pinnedPeerId);
    if (isSpotlight) {
      viewSpotlightBtn.className = 'px-2.5 py-1 rounded-full bg-primary/20 text-primary font-bold transition-colors flex items-center gap-1';
      viewGridBtn.className = 'px-2.5 py-1 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors flex items-center gap-1';
    } else {
      viewGridBtn.className = 'px-2.5 py-1 rounded-full bg-primary/20 text-primary font-bold transition-colors flex items-center gap-1';
      viewSpotlightBtn.className = 'px-2.5 py-1 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors flex items-center gap-1';
    }
  }

  function createPeerCardElement(peerId, peer) {
    const card = document.createElement('div');
    card.id = `peer-card-${peerId}`;
    card.className = 'video-peer-card w-full h-full relative group';

    const fitClass = state.globalFitMode === 'contain' ? 'object-contain' : 'object-cover';

    card.innerHTML = `
      <video class="w-full h-full ${fitClass} relative z-10 transition-all duration-200" playsinline autoplay></video>
      <div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/90 via-transparent to-surface-container-lowest/30 z-10 pointer-events-none"></div>

      <!-- Peer Header Tag Top-Left -->
      <div class="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 pointer-events-none">
        <div class="bg-surface-container-lowest/80 backdrop-blur-md px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-white/10 shadow-md">
          <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          <span class="text-xs font-headline font-semibold text-on-surface truncate max-w-[140px]">${escapeHtml(peer.name)}</span>
          <span class="bg-surface-container-high px-1 py-0.2 rounded text-[9px] font-mono text-primary font-bold uppercase">LIVE</span>
        </div>
      </div>

      <!-- Video Control Actions Top-Right -->
      <div class="absolute top-2.5 right-2.5 z-20 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
        <button class="peer-pin-btn w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-on-surface hover:text-primary flex items-center justify-center text-[12px] shadow-sm transition-colors" title="Pin / Spotlight">
          <span class="material-symbols-outlined text-[14px]">push_pin</span>
        </button>
        <button class="peer-fit-btn w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-on-surface hover:text-primary flex items-center justify-center text-[12px] shadow-sm transition-colors" title="Fit / Fill">
          <span class="material-symbols-outlined text-[14px]">fit_screen</span>
        </button>
        <button class="peer-fs-btn w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-on-surface hover:text-primary flex items-center justify-center text-[12px] shadow-sm transition-colors" title="Fullscreen">
          <span class="material-symbols-outlined text-[14px]">fullscreen</span>
        </button>
      </div>

      <!-- Acoustic Wave Bar Bottom-Left -->
      <div class="absolute bottom-2.5 left-2.5 z-20 flex items-center gap-2 pointer-events-none">
        <div class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-lowest/80 backdrop-blur-md border border-white/5 shadow-md">
          <div class="flex items-center gap-0.5 h-3">
            <span class="w-0.5 bg-primary rounded-full sound-bar h-2 animate-pulse"></span>
            <span class="w-0.5 bg-primary rounded-full sound-bar h-3 animate-pulse delay-75"></span>
            <span class="w-0.5 bg-primary rounded-full sound-bar h-1.5 animate-pulse delay-150"></span>
          </div>
          <span class="text-[10px] font-mono text-on-surface-variant">Live Audio</span>
        </div>
      </div>
    `;

    const pinBtn = card.querySelector('.peer-pin-btn');
    const fitBtn = card.querySelector('.peer-fit-btn');
    const fsBtn = card.querySelector('.peer-fs-btn');
    const videoEl = card.querySelector('video');

    if (pinBtn) {
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePinPeer(peerId);
      });
    }

    if (fitBtn && videoEl) {
      fitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isContain = videoEl.classList.contains('object-contain');
        videoEl.classList.toggle('object-contain', !isContain);
        videoEl.classList.toggle('object-cover', isContain);
        showToast(isContain ? 'Video: Crop fill' : 'Video: Full frame');
      });
    }

    if (fsBtn) {
      fsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreen(card);
      });
    }

    card.addEventListener('dblclick', () => togglePinPeer(peerId));
    return card;
  }

  function togglePinPeer(peerId) {
    if (state.pinnedPeerId === peerId) {
      state.pinnedPeerId = null;
      state.layoutMode = 'grid';
      showToast('Exited spotlight view');
    } else {
      state.pinnedPeerId = peerId;
      state.layoutMode = 'spotlight';
      showToast('Pinned to spotlight view');
    }
    updateGridUI();
  }

  function toggleFullscreen(targetEl) {
    const el = targetEl || videoStage || document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      showToast('Fullscreen enabled');
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      showToast('Exited fullscreen');
    }
  }

  function onFullscreenChange() {
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    const icon = isFs ? 'fullscreen_exit' : 'fullscreen';
    if (stageFullscreenIcon) stageFullscreenIcon.textContent = icon;
    if (dockFullscreenIcon) dockFullscreenIcon.textContent = icon;
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // ==========================================
  // DRAGGABLE & RESIZABLE PIP
  // ==========================================
  function setupPipControls() {
    if (!pipBox) return;

    if (pipSizeBtn) {
      pipSizeBtn.addEventListener('click', () => {
        state.pipSizeIndex = (state.pipSizeIndex + 1) % PIP_SIZES.length;
        const currentPreset = PIP_SIZES[state.pipSizeIndex];
        pipSizeBtn.textContent = currentPreset.label;
        pipBox.style.width = `${currentPreset.width}px`;
        showToast(`PiP Size: ${currentPreset.label} (${currentPreset.width}px)`);
      });
    }

    if (pipFitBtn && localVideoEl) {
      pipFitBtn.addEventListener('click', () => {
        const isContain = localVideoEl.classList.contains('object-contain');
        localVideoEl.classList.toggle('object-contain', !isContain);
        localVideoEl.classList.toggle('object-cover', isContain);
        showToast(isContain ? 'Local cam: Fill' : 'Local cam: Fit');
      });
    }

    if (pipFullscreenBtn) {
      pipFullscreenBtn.addEventListener('click', () => toggleFullscreen(pipBox));
    }

    if (pipBlurBtn) {
      pipBlurBtn.addEventListener('click', toggleStudioBlur);
    }

    if (pipResizeHandle) {
      let isResizing = false;
      let startX = 0;
      let startWidth = 0;

      pipResizeHandle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        startX = e.clientX;
        startWidth = pipBox.offsetWidth;
        pipBox.classList.add('resizing');
        pipResizeHandle.setPointerCapture(e.pointerId);
      });

      window.addEventListener('pointermove', (e) => {
        if (!isResizing) return;
        const deltaX = startX - e.clientX;
        const newWidth = Math.max(100, Math.min(500, startWidth + deltaX));
        pipBox.style.width = `${newWidth}px`;
      });

      window.addEventListener('pointerup', () => {
        if (isResizing) {
          isResizing = false;
          pipBox.classList.remove('resizing');
        }
      });
    }

    const dragTarget = pipDragHandle || pipBox;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    dragTarget.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.target.closest('#pipResizeHandle')) return;
      isDragging = true;
      pipBox.classList.add('dragging');
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const rect = pipBox.getBoundingClientRect();
      const parentRect = (videoStage || pipBox.parentElement).getBoundingClientRect();
      initialLeft = rect.left - parentRect.left;
      initialTop = rect.top - parentRect.top;

      pipBox.style.right = 'auto';
      pipBox.style.left = `${initialLeft}px`;
      pipBox.style.top = `${initialTop}px`;
      dragTarget.setPointerCapture(e.pointerId);
    });

    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;

      const parentRect = (videoStage || pipBox.parentElement).getBoundingClientRect();
      const maxLeft = parentRect.width - pipBox.offsetWidth - 8;
      const maxTop = parentRect.height - pipBox.offsetHeight - 8;

      const newLeft = Math.max(8, Math.min(maxLeft, initialLeft + deltaX));
      const newTop = Math.max(8, Math.min(maxTop, initialTop + deltaY));

      pipBox.style.left = `${newLeft}px`;
      pipBox.style.top = `${newTop}px`;
    });

    window.addEventListener('pointerup', () => {
      if (isDragging) {
        isDragging = false;
        pipBox.classList.remove('dragging');
      }
    });
  }

  // ==========================================
  // VIRTUAL STUDIO BLUR
  // ==========================================
  function toggleStudioBlur() {
    state.isStudioBlur = !state.isStudioBlur;
    if (localVideoEl) {
      localVideoEl.classList.toggle('studio-blur', state.isStudioBlur);
    }
    if (studioBlurBtn) {
      studioBlurBtn.classList.toggle('bg-primary', state.isStudioBlur);
      studioBlurBtn.classList.toggle('text-on-primary', state.isStudioBlur);
    }
    showToast(state.isStudioBlur ? 'Studio Background Blur: Enabled' : 'Studio Background Blur: Off');
  }

  // ==========================================
  // LOCAL STUDIO CALL RECORDER
  // ==========================================
  function startStudioRecording() {
    if (state.isRecording) {
      stopStudioRecording();
      return;
    }

    try {
      const stream = localVideoEl?.srcObject || webrtc.localStream;
      if (!stream) {
        showToast('No active media feed to record');
        return;
      }

      state.recordedChunks = [];
      const options = { mimeType: 'video/webm;codecs=vp8,opus' };
      const recorder = MediaRecorder.isTypeSupported(options.mimeType)
        ? new MediaRecorder(stream, options)
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          state.recordedChunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(state.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pulse-call-recording-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 100);
        showToast('Studio recording saved and downloaded!');
      };

      recorder.start(1000);
      state.mediaRecorder = recorder;
      state.isRecording = true;
      state.recordSeconds = 0;

      if (recordingPill) recordingPill.classList.remove('hidden');
      if (recordCallBtn) {
        recordCallBtn.classList.add('bg-error-container', 'text-error');
      }

      if (state.recordInterval) clearInterval(state.recordInterval);
      state.recordInterval = setInterval(() => {
        state.recordSeconds++;
        const m = Math.floor(state.recordSeconds / 60).toString().padStart(2, '0');
        const s = (state.recordSeconds % 60).toString().padStart(2, '0');
        if (recordingTimer) recordingTimer.textContent = `${m}:${s}`;
      }, 1000);

      showToast('Recording started');
    } catch (err) {
      console.warn('Recording error:', err);
      showToast('Could not start recording: ' + err.message);
    }
  }

  function stopStudioRecording() {
    if (!state.isRecording) return;
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    state.isRecording = false;
    if (state.recordInterval) clearInterval(state.recordInterval);
    if (recordingPill) recordingPill.classList.add('hidden');
    if (recordCallBtn) {
      recordCallBtn.classList.remove('bg-error-container', 'text-error');
    }
  }

  // ==========================================
  // IN-CALL CHAT & VOICE NOTE MEMOS
  // ==========================================
  function appendChatMessage(msg) {
    if (!chatStream) return;
    const div = document.createElement('div');
    const isMe = msg.isMe;

    div.className = isMe
      ? 'flex flex-col items-end self-end max-w-[85%] space-y-1 ml-auto'
      : 'flex flex-col items-start self-start max-w-[85%] space-y-1 mr-auto';

    let contentHtml = '';
    if (msg.imageUrl) {
      contentHtml = `<img src="${msg.imageUrl}" class="rounded-xl max-h-48 object-cover border border-white/10 shadow-md mb-1" />`;
    }
    if (msg.audioUrl) {
      contentHtml += `
        <div class="flex items-center gap-2 p-2 bg-surface-container-highest/80 rounded-xl">
          <span class="material-symbols-outlined text-primary text-[20px]">mic</span>
          <audio controls src="${msg.audioUrl}" class="h-7 w-48"></audio>
        </div>
      `;
    }
    if (msg.text) {
      contentHtml += `
        <div class="${isMe ? 'bg-primary text-on-primary-container' : 'bg-surface-container-high text-on-surface border border-white/5'} px-3.5 py-2 rounded-2xl ${isMe ? 'rounded-br-xs' : 'rounded-bl-xs'} shadow-sm break-words leading-relaxed text-sm">
          ${escapeHtml(msg.text)}
        </div>
      `;
    }

    div.innerHTML = `
      ${contentHtml}
      <div class="flex items-center gap-1.5 px-1 text-[11px] font-mono text-on-surface-variant">
        <span>${escapeHtml(msg.sender)}</span>
        <span>•</span>
        <span>${msg.timestamp}</span>
        ${msg.isP2P ? '<span class="bg-primary/20 text-primary px-1 rounded text-[9px] font-bold">E2EE</span>' : ''}
        ${isMe ? '<span class="material-symbols-outlined text-[13px] text-primary">done_all</span>' : ''}
      </div>
    `;

    chatStream.appendChild(div);
    chatStream.scrollTop = chatStream.scrollHeight;

    if (!isMe) {
      playStudioChime('message');
      if (state.mobileView === 'stage') {
        state.unreadChatCount++;
        updateUnreadBadges();
      }
    }
  }

  function sendMessage() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;

    const timeStr = getCurrentTime();
    const isDirectP2P = webrtc.hasActiveP2P();

    const msg = {
      id: 'msg-' + Date.now(),
      text,
      sender: state.userName,
      isMe: true,
      isP2P: isDirectP2P,
      timestamp: timeStr
    };

    appendChatMessage(msg);
    chatInput.value = '';

    const sentDirect = webrtc.sendP2PMessage({
      type: 'chat',
      msg: { ...msg, isMe: false, isP2P: true }
    });

    if (!sentDirect) {
      socket.emit('chat-message-relay', { roomId: state.roomId, msg });
    }
  }

  function handleP2PMessage(senderSocketId, payload) {
    if (!payload) return;
    if (payload.type === 'chat' && payload.msg) {
      const msg = payload.msg;
      msg.isMe = false;
      msg.isP2P = true;
      appendChatMessage(msg);
      showToast(`Message from ${msg.sender}`);
    } else if (payload.type === 'voice-note') {
      appendChatMessage({
        id: 'msg-' + Date.now(),
        sender: payload.sender || 'Peer',
        audioUrl: payload.audioUrl,
        isMe: false,
        isP2P: true,
        timestamp: getCurrentTime()
      });
    } else if (payload.type === 'image') {
      appendChatMessage({
        id: 'msg-' + Date.now(),
        sender: payload.sender || 'Peer',
        imageUrl: payload.imgData,
        isMe: false,
        isP2P: true,
        timestamp: getCurrentTime()
      });
    } else if (payload.type === 'typing') {
      showTyping(payload.sender || 'Peer');
    } else if (payload.type === 'reaction') {
      spawnReaction(payload.emoji);
    }
  }

  let typingTimeout = null;
  function showTyping(name) {
    if (!typingIndicator || !typingText) return;
    typingText.textContent = `${name} is typing...`;
    typingIndicator.classList.remove('hidden');
    typingIndicator.classList.add('flex');
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      typingIndicator.classList.add('hidden');
      typingIndicator.classList.remove('flex');
    }, 2000);
  }

  // Voice Note Recording
  function startVoiceNoteRecording() {
    if (state.isVoiceRecording) {
      finishVoiceNoteRecording();
      return;
    }

    try {
      if (!webrtc.localStream) {
        showToast('Microphone not available');
        return;
      }

      state.voiceChunks = [];
      const rec = new MediaRecorder(webrtc.localStream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) state.voiceChunks.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(state.voiceChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const base64Audio = reader.result;
          const msg = {
            id: 'msg-' + Date.now(),
            sender: state.userName,
            audioUrl: base64Audio,
            isMe: true,
            isP2P: true,
            timestamp: getCurrentTime()
          };
          appendChatMessage(msg);
          webrtc.sendP2PMessage({
            type: 'voice-note',
            sender: state.userName,
            audioUrl: base64Audio
          });
        };
        reader.readAsDataURL(blob);
      };

      rec.start();
      state.voiceRecorder = rec;
      state.isVoiceRecording = true;
      state.voiceTimer = 0;

      if (voiceNoteRecBar) voiceNoteRecBar.classList.remove('hidden');
      if (voiceNoteBtn) voiceNoteBtn.classList.add('bg-error-container', 'text-error');

      if (state.voiceInterval) clearInterval(state.voiceInterval);
      state.voiceInterval = setInterval(() => {
        state.voiceTimer++;
        const m = Math.floor(state.voiceTimer / 60).toString().padStart(2, '0');
        const s = (state.voiceTimer % 60).toString().padStart(2, '0');
        if (voiceRecTimer) voiceRecTimer.textContent = `${m}:${s}`;
      }, 1000);
    } catch (e) {
      showToast('Voice note error: ' + e.message);
    }
  }

  function finishVoiceNoteRecording() {
    if (!state.isVoiceRecording) return;
    if (state.voiceRecorder && state.voiceRecorder.state !== 'inactive') {
      state.voiceRecorder.stop();
    }
    state.isVoiceRecording = false;
    if (state.voiceInterval) clearInterval(state.voiceInterval);
    if (voiceNoteRecBar) voiceNoteRecBar.classList.add('hidden');
    if (voiceNoteBtn) voiceNoteBtn.classList.remove('bg-error-container', 'text-error');
  }

  // ==========================================
  // AUDIO SPACES MODULE
  // ==========================================
  async function loadAudioSpace(spaceId = 'product-design-1') {
    try {
      socket.emit('join-space', { spaceId, userName: state.userName });
      const res = await fetch('/api/spaces');
      if (res.ok) {
        const spacesList = await res.json();
        const activeSpace = spacesList.find(s => s.id === spaceId) || spacesList[0];
        if (activeSpace) {
          state.audioSpace = activeSpace;
          renderAudioSpaceUI(activeSpace);
        }
      }
    } catch (e) {
      console.warn('Audio space load error:', e);
    }
  }

  function renderAudioSpaceUI(space) {
    if (!space) return;
    if (spaceTitle) spaceTitle.textContent = space.title;
    if (spaceDesc) spaceDesc.textContent = space.description;
    if (spaceTopicTag) spaceTopicTag.textContent = space.topic;
    if (spaceListenersCount) spaceListenersCount.textContent = space.listenersCount;

    // 1. Render Speakers Grid
    if (spaceSpeakersGrid) {
      spaceSpeakersGrid.innerHTML = '';
      (space.speakers || []).forEach(speaker => {
        const isHost = speaker.role === 'HOST';
        const card = document.createElement('div');
        card.className = 'relative bg-surface-container/70 backdrop-blur-xl p-3.5 rounded-2xl flex flex-col items-center justify-center text-center gap-2 overflow-hidden border border-white/5 transition-all hover:border-primary/40';

        card.innerHTML = `
          ${speaker.isSpeaking ? '<div class="absolute inset-0 bg-gradient-to-b from-primary/15 via-transparent to-transparent pointer-events-none"></div>' : ''}
          <div class="relative mt-1">
            ${speaker.isSpeaking ? '<div class="absolute -inset-1.5 rounded-full bg-primary/30 animate-pulse"></div>' : ''}
            <div class="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shadow-md ${speaker.isSpeaking ? 'ring-2 ring-primary shadow-primary/20' : ''}">
              <img src="${speaker.avatar}" class="w-full h-full object-cover" />
            </div>
            ${isHost ? '<div class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center text-[12px] font-bold shadow-md">★</div>' : ''}
            ${speaker.isSpeaking ? `
              <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-surface-container-lowest/90 backdrop-blur-md flex items-center gap-0.5 shadow-sm">
                <span class="w-0.5 h-2.5 bg-primary rounded-full animate-bounce"></span>
                <span class="w-0.5 h-3.5 bg-primary rounded-full animate-bounce delay-75"></span>
                <span class="w-0.5 h-2 bg-primary rounded-full animate-bounce delay-150"></span>
              </div>
            ` : ''}
          </div>
          <div class="flex flex-col items-center min-w-0 w-full">
            <span class="font-headline font-semibold text-xs sm:text-sm text-on-surface truncate">${escapeHtml(speaker.name)}</span>
            <span class="font-mono text-[9px] sm:text-[10px] text-primary tracking-wider uppercase font-semibold">${speaker.role} ${speaker.isSpeaking ? '• SPEAKING' : ''}</span>
          </div>
        `;
        spaceSpeakersGrid.appendChild(card);
      });
      if (spaceSpeakerBadge) {
        spaceSpeakerBadge.textContent = `${space.speakers?.length || 0} Speaking`;
      }
    }

    // 2. Render Hand Raises
    if (handRaisesList) {
      handRaisesList.innerHTML = '';
      const raises = space.handRaises || [];
      if (handRaisesBadge) handRaisesBadge.textContent = `${raises.length} Request${raises.length === 1 ? '' : 's'}`;

      if (raises.length === 0) {
        handRaisesList.innerHTML = `<span class="text-xs text-on-surface-variant font-mono py-1">No pending speaker requests</span>`;
      } else {
        raises.forEach(user => {
          const pill = document.createElement('div');
          pill.className = 'flex items-center justify-between gap-2 px-3 py-1.5 rounded-full bg-surface-container-highest border border-amber-400/20 text-xs font-mono';
          pill.innerHTML = `
            <span class="font-bold text-amber-300">✋ ${escapeHtml(user.name)}</span>
            <button class="approve-speaker-btn px-2.5 py-0.5 rounded-full bg-primary text-on-primary font-bold text-[10px] hover:brightness-110 active:scale-95 transition-all" data-socket="${user.id}">
              Approve
            </button>
          `;
          const btn = pill.querySelector('.approve-speaker-btn');
          btn.addEventListener('click', () => {
            socket.emit('approve-speaker', { spaceId: space.id, targetSocketId: user.id });
            showToast(`Approved ${user.name} to speak!`);
          });
          handRaisesList.appendChild(pill);
        });
      }
    }

    // 3. Render Audience
    if (spaceAudienceGrid) {
      spaceAudienceGrid.innerHTML = '';
      (space.audience || []).forEach(aud => {
        const item = document.createElement('div');
        item.className = 'flex flex-col items-center gap-1 text-center';
        item.innerHTML = `
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden shadow-sm ring-1 ring-white/10">
            <img src="${aud.avatar}" class="w-full h-full object-cover" />
          </div>
          <span class="font-body text-[10px] text-on-surface-variant truncate max-w-[64px]">${escapeHtml(aud.name)}</span>
        `;
        spaceAudienceGrid.appendChild(item);
      });
    }
  }

  // ==========================================
  // CALL HISTORY & QUICK LAUNCHER MODULE
  // ==========================================
  async function loadCallLogs() {
    try {
      const res = await fetch('/api/call-logs');
      if (res.ok) {
        state.callLogs = await res.json();
        renderCallLogsUI();
      }
    } catch (e) {
      console.warn('Call logs load error:', e);
    }
  }

  function renderCallLogsUI() {
    if (!callLogsContainer) return;
    callLogsContainer.innerHTML = '';

    const filtered = (state.callLogs || []).filter(log => {
      if (state.historyTab === 'missed' && log.status !== 'missed') return false;
      if (state.historyFilter !== 'all' && log.type !== state.historyFilter) return false;
      return true;
    });

    if (filtered.length === 0) {
      callLogsContainer.innerHTML = `
        <div class="text-center py-8 text-on-surface-variant font-mono text-xs">
          No calls match the selected filter.
        </div>
      `;
      return;
    }

    filtered.forEach(log => {
      const isMissed = log.status === 'missed';
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-3.5 rounded-2xl bg-surface-container hover:bg-surface-container-high transition-colors border border-white/5 shadow-sm group';

      const typeIcon = log.type === 'video' ? 'videocam' : (log.type === 'space' ? 'podcasts' : 'call');
      const dirIcon = isMissed ? 'call_missed' : (log.direction === 'incoming' ? 'call_received' : 'call_made');
      const dirColor = isMissed ? 'text-error' : 'text-primary';

      item.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <div class="relative w-11 h-11 rounded-full overflow-hidden shrink-0 shadow-md ring-1 ring-white/10">
            <img src="${log.avatar}" class="w-full h-full object-cover" />
            <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full ${isMissed ? 'bg-error' : 'bg-primary'} ring-2 ring-surface-container"></span>
          </div>
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="font-headline font-semibold text-sm text-on-surface truncate">${escapeHtml(log.peerName)}</span>
              <span class="material-symbols-outlined text-[15px] ${dirColor}">${dirIcon}</span>
            </div>
            <div class="flex items-center gap-1.5 text-[11px] font-mono text-on-surface-variant">
              <span>${log.timestamp}</span>
              <span>•</span>
              <span>${log.duration}</span>
              <span>•</span>
              <span class="text-primary">${log.quality}</span>
            </div>
          </div>
        </div>

        <button class="call-back-btn px-3.5 py-1.5 rounded-full bg-primary text-on-primary font-mono font-bold text-xs flex items-center gap-1 shadow-md hover:brightness-110 active:scale-95 transition-all">
          <span class="material-symbols-outlined text-[16px]">${typeIcon}</span>
          <span>Call Back</span>
        </button>
      `;

      const btn = item.querySelector('.call-back-btn');
      btn.addEventListener('click', () => {
        state.roomId = log.room || 'pulse-room';
        if (webrtc.setRoomId) webrtc.setRoomId(state.roomId);
        if (log.type === 'space') {
          setAppView('spaces');
        } else {
          setAppView('video');
        }
        showToast(`Connecting with ${log.peerName} in room ${state.roomId}...`);
      });

      callLogsContainer.appendChild(item);
    });
  }

  // ==========================================
  // FLOATING PARTICLES & REACTIONS
  // ==========================================
  function spawnReaction(emoji) {
    const container = document.getElementById('reactionField');
    if (!container) return;

    for (let i = 0; i < 2; i++) {
      const el = document.createElement('div');
      el.textContent = emoji;
      el.style.position = 'absolute';
      el.style.left = `${Math.floor(Math.random() * 70) + 15}%`;
      el.style.bottom = '20px';
      el.style.fontSize = `${Math.floor(Math.random() * 10) + 26}px`;
      el.style.transition = 'all 1.6s cubic-bezier(0.2, 0.8, 0.2, 1)';
      el.style.opacity = '1';
      el.style.transform = `scale(0.6) translateY(0)`;
      el.style.zIndex = '50';

      container.appendChild(el);

      requestAnimationFrame(() => {
        const driftX = (Math.random() - 0.5) * 80;
        el.style.transform = `scale(1.3) translate(${driftX}px, -280px)`;
        el.style.opacity = '0';
      });

      setTimeout(() => el.remove(), 1600);
    }
  }

  function showToast(msg, duration = 2500) {
    if (!toastEl) return;
    const toastMsg = toastEl.querySelector('.toast-message');
    if (toastMsg) toastMsg.textContent = msg;
    toastEl.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-3');
    toastEl.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
      toastEl.classList.add('opacity-0', 'pointer-events-none', 'translate-y-3');
      toastEl.classList.remove('opacity-100', 'translate-y-0');
    }, duration);
  }

  function copyInviteLink() {
    const inviteUrl = `${window.location.origin}/?room=${encodeURIComponent(state.roomId)}&peer=2`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      showToast('Invite link copied! Open in 2nd tab to test call.');
    }).catch(() => {
      showToast(`Room: ${state.roomId}`);
    });
  }

  function getCurrentTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setP2PStatus(connected) {
    state.isP2PConnected = connected;
    if (!p2pDot || !p2pStatusLabel) return;
    const peerCount = state.activePeers.size;
    if (connected && peerCount > 0) {
      p2pDot.className = 'w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_#4edea3]';
      p2pStatusLabel.className = 'text-primary font-bold text-[11px]';
      p2pStatusLabel.textContent = `${peerCount + 1} online (E2EE)`;
    } else {
      p2pDot.className = 'w-2 h-2 rounded-full bg-amber-400';
      p2pStatusLabel.className = 'text-on-surface-variant font-medium text-[11px]';
      p2pStatusLabel.textContent = 'Waiting for peer';
    }
  }

  function startCallTimer() {
    const savedTime = sessionStorage.getItem('pulse_call_seconds');
    if (savedTime && !isNaN(parseInt(savedTime, 10))) {
      state.callSeconds = parseInt(savedTime, 10);
    }
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      state.callSeconds++;
      sessionStorage.setItem('pulse_call_seconds', state.callSeconds);
      const mins = Math.floor(state.callSeconds / 60);
      const secs = state.callSeconds % 60;
      const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      if (callTimerEl) callTimerEl.textContent = timeStr;
    }, 1000);
  }

  function setMobileView(view) {
    state.mobileView = view;
    if (view === 'stage') {
      document.body.classList.remove('mobile-view-chat');
      document.body.classList.add('mobile-view-stage');
      if (mobileTabCallBtn) {
        mobileTabCallBtn.className = 'flex items-center gap-1 px-2 sm:px-3 py-1 rounded-full bg-primary text-on-primary font-bold shadow-sm transition-all';
      }
      if (mobileTabChatBtn) {
        mobileTabChatBtn.className = 'flex items-center gap-1 px-2 sm:px-3 py-1 rounded-full text-on-surface-variant hover:text-on-surface transition-all relative';
      }
    } else {
      document.body.classList.remove('mobile-view-stage');
      document.body.classList.add('mobile-view-chat');
      if (mobileTabChatBtn) {
        mobileTabChatBtn.className = 'flex items-center gap-1 px-2 sm:px-3 py-1 rounded-full bg-primary text-on-primary font-bold shadow-sm transition-all relative';
      }
      if (mobileTabCallBtn) {
        mobileTabCallBtn.className = 'flex items-center gap-1 px-2 sm:px-3 py-1 rounded-full text-on-surface-variant hover:text-on-surface transition-all';
      }
      state.unreadChatCount = 0;
      updateUnreadBadges();
      if (chatStream) {
        setTimeout(() => { chatStream.scrollTop = chatStream.scrollHeight; }, 50);
      }
    }
  }

  function updateUnreadBadges() {
    if (mobileUnreadBadge) {
      if (state.unreadChatCount > 0) {
        mobileUnreadBadge.textContent = state.unreadChatCount > 9 ? '9+' : state.unreadChatCount;
        mobileUnreadBadge.classList.remove('hidden');
        mobileUnreadBadge.classList.add('flex');
      } else {
        mobileUnreadBadge.classList.add('hidden');
        mobileUnreadBadge.classList.remove('flex');
      }
    }
    if (dockUnreadBadge) {
      dockUnreadBadge.classList.toggle('hidden', state.unreadChatCount === 0);
    }
  }

  // ==========================================
  // EVENT LISTENERS & WIRING
  // ==========================================
  function setupEvents() {
    // 1. Navigation Tabs
    if (navTabVideo) navTabVideo.addEventListener('click', () => setAppView('video'));
    if (navTabSpaces) navTabSpaces.addEventListener('click', () => setAppView('spaces'));
    if (navTabHistory) navTabHistory.addEventListener('click', () => setAppView('history'));
    if (quickSpacesBtn) quickSpacesBtn.addEventListener('click', () => setAppView('spaces'));
    if (returnToCallBtn) returnToCallBtn.addEventListener('click', () => setAppView('video'));

    // 2. Mobile View Switcher
    if (mobileTabCallBtn) mobileTabCallBtn.addEventListener('click', () => setMobileView('stage'));
    if (mobileTabChatBtn) mobileTabChatBtn.addEventListener('click', () => setMobileView('chat'));
    if (dockChatBtn) dockChatBtn.addEventListener('click', () => setMobileView('chat'));
    if (mobileBackToCallBtn) mobileBackToCallBtn.addEventListener('click', () => setMobileView('stage'));

    // 3. Audio Autoplay Unlock
    const unlockAudio = () => {
      if (webrtc && webrtc.unlockAudio) webrtc.unlockAudio();
      document.querySelectorAll('#videoGrid video').forEach(v => {
        v.muted = false;
        v.play().catch(() => {});
      });
      if (audioUnlockBanner) audioUnlockBanner.classList.add('hidden');
    };

    if (audioUnlockBanner) audioUnlockBanner.addEventListener('click', unlockAudio);
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });

    // 4. Invite Links
    [copyInviteBtn, invitePeerBtn].forEach(btn => {
      if (btn) btn.addEventListener('click', copyInviteLink);
    });

    // 5. Layout Modes & Aspect Ratio
    if (viewGridBtn) {
      viewGridBtn.addEventListener('click', () => {
        state.layoutMode = 'grid';
        state.pinnedPeerId = null;
        updateGridUI();
        showToast('Switched to Grid View');
      });
    }

    if (viewSpotlightBtn) {
      viewSpotlightBtn.addEventListener('click', () => {
        state.layoutMode = 'spotlight';
        if (state.activePeers.size > 0 && !state.pinnedPeerId) {
          state.pinnedPeerId = state.activePeers.keys().next().value;
        }
        updateGridUI();
        showToast('Switched to Spotlight View');
      });
    }

    if (toggleFitBtn) {
      toggleFitBtn.addEventListener('click', () => {
        state.globalFitMode = state.globalFitMode === 'cover' ? 'contain' : 'cover';
        const isContain = state.globalFitMode === 'contain';
        if (fitText) fitText.textContent = isContain ? 'Fit' : 'Fill';
        if (fitIcon) fitIcon.textContent = isContain ? 'aspect_ratio' : 'crop_free';
        document.querySelectorAll('#videoGrid video').forEach(v => {
          v.classList.toggle('object-contain', isContain);
          v.classList.toggle('object-cover', !isContain);
        });
        showToast(isContain ? 'Video: Full frame (Fit)' : 'Video: Zoom fill (Cover)');
      });
    }

    if (stageFullscreenBtn) stageFullscreenBtn.addEventListener('click', () => toggleFullscreen(videoStage));
    if (dockFullscreenBtn) dockFullscreenBtn.addEventListener('click', () => toggleFullscreen(videoStage));

    // 6. Media Controls (Mic, Cam, Screen, Blur, Record, Leave)
    if (toggleMicBtn && micIcon) {
      toggleMicBtn.addEventListener('click', () => {
        const isEnabled = webrtc.toggleAudio();
        if (isEnabled) {
          toggleMicBtn.className = 'w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg active:scale-95 transition-all';
          micIcon.textContent = 'mic';
          showToast('Microphone unmuted');
        } else {
          toggleMicBtn.className = 'w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-error-container text-on-error flex items-center justify-center shadow-lg active:scale-95 transition-all';
          micIcon.textContent = 'mic_off';
          showToast('Microphone muted');
        }
      });
    }

    if (toggleCamBtn && camIcon) {
      toggleCamBtn.addEventListener('click', () => {
        const isEnabled = webrtc.toggleVideo();
        if (isEnabled) {
          toggleCamBtn.className = 'w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center hover:text-primary active:scale-95 transition-all';
          camIcon.textContent = 'videocam';
          showToast('Camera enabled');
        } else {
          toggleCamBtn.className = 'w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-error-container text-on-error flex items-center justify-center active:scale-95 transition-all';
          camIcon.textContent = 'videocam_off';
          showToast('Camera disabled');
        }
      });
    }

    if (shareScreenBtn) {
      shareScreenBtn.addEventListener('click', async () => {
        const isSharing = await webrtc.toggleScreenShare(localVideoEl);
        shareScreenBtn.classList.toggle('bg-secondary', isSharing);
        shareScreenBtn.classList.toggle('text-on-secondary', isSharing);
        showToast(isSharing ? 'Screen sharing active' : 'Screen sharing stopped');
      });
    }

    if (studioBlurBtn) studioBlurBtn.addEventListener('click', toggleStudioBlur);
    if (recordCallBtn) recordCallBtn.addEventListener('click', startStudioRecording);
    if (stopRecordBtn) stopRecordBtn.addEventListener('click', stopStudioRecording);

    if (leaveCallBtn) {
      leaveCallBtn.addEventListener('click', () => {
        if (confirm('Leave current session and return to history?')) {
          setAppView('history');
          showToast('Session ended');
        }
      });
    }

    [camFlipBtn, pipFlipCamBtn].forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          webrtc.flipCamera(localVideoEl);
          showToast('Camera flipped');
        });
      }
    });

    // 7. Chat Inputs
    if (sendMsgBtn) sendMsgBtn.addEventListener('click', sendMessage);
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      chatInput.addEventListener('input', () => {
        webrtc.sendP2PMessage({ type: 'typing', sender: state.userName });
      });
    }

    if (emojiQuickBtn && chatInput) {
      emojiQuickBtn.addEventListener('click', () => {
        chatInput.value += ' ✨ ';
        chatInput.focus();
      });
    }

    if (voiceNoteBtn) voiceNoteBtn.addEventListener('click', startVoiceNoteRecording);
    if (cancelVoiceNoteBtn) cancelVoiceNoteBtn.addEventListener('click', finishVoiceNoteRecording);

    if (chatFileInput) {
      chatFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const imgData = reader.result;
            const msg = {
              id: 'msg-' + Date.now(),
              sender: state.userName,
              imageUrl: imgData,
              isMe: true,
              isP2P: true,
              timestamp: getCurrentTime()
            };
            appendChatMessage(msg);
            webrtc.sendP2PMessage({
              type: 'image',
              sender: state.userName,
              imgData
            });
            showToast('Image shared in chat');
          };
          reader.readAsDataURL(file);
        }
      });
    }

    if (exportChatBtn) {
      exportChatBtn.addEventListener('click', () => {
        const textNodes = Array.from(document.querySelectorAll('#chat-stream > div'))
          .map(d => d.innerText.replace(/\n+/g, ' ')).join('\n');
        const blob = new Blob([textNodes || 'No messages in chat.'], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `pulse-chat-transcript-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 100);
        showToast('Chat transcript exported');
      });
    }

    // Reaction Ribbon
    document.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.textContent.trim();
        spawnReaction(emoji);
        const sentDirect = webrtc.hasActiveP2P() && webrtc.sendP2PMessage({ type: 'reaction', emoji });
        if (!sentDirect) {
          socket.emit('spawn-reaction', { roomId: state.roomId, emoji, sender: state.userName });
        }
      });
    });

    // 8. Settings Modal
    if (settingsModalBtn) {
      settingsModalBtn.addEventListener('click', () => {
        if (settingsModal) settingsModal.classList.remove('hidden');
        populateDeviceSelectors();
      });
    }
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => {
        if (settingsModal) settingsModal.classList.add('hidden');
      });
    }

    if (testSpeakerBtn) {
      testSpeakerBtn.addEventListener('click', () => {
        playStudioChime('speaker-test');
        showToast('Playing studio harmonic chime...');
      });
    }

    document.querySelectorAll('.settings-profile-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.profile;
        webrtc.setBandwidthProfile(key);
        document.querySelectorAll('.settings-profile-btn').forEach(b => {
          b.className = 'settings-profile-btn px-3 py-2 rounded-xl bg-surface-container-highest border border-white/5 text-on-surface text-left';
        });
        btn.className = 'settings-profile-btn px-3 py-2 rounded-xl bg-primary/20 border border-primary text-primary font-bold text-left';
        updateBandwidthUI(key);
        showToast(`Bandwidth Profile: ${webrtc.bandwidthProfiles[key].label}`);
      });
    });

    // 9. Audio Space Controls
    if (spaceHandBtn) {
      spaceHandBtn.addEventListener('click', () => {
        state.hasRaisedHand = !state.hasRaisedHand;
        if (state.hasRaisedHand) {
          socket.emit('raise-hand', { spaceId: 'product-design-1', userName: state.userName });
          spaceHandBtn.className = 'flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-surface-container-highest text-on-surface font-mono font-bold text-xs shadow-lg active:scale-95 transition-all';
          if (spaceHandBtnText) spaceHandBtnText.textContent = 'Lower Hand';
          showToast('Hand raised! Waiting for host approval.');
        } else {
          socket.emit('lower-hand', { spaceId: 'product-design-1' });
          spaceHandBtn.className = 'flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-amber-400 text-surface font-mono font-bold text-xs shadow-lg active:scale-95 transition-all';
          if (spaceHandBtnText) spaceHandBtnText.textContent = 'Raise Hand';
          showToast('Hand lowered.');
        }
      });
    }

    if (spaceMicBtn) {
      spaceMicBtn.addEventListener('click', () => {
        const isEnabled = webrtc.toggleAudio();
        spaceMicBtn.classList.toggle('text-primary', isEnabled);
        spaceMicBtn.classList.toggle('text-error', !isEnabled);
        socket.emit('speaking-state', { spaceId: 'product-design-1', isSpeaking: isEnabled });
        showToast(isEnabled ? 'Stage Mic: Live' : 'Stage Mic: Muted');
      });
    }

    if (spaceLeaveBtn) {
      spaceLeaveBtn.addEventListener('click', () => {
        setAppView('video');
        showToast('Left Audio Space quietly');
      });
    }

    // 10. Call History & Quick Launcher Controls
    if (randomizeRoomBtn && launcherRoomInput) {
      randomizeRoomBtn.addEventListener('click', () => {
        launcherRoomInput.value = `pulse-studio-${Math.floor(100 + Math.random() * 900)}`;
      });
    }

    if (launchVideoBtn && launcherRoomInput) {
      launchVideoBtn.addEventListener('click', () => {
        const newRoom = launcherRoomInput.value.trim() || 'pulse-room';
        state.roomId = newRoom;
        if (webrtc.setRoomId) webrtc.setRoomId(newRoom);
        socket.emit('join-video-room', { roomId: newRoom, userName: state.userName });
        setAppView('video');
        showToast(`Joined Video Room: ${newRoom}`);
      });
    }

    if (launchSpaceBtn) {
      launchSpaceBtn.addEventListener('click', () => {
        setAppView('spaces');
      });
    }

    if (historyTabAll) {
      historyTabAll.addEventListener('click', () => {
        state.historyTab = 'all';
        historyTabAll.className = 'flex-1 py-1.5 rounded-lg bg-surface-container-high text-on-surface font-mono text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5';
        if (historyTabMissed) historyTabMissed.className = 'flex-1 py-1.5 rounded-lg text-on-surface-variant hover:text-on-surface font-mono text-xs transition-all flex items-center justify-center gap-1.5';
        renderCallLogsUI();
      });
    }

    if (historyTabMissed) {
      historyTabMissed.addEventListener('click', () => {
        state.historyTab = 'missed';
        historyTabMissed.className = 'flex-1 py-1.5 rounded-lg bg-surface-container-high text-error font-mono text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5';
        if (historyTabAll) historyTabAll.className = 'flex-1 py-1.5 rounded-lg text-on-surface-variant hover:text-on-surface font-mono text-xs transition-all flex items-center justify-center gap-1.5';
        renderCallLogsUI();
      });
    }

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        state.historyFilter = chip.dataset.filter;
        document.querySelectorAll('.filter-chip').forEach(c => {
          c.className = 'filter-chip px-3 py-1 rounded-full bg-surface-container text-on-surface-variant font-mono text-xs hover:text-on-surface flex items-center gap-1 shrink-0';
        });
        chip.className = 'filter-chip px-3 py-1 rounded-full bg-primary/20 text-primary font-mono text-xs font-semibold flex items-center gap-1 shrink-0';
        renderCallLogsUI();
      });
    });

    setupPipControls();
    setupBandwidthControls();
  }

  // ==========================================
  // DEVICE ENUMERATION & POPULATION
  // ==========================================
  async function populateDeviceSelectors() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();

      if (cameraSelect) {
        cameraSelect.innerHTML = '';
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        videoDevices.forEach((dev, idx) => {
          const opt = document.createElement('option');
          opt.value = dev.deviceId;
          opt.textContent = dev.label || `Camera ${idx + 1}`;
          cameraSelect.appendChild(opt);
        });
      }

      if (micSelect) {
        micSelect.innerHTML = '';
        const audioDevices = devices.filter(d => d.kind === 'audioinput');
        audioDevices.forEach((dev, idx) => {
          const opt = document.createElement('option');
          opt.value = dev.deviceId;
          opt.textContent = dev.label || `Microphone ${idx + 1}`;
          micSelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('Device enumeration error:', e);
    }
  }

  // ==========================================
  // BANDWIDTH CONTROL
  // ==========================================
  function updateBandwidthUI(profileKey) {
    const prof = webrtc.bandwidthProfiles[profileKey];
    if (!prof) return;

    if (bandwidthLabel) {
      if (profileKey === 'saver') bandwidthLabel.textContent = 'Data Saver (160k)';
      else if (profileKey === 'balanced') bandwidthLabel.textContent = 'Balanced (450k)';
      else if (profileKey === 'hd') bandwidthLabel.textContent = 'HD Mode (1.2M)';
      else if (profileKey === 'audio-only') bandwidthLabel.textContent = 'Audio Only (16k)';
    }

    if (bandwidthIcon) {
      if (profileKey === 'saver') bandwidthIcon.textContent = 'eco';
      else if (profileKey === 'audio-only') bandwidthIcon.textContent = 'headset';
      else if (profileKey === 'hd') bandwidthIcon.textContent = 'high_quality';
      else bandwidthIcon.textContent = 'speed';
    }

    if (audioOnlyBtn) {
      audioOnlyBtn.classList.toggle('bg-secondary', profileKey === 'audio-only');
      audioOnlyBtn.classList.toggle('text-on-secondary', profileKey === 'audio-only');
    }
  }

  function setupBandwidthControls() {
    const profileKeys = ['saver', 'balanced', 'hd', 'audio-only'];
    let currentProfileIdx = 0;

    if (bandwidthBtn) {
      bandwidthBtn.addEventListener('click', () => {
        currentProfileIdx = (currentProfileIdx + 1) % profileKeys.length;
        const nextKey = profileKeys[currentProfileIdx];
        webrtc.setBandwidthProfile(nextKey);
        updateBandwidthUI(nextKey);
        showToast(`Bandwidth: ${webrtc.bandwidthProfiles[nextKey].label}`);
      });
    }

    if (audioOnlyBtn) {
      audioOnlyBtn.addEventListener('click', () => {
        const isCurrentlyAudioOnly = webrtc.bandwidthProfile === 'audio-only';
        const targetProfile = isCurrentlyAudioOnly ? 'saver' : 'audio-only';
        webrtc.setBandwidthProfile(targetProfile);
        currentProfileIdx = profileKeys.indexOf(targetProfile);
        updateBandwidthUI(targetProfile);
        showToast(isCurrentlyAudioOnly ? 'Video enabled (Data Saver)' : 'Audio-Only Mode (Zero Video Data)');
      });
    }

    updateBandwidthUI(webrtc.bandwidthProfile);

    webrtc.startStatsMonitoring((stats) => {
      if (netLatency) {
        const lossText = stats.loss > 0 ? ` • ${stats.loss}% loss` : '';
        netLatency.textContent = `• ${stats.rtt}ms${lossText}`;
      }
      if (diagRtt) {
        diagRtt.textContent = `${stats.rtt}ms (0% drop)`;
      }
      updateBandwidthUI(webrtc.bandwidthProfile);
    });
  }

  // ==========================================
  // SOCKET SIGNALS & ROOM COORDINATION
  // ==========================================
  function setupSocket() {
    socket.on('room-info', ({ users }) => {
      if (users && users.length) {
        users.forEach(u => {
          state.activePeers.set(u.socketId, {
            id: u.socketId,
            name: u.name,
            stream: null,
            isSpeaking: false,
            isMuted: false
          });
        });
        updatePeerCounters();
      }
    });

    socket.on('existing-users', (users) => {
      console.log('[Mesh] Existing online users in room:', users);
      users.forEach(u => {
        state.activePeers.set(u.socketId, {
          id: u.socketId,
          name: u.name,
          stream: null,
          isSpeaking: false,
          isMuted: false
        });
        webrtc.callUser(u.socketId);
      });
      updatePeerCounters();
    });

    socket.on('user-joined', ({ socketId, name }) => {
      console.log('[Mesh] Peer joined room:', socketId, name);
      state.activePeers.set(socketId, {
        id: socketId,
        name: name || `Peer (${socketId.slice(0, 4)})`,
        stream: null,
        isSpeaking: false,
        isMuted: false
      });
      updatePeerCounters();
      playStudioChime('join');
      showToast(`${name || 'Peer'} joined call`);
    });

    socket.on('signal', ({ senderSocketId, signalData }) => {
      webrtc.handleSignal(senderSocketId, signalData);
    });

    socket.on('user-left', ({ socketId }) => {
      console.log('[Mesh] Peer left room:', socketId);
      const peer = state.activePeers.get(socketId);
      const peerName = peer ? peer.name : 'Peer';
      if (state.pinnedPeerId === socketId) {
        state.pinnedPeerId = null;
      }
      webrtc.closePeer(socketId);
      removeRemotePeer(socketId);
      updateGridUI();
      playStudioChime('leave');
      showToast(`${peerName} disconnected`);
    });

    socket.on('chat-message-relay', ({ msg }) => {
      if (msg && msg.text && !msg.isMe) {
        appendChatMessage({ ...msg, isMe: false });
      }
    });

    socket.on('reaction-spawned', ({ emoji }) => {
      spawnReaction(emoji);
    });

    // Space state update sync
    socket.on('space-updated', (updatedSpace) => {
      state.audioSpace = updatedSpace;
      if (state.currentView === 'spaces') {
        renderAudioSpaceUI(updatedSpace);
      }
    });
  }

  // ==========================================
  // APP STARTUP
  // ==========================================
  document.addEventListener('DOMContentLoaded', async () => {
    setupEvents();
    setupSocket();
    startCallTimer();

    // Start local camera & microphone
    await webrtc.initLocalStream(localVideoEl);

    // Join room for WebRTC P2P mesh signaling
    socket.emit('join-video-room', {
      roomId: state.roomId,
      userName: state.userName
    });

    // Preload initial spaces and logs
    loadAudioSpace();
    loadCallLogs();
  });

})();
