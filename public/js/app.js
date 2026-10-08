/**
 * Pulse — Real Online P2P Multi-Peer Video, Audio & Chat Application
 * Exclusively tracks and displays real online participants in the WebRTC mesh.
 */

(function () {
  'use strict';

  // Read URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room') || 'pulse-room';
  const isSecondTab = window.location.hash.includes('peer') || urlParams.get('peer') === '2';
  const defaultName = isSecondTab ? 'Peer-2' : 'Host';
  const userName = urlParams.get('user') || defaultName;

  // App State — strictly real online participants
  const state = {
    roomId,
    userName,
    callSeconds: 0,
    timerInterval: null,
    isP2PConnected: false,
    webrtc: null,
    activePeers: new Map() // socketId -> { id, name, stream, isSpeaking, isMuted }
  };

  // Socket.io for WebRTC signaling
  const socket = io();

  // DOM elements
  const videoGrid = document.getElementById('videoGrid');
  const remotePlaceholder = document.getElementById('remotePlaceholder');
  const localVideoEl = document.getElementById('localVideo');
  const p2pDot = document.getElementById('p2p-dot');
  const p2pStatusLabel = document.getElementById('p2p-status-label');
  const callTimerEl = document.getElementById('call-timer');
  const chatOnlinePill = document.getElementById('chatOnlinePill');
  const chatStream = document.getElementById('chat-stream');
  const chatInput = document.getElementById('chat-input');
  const sendMsgBtn = document.getElementById('send-msg-btn');
  const typingIndicator = document.getElementById('typing-indicator');
  const typingText = document.getElementById('typing-text');
  const toastEl = document.getElementById('app-toast');

  // Initialize WebRTC Manager
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
      showToast(`Connected with ${state.activePeers.get(remoteSocketId)?.name || 'peer'}`);
    },
    // On Remote Stream Removed
    (remoteSocketId) => {
      console.log('[Mesh] Remote peer stream disconnected:', remoteSocketId);
      removeRemotePeer(remoteSocketId);
      updateGridUI();
      if (state.activePeers.size === 0) {
        setP2PStatus(false);
      }
    },
    // On Audio Volume (Local Visualizer)
    (volume) => {
      const pipBars = document.querySelectorAll('.pip-soundwave-bar');
      pipBars.forEach((bar, index) => {
        const height = Math.max(2, Math.min(14, (volume / 100) * 14 * (0.7 + (index % 2) * 0.3)));
        bar.style.height = `${height}px`;
      });
    },
    // On P2P DataChannel Message (Peer-to-Peer Chat)
    (senderSocketId, payload) => {
      handleP2PMessage(senderSocketId, payload);
    },
    // On P2P DataChannel State Change
    (senderSocketId, channelState) => {
      console.log(`[Mesh] DataChannel (${senderSocketId}) state: ${channelState}`);
      setP2PStatus(channelState === 'open' || state.activePeers.size > 0);
    }
  );
  state.webrtc = webrtc;

  // ==========================================
  // REAL ONLINE PEER GRID MANAGEMENT
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

  /**
   * Updates the video grid layout based strictly on real online remote peers
   */
  function updateGridUI() {
    if (!videoGrid) return;

    const count = state.activePeers.size;

    // Reset grid layout classes
    videoGrid.className = 'w-full h-full grid gap-2 sm:gap-3 transition-all duration-300';

    if (count === 0) {
      if (remotePlaceholder) remotePlaceholder.classList.remove('hidden');
      videoGrid.classList.add('peer-grid-1');
      return;
    }

    if (remotePlaceholder) remotePlaceholder.classList.add('hidden');

    // Adaptive grid sizing for real connected peers
    if (count === 1) {
      videoGrid.classList.add('peer-grid-1');
    } else if (count === 2) {
      videoGrid.classList.add('peer-grid-2');
    } else if (count <= 4) {
      videoGrid.classList.add('peer-grid-4');
    } else {
      videoGrid.classList.add('peer-grid-6');
    }

    // Render cards for each real online peer
    state.activePeers.forEach((peer, peerId) => {
      let cardEl = document.getElementById(`peer-card-${peerId}`);
      if (!cardEl) {
        cardEl = createPeerCardElement(peerId, peer);
        videoGrid.appendChild(cardEl);
      }

      // Attach real remote video stream
      const videoEl = cardEl.querySelector('video');
      if (videoEl && peer.stream && videoEl.srcObject !== peer.stream) {
        videoEl.srcObject = peer.stream;
        videoEl.play().catch(e => console.log('Peer play handled:', e));
      }
    });
  }

  /**
   * Create an individual real peer video card
   */
  function createPeerCardElement(peerId, peer) {
    const card = document.createElement('div');
    card.id = `peer-card-${peerId}`;
    card.className = 'video-peer-card w-full h-full relative group';

    card.innerHTML = `
      <!-- Remote Video Stream -->
      <video class="w-full h-full object-cover relative z-10" playsinline autoplay></video>
      
      <!-- Video Backdrop Vignette -->
      <div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/90 via-transparent to-surface-container-lowest/30 z-10 pointer-events-none"></div>

      <!-- Peer Header Tag Top-Left -->
      <div class="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5">
        <div class="bg-surface-container-lowest/80 backdrop-blur-md px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-white/10 shadow-md">
          <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          <span class="text-xs font-headline font-semibold text-on-surface truncate max-w-[140px]">${escapeHtml(peer.name)}</span>
          <span class="bg-surface-container-high px-1 py-0.2 rounded text-[9px] font-mono text-primary font-bold uppercase">ONLINE</span>
        </div>
      </div>

      <!-- Video Telemetry Top-Right -->
      <div class="absolute top-2.5 right-2.5 z-20 flex items-center gap-1">
        <div class="bg-surface-container-lowest/70 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-mono text-primary border border-white/5">
          E2EE P2P
        </div>
      </div>

      <!-- Peer Acoustic Bar Bottom-Left -->
      <div class="absolute bottom-2.5 left-2.5 z-20 flex items-center gap-2">
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

    return card;
  }

  // ==========================================
  // CALL ENDURANCE (MAKE CALL LAST LONGER)
  // ==========================================

  /**
   * Starts call duration timer with persistence across refreshes
   */
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

  /**
   * Sets P2P Connection Status & Indicators
   */
  function setP2PStatus(connected) {
    state.isP2PConnected = connected;
    if (!p2pDot || !p2pStatusLabel) return;

    const peerCount = state.activePeers.size;

    if (connected && peerCount > 0) {
      p2pDot.className = 'w-2.5 h-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_#4edea3]';
      p2pStatusLabel.className = 'text-primary font-bold';
      p2pStatusLabel.textContent = `${peerCount + 1} online (Mesh E2EE)`;
    } else {
      p2pDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
      p2pStatusLabel.className = 'text-on-surface-variant font-medium';
      p2pStatusLabel.textContent = 'Waiting for peer';
    }
  }

  // ==========================================
  // REAL-TIME P2P CHAT
  // ==========================================

  function appendMilestone(text, iconName = 'info') {
    if (!chatStream) return;
    const div = document.createElement('div');
    div.className = 'flex items-center justify-center my-2';
    div.innerHTML = `
      <div class="bg-surface-container-low px-3 py-1 rounded-full flex items-center gap-2 shadow-sm border border-white/5 text-[11px] font-mono text-on-surface-variant">
        <span class="material-symbols-outlined text-primary text-[14px]">${iconName}</span>
        <span>${escapeHtml(text)}</span>
      </div>
    `;
    chatStream.appendChild(div);
    chatStream.scrollTop = chatStream.scrollHeight;
  }

  function appendChatMessage(msg) {
    if (!chatStream) return;

    const div = document.createElement('div');
    const isMe = msg.isMe;

    div.className = isMe
      ? 'flex flex-col items-end self-end max-w-[85%] space-y-1 ml-auto'
      : 'flex flex-col items-start self-start max-w-[85%] space-y-1 mr-auto';

    div.innerHTML = `
      <div class="${isMe ? 'bg-primary text-on-primary-container' : 'bg-surface-container-high text-on-surface border border-white/5'} px-3.5 py-2 rounded-2xl ${isMe ? 'rounded-br-xs' : 'rounded-bl-xs'} shadow-sm break-words leading-relaxed text-sm">
        ${escapeHtml(msg.text)}
      </div>
      <div class="flex items-center gap-1.5 px-1 text-[11px] font-mono text-on-surface-variant">
        <span>${escapeHtml(msg.sender)}</span>
        <span>•</span>
        <span>${msg.timestamp}</span>
        ${msg.isP2P ? '<span class="bg-primary/20 text-primary px-1 rounded text-[9px] font-bold">P2P</span>' : ''}
        ${isMe ? '<span class="material-symbols-outlined text-[13px] text-primary">done_all</span>' : ''}
      </div>
    `;

    chatStream.appendChild(div);
    chatStream.scrollTop = chatStream.scrollHeight;
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

  function getCurrentTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Sending messages directly to online peers
   */
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

    // Broadcast directly over WebRTC RTCDataChannel
    webrtc.sendP2PMessage({
      type: 'chat',
      msg: {
        ...msg,
        isMe: false,
        isP2P: true
      }
    });

    // Also broadcast over socket relay as mesh fallback
    socket.emit('chat-message-relay', { roomId: state.roomId, msg });
  }

  function handleP2PMessage(senderSocketId, payload) {
    if (!payload) return;

    if (payload.type === 'chat' && payload.msg) {
      const msg = payload.msg;
      msg.isMe = false;
      msg.isP2P = true;
      appendChatMessage(msg);
      showToast(`Message from ${msg.sender}`);
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
    typingTimeout = setTimeout(() => hideTyping(), 2000);
  }

  function hideTyping() {
    if (!typingIndicator) return;
    typingIndicator.classList.add('hidden');
    typingIndicator.classList.remove('flex');
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
      showToast('Invite link copied! Open in 2nd tab to connect.');
    }).catch(() => {
      showToast(`Room: ${state.roomId}`);
    });
  }

  // ==========================================
  // EVENT LISTENERS & WIRING
  // ==========================================

  function setupEvents() {
    // Copy Invite Links
    const copyBtns = [
      document.getElementById('copy-invite-btn'),
      document.getElementById('invite-peer-btn')
    ];
    copyBtns.forEach(btn => {
      if (btn) btn.addEventListener('click', copyInviteLink);
    });

    // Chat Composer
    if (sendMsgBtn) sendMsgBtn.addEventListener('click', sendMessage);
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      chatInput.addEventListener('input', () => {
        if (webrtc.hasActiveP2P()) {
          webrtc.sendP2PMessage({ type: 'typing', sender: state.userName });
        }
      });
    }

    // Quick Emoji button
    const emojiQuickBtn = document.getElementById('emoji-quick-btn');
    if (emojiQuickBtn && chatInput) {
      emojiQuickBtn.addEventListener('click', () => {
        chatInput.value += ' ✨ ';
        chatInput.focus();
      });
    }

    // Reaction Ribbon
    document.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.textContent.trim();
        spawnReaction(emoji);
        if (webrtc.hasActiveP2P()) {
          webrtc.sendP2PMessage({ type: 'reaction', emoji });
        }
        socket.emit('spawn-reaction', { roomId: state.roomId, emoji, sender: state.userName });
      });
    });

    // Microphone Toggle
    const toggleMicBtn = document.getElementById('toggleMicBtn');
    const micIcon = document.getElementById('micIcon');
    if (toggleMicBtn && micIcon) {
      toggleMicBtn.addEventListener('click', () => {
        const isEnabled = webrtc.toggleAudio();
        if (isEnabled) {
          toggleMicBtn.className = 'w-11 h-11 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg active:scale-95 transition-all';
          micIcon.textContent = 'mic';
          showToast('Microphone unmuted');
        } else {
          toggleMicBtn.className = 'w-11 h-11 rounded-full bg-error-container text-on-error flex items-center justify-center shadow-lg active:scale-95 transition-all';
          micIcon.textContent = 'mic_off';
          showToast('Microphone muted');
        }
      });
    }

    // Camera Toggle
    const toggleCamBtn = document.getElementById('toggleCamBtn');
    const camIcon = document.getElementById('camIcon');
    if (toggleCamBtn && camIcon) {
      toggleCamBtn.addEventListener('click', () => {
        const isEnabled = webrtc.toggleVideo();
        if (isEnabled) {
          toggleCamBtn.className = 'w-11 h-11 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center hover:text-primary active:scale-95 transition-all';
          camIcon.textContent = 'videocam';
          showToast('Camera enabled');
        } else {
          toggleCamBtn.className = 'w-11 h-11 rounded-full bg-error-container text-on-error flex items-center justify-center active:scale-95 transition-all';
          camIcon.textContent = 'videocam_off';
          showToast('Camera disabled');
        }
      });
    }

    // Screen Share Toggle
    const shareScreenBtn = document.getElementById('shareScreenBtn');
    if (shareScreenBtn) {
      shareScreenBtn.addEventListener('click', async () => {
        const isSharing = await webrtc.toggleScreenShare(localVideoEl);
        if (isSharing) {
          shareScreenBtn.classList.add('bg-secondary', 'text-on-secondary');
          showToast('Screen sharing started');
          appendMilestone(`${state.userName} started screen share`, 'screen_share');
        } else {
          shareScreenBtn.classList.remove('bg-secondary', 'text-on-secondary');
          showToast('Screen sharing stopped');
        }
      });
    }

    // Flip Camera Toggle
    const camFlipBtns = [
      document.getElementById('camFlipBtn'),
      document.getElementById('pipFlipCamBtn')
    ];
    camFlipBtns.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          webrtc.flipCamera(localVideoEl);
          showToast('Camera flipped');
        });
      }
    });
  }

  // Socket Signaling Handlers
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
      console.log('[Mesh] Real peer joined room:', socketId, name);
      state.activePeers.set(socketId, {
        id: socketId,
        name: name || `Peer (${socketId.slice(0, 4)})`,
        stream: null,
        isSpeaking: false,
        isMuted: false
      });
      updatePeerCounters();
      appendMilestone(`${name || 'Peer'} joined the call`, 'login');
      showToast(`${name || 'Peer'} joined call`);
    });

    socket.on('signal', ({ senderSocketId, signalData }) => {
      webrtc.handleSignal(senderSocketId, signalData);
    });

    socket.on('user-left', ({ socketId }) => {
      console.log('[Mesh] Real peer left room:', socketId);
      const peer = state.activePeers.get(socketId);
      const peerName = peer ? peer.name : 'Peer';
      webrtc.closePeer(socketId);
      removeRemotePeer(socketId);
      updateGridUI();
      appendMilestone(`${peerName} left the call`, 'logout');
      showToast(`${peerName} disconnected`);
    });

    socket.on('chat-message-relay', ({ msg }) => {
      if (msg && !msg.isMe) {
        appendChatMessage({ ...msg, isMe: false });
      }
    });

    socket.on('reaction-spawned', ({ emoji }) => {
      spawnReaction(emoji);
    });
  }

  // App Startup
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
  });

})();
