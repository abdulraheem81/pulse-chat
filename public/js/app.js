/**
 * Pulse — Real Online P2P Multi-Peer Video, Audio & Chat Application
 * Features:
 * - Dynamic Video Sizing, Layout Modes (Grid vs Spotlight), and Full Screen controls
 * - Interactive Draggable & Resizable Picture-in-Picture (PiP)
 * - Per-video aspect ratio toggle (Fit / Fill)
 * - Real online callers only in WebRTC mesh
 * - Call endurance keep-alive & real-time chat
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
    callSeconds: 0,
    timerInterval: null,
    isP2PConnected: false,
    webrtc: null,
    activePeers: new Map(), // socketId -> { id, name, stream, isSpeaking, isMuted }
    layoutMode: 'grid',    // 'grid' or 'spotlight'
    pinnedPeerId: null,    // socketId of pinned/spotlight peer
    globalFitMode: 'cover', // 'cover' or 'contain'
    pipSizeIndex: 1        // 0: S (130px), 1: M (180px), 2: L (260px), 3: XL (340px)
  };

  const PIP_SIZES = [
    { label: 'S', width: 130 },
    { label: 'M', width: 180 },
    { label: 'L', width: 260 },
    { label: 'XL', width: 340 }
  ];

  // Socket.io for WebRTC signaling
  const socket = io();

  // DOM elements
  const videoStage = document.getElementById('videoStage');
  const videoGrid = document.getElementById('videoGrid');
  const remotePlaceholder = document.getElementById('remotePlaceholder');
  const pipBox = document.getElementById('pipBox');
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

  // Bandwidth & Low-Data Controls
  const bandwidthBtn = document.getElementById('bandwidthBtn');
  const bandwidthLabel = document.getElementById('bandwidthLabel');
  const bandwidthIcon = document.getElementById('bandwidthIcon');
  const netLatency = document.getElementById('netLatency');
  const audioOnlyBtn = document.getElementById('audioOnlyBtn');
  const audioOnlyIcon = document.getElementById('audioOnlyIcon');

  // Toolbar & Sizing DOM elements
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
      if (state.pinnedPeerId === remoteSocketId) {
        state.pinnedPeerId = null;
      }
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

  /**
   * Updates the video grid layout: Grid Mode vs Spotlight Mode
   */
  function updateGridUI() {
    if (!videoGrid) return;

    const count = state.activePeers.size;

    if (count === 0) {
      if (remotePlaceholder) remotePlaceholder.classList.remove('hidden');
      videoGrid.className = 'w-full h-full grid gap-2 sm:gap-3 transition-all duration-300 peer-grid-1';
      return;
    }

    if (remotePlaceholder) remotePlaceholder.classList.add('hidden');

    // 1. Spotlight / Pinned Mode
    if (state.layoutMode === 'spotlight' || state.pinnedPeerId) {
      // Determine which peer to pin
      let pinnedId = state.pinnedPeerId;
      if (!pinnedId || !state.activePeers.has(pinnedId)) {
        pinnedId = state.activePeers.keys().next().value;
        state.pinnedPeerId = pinnedId;
      }

      videoGrid.className = 'w-full h-full peer-grid-spotlight relative overflow-hidden transition-all duration-300';

      // Ensure thumbnail strip container exists
      let thumbStrip = videoGrid.querySelector('.thumbnail-strip');
      if (!thumbStrip) {
        thumbStrip = document.createElement('div');
        thumbStrip.className = 'thumbnail-strip';
      }

      state.activePeers.forEach((peer, peerId) => {
        let cardEl = document.getElementById(`peer-card-${peerId}`);
        if (!cardEl) {
          cardEl = createPeerCardElement(peerId, peer);
        }

        const videoEl = cardEl.querySelector('video');
        if (videoEl && peer.stream && videoEl.srcObject !== peer.stream) {
          videoEl.srcObject = peer.stream;
          videoEl.play().catch(e => console.log('Peer play:', e));
        }

        if (peerId === pinnedId) {
          cardEl.classList.add('pinned');
          // Put pinned card in main grid container
          if (cardEl.parentElement !== videoGrid) {
            videoGrid.insertBefore(cardEl, thumbStrip);
          }
        } else {
          cardEl.classList.remove('pinned');
          // Put other cards in thumbnail strip
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

    // 2. Normal Equal Grid Mode
    // Remove thumbnail strip and clean pinned classes
    const existingStrip = videoGrid.querySelector('.thumbnail-strip');
    if (existingStrip) {
      const cardsInStrip = Array.from(existingStrip.children);
      cardsInStrip.forEach(c => videoGrid.appendChild(c));
      existingStrip.remove();
    }

    videoGrid.className = 'w-full h-full grid gap-2 sm:gap-3 transition-all duration-300';

    if (count === 1) {
      videoGrid.classList.add('peer-grid-1');
    } else if (count === 2) {
      videoGrid.classList.add('peer-grid-2');
    } else if (count <= 4) {
      videoGrid.classList.add('peer-grid-4');
    } else {
      videoGrid.classList.add('peer-grid-6');
    }

    state.activePeers.forEach((peer, peerId) => {
      let cardEl = document.getElementById(`peer-card-${peerId}`);
      if (!cardEl) {
        cardEl = createPeerCardElement(peerId, peer);
        videoGrid.appendChild(cardEl);
      }
      cardEl.classList.remove('pinned');

      const videoEl = cardEl.querySelector('video');
      if (videoEl && peer.stream && videoEl.srcObject !== peer.stream) {
        videoEl.srcObject = peer.stream;
        videoEl.play().catch(e => console.log('Peer play:', e));
      }
    });

    updateLayoutToolbarUI();
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

  /**
   * Create an individual real peer video card with resize & fullscreen controls
   */
  function createPeerCardElement(peerId, peer) {
    const card = document.createElement('div');
    card.id = `peer-card-${peerId}`;
    card.className = 'video-peer-card w-full h-full relative group';

    const fitClass = state.globalFitMode === 'contain' ? 'object-contain' : 'object-cover';

    card.innerHTML = `
      <!-- Remote Video Stream -->
      <video class="w-full h-full ${fitClass} relative z-10 transition-all duration-200" playsinline autoplay></video>
      
      <!-- Video Backdrop Vignette -->
      <div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/90 via-transparent to-surface-container-lowest/30 z-10 pointer-events-none"></div>

      <!-- Peer Header Tag Top-Left -->
      <div class="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 pointer-events-none">
        <div class="bg-surface-container-lowest/80 backdrop-blur-md px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-white/10 shadow-md">
          <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          <span class="text-xs font-headline font-semibold text-on-surface truncate max-w-[140px]">${escapeHtml(peer.name)}</span>
          <span class="bg-surface-container-high px-1 py-0.2 rounded text-[9px] font-mono text-primary font-bold uppercase">ONLINE</span>
        </div>
      </div>

      <!-- Video Control Actions Top-Right -->
      <div class="absolute top-2.5 right-2.5 z-20 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
        <!-- Pin / Spotlight Button -->
        <button class="peer-pin-btn w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-on-surface hover:text-primary flex items-center justify-center text-[12px] shadow-sm transition-colors" title="Pin / Spotlight this video">
          <span class="material-symbols-outlined text-[14px]">push_pin</span>
        </button>

        <!-- Fit / Crop Button -->
        <button class="peer-fit-btn w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-on-surface hover:text-primary flex items-center justify-center text-[12px] shadow-sm transition-colors" title="Toggle Fit / Crop">
          <span class="material-symbols-outlined text-[14px]">fit_screen</span>
        </button>

        <!-- Fullscreen Button -->
        <button class="peer-fs-btn w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-on-surface hover:text-primary flex items-center justify-center text-[12px] shadow-sm transition-colors" title="Full Screen Video">
          <span class="material-symbols-outlined text-[14px]">fullscreen</span>
        </button>
      </div>

      <!-- Peer Acoustic Bar Bottom-Left -->
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

    // Hook buttons on the card
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
        if (isContain) {
          videoEl.classList.remove('object-contain');
          videoEl.classList.add('object-cover');
          showToast('Video set to fill frame (cover)');
        } else {
          videoEl.classList.remove('object-cover');
          videoEl.classList.add('object-contain');
          showToast('Video set to full view (fit)');
        }
      });
    }

    if (fsBtn) {
      fsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreen(card);
      });
    }

    // Double-click card to Pin / Unpin
    card.addEventListener('dblclick', () => {
      togglePinPeer(peerId);
    });

    return card;
  }

  /**
   * Toggles pinning / spotlighting a peer
   */
  function togglePinPeer(peerId) {
    if (state.pinnedPeerId === peerId) {
      state.pinnedPeerId = null;
      state.layoutMode = 'grid';
      showToast('Exited spotlight view');
    } else {
      state.pinnedPeerId = peerId;
      state.layoutMode = 'spotlight';
      showToast('Video pinned to spotlight view');
    }
    updateGridUI();
  }

  /**
   * Fullscreen API handler (handles native fullscreen and escapes cleanly)
   */
  function toggleFullscreen(targetEl) {
    const el = targetEl || videoStage || document.documentElement;

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(err => console.warn('FS error:', err));
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
      showToast('Entered Fullscreen');
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      showToast('Exited Fullscreen');
    }
  }

  // Monitor fullscreen changes to update icon visuals
  function onFullscreenChange() {
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    const iconName = isFs ? 'fullscreen_exit' : 'fullscreen';
    if (stageFullscreenIcon) stageFullscreenIcon.textContent = iconName;
    if (dockFullscreenIcon) dockFullscreenIcon.textContent = iconName;
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // ==========================================
  // DRAGGABLE & RESIZABLE PIP (LOCAL SELF VIDEO)
  // ==========================================

  function setupPipControls() {
    if (!pipBox) return;

    // 1. Cycle PiP Size Button (S / M / L / XL)
    if (pipSizeBtn) {
      pipSizeBtn.addEventListener('click', () => {
        state.pipSizeIndex = (state.pipSizeIndex + 1) % PIP_SIZES.length;
        const currentPreset = PIP_SIZES[state.pipSizeIndex];
        pipSizeBtn.textContent = currentPreset.label;
        pipBox.style.width = `${currentPreset.width}px`;
        showToast(`PiP Size: ${currentPreset.label} (${currentPreset.width}px)`);
      });
    }

    // 2. PiP Fit / Contain Toggle
    if (pipFitBtn && localVideoEl) {
      pipFitBtn.addEventListener('click', () => {
        const isContain = localVideoEl.classList.contains('object-contain');
        if (isContain) {
          localVideoEl.classList.remove('object-contain');
          localVideoEl.classList.add('object-cover');
          showToast('Local cam: Crop Fill');
        } else {
          localVideoEl.classList.remove('object-cover');
          localVideoEl.classList.add('object-contain');
          showToast('Local cam: Full Fit');
        }
      });
    }

    // 3. PiP Fullscreen Toggle
    if (pipFullscreenBtn) {
      pipFullscreenBtn.addEventListener('click', () => {
        toggleFullscreen(pipBox);
      });
    }

    // 4. Interactive Drag-to-Resize Corner Handle (Freeform Sizing)
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
        // As user drags bottom-left handle leftward, width increases
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

    // 5. Interactive Drag-to-Move across Video Stage
    const dragTarget = pipDragHandle || pipBox;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    dragTarget.addEventListener('pointerdown', (e) => {
      // Don't drag if clicking buttons or resize handle
      if (e.target.closest('button') || e.target.closest('#pipResizeHandle')) return;

      isDragging = true;
      pipBox.classList.add('dragging');
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const rect = pipBox.getBoundingClientRect();
      const parentRect = (videoStage || pipBox.parentElement).getBoundingClientRect();

      initialLeft = rect.left - parentRect.left;
      initialTop = rect.top - parentRect.top;

      pipBox.style.right = 'auto'; // release fixed right alignment
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
  // CALL ENDURANCE (MAKE CALL LAST LONGER)
  // ==========================================

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

    // Layout Mode Toggle Buttons
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

    // Global Video Fit/Fill Toggle
    if (toggleFitBtn) {
      toggleFitBtn.addEventListener('click', () => {
        state.globalFitMode = state.globalFitMode === 'cover' ? 'contain' : 'cover';
        const isContain = state.globalFitMode === 'contain';
        if (fitText) fitText.textContent = isContain ? 'Fit' : 'Fill';
        if (fitIcon) fitIcon.textContent = isContain ? 'aspect_ratio' : 'crop_free';

        // Apply to all video elements in grid
        document.querySelectorAll('#videoGrid video').forEach(v => {
          if (isContain) {
            v.classList.remove('object-cover');
            v.classList.add('object-contain');
          } else {
            v.classList.remove('object-contain');
            v.classList.add('object-cover');
          }
        });

        showToast(isContain ? 'Video mode: Full frame (Fit)' : 'Video mode: Zoom fill (Cover)');
      });
    }

    // Stage Fullscreen Buttons
    if (stageFullscreenBtn) {
      stageFullscreenBtn.addEventListener('click', () => toggleFullscreen(videoStage));
    }
    if (dockFullscreenBtn) {
      dockFullscreenBtn.addEventListener('click', () => toggleFullscreen(videoStage));
    }

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

    // PiP Interactive Drag & Resize
    setupPipControls();

    // Low-Bandwidth Mode & Live Network Telemetry
    setupBandwidthControls();
  }

  function setupBandwidthControls() {
    const profileKeys = ['saver', 'balanced', 'hd', 'audio-only'];
    let currentProfileIdx = 0;

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
        if (profileKey === 'audio-only') {
          audioOnlyBtn.className = 'w-11 h-11 rounded-full bg-secondary text-on-secondary flex items-center justify-center shadow-lg active:scale-95 transition-all';
        } else {
          audioOnlyBtn.className = 'w-11 h-11 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center hover:text-primary active:scale-95 transition-all';
        }
      }
    }

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

    // Initialize UI
    updateBandwidthUI(webrtc.bandwidthProfile);

    // Live WebRTC Network Telemetry & Auto Adaptation
    webrtc.startStatsMonitoring((stats) => {
      if (netLatency) {
        const lossText = stats.loss > 0 ? ` • ${stats.loss}% loss` : '';
        netLatency.textContent = `• ${stats.rtt}ms${lossText}`;
      }
      updateBandwidthUI(webrtc.bandwidthProfile);
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
      if (state.pinnedPeerId === socketId) {
        state.pinnedPeerId = null;
      }
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
