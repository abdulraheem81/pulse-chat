/**
 * Pulse — Simple P2P Video, Audio & Text Chat Application
 */

(function () {
  'use strict';

  // Read URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room') || 'pulse-room';
  const isSecondTab = window.location.hash.includes('peer') || urlParams.get('peer') === '2';
  const defaultName = isSecondTab ? 'Guest' : 'Host';
  const userName = urlParams.get('user') || defaultName;

  const state = {
    roomId,
    userName,
    callSeconds: 0,
    timerInterval: null,
    isP2PConnected: false,
    webrtc: null
  };

  // Socket.io for WebRTC signaling
  const socket = io();

  // DOM elements
  const localVideoEl = document.getElementById('localVideo');
  const remoteVideoEl = document.getElementById('remoteVideo');
  const remotePlaceholder = document.getElementById('remotePlaceholder');
  const remotePeerTag = document.getElementById('remotePeerTag');
  const remotePeerName = document.getElementById('remotePeerName');
  const p2pDot = document.getElementById('p2p-dot');
  const p2pStatusLabel = document.getElementById('p2p-status-label');
  const callTimerEl = document.getElementById('call-timer');
  const chatStream = document.getElementById('chat-stream');
  const chatInput = document.getElementById('chat-input');
  const sendMsgBtn = document.getElementById('send-msg-btn');
  const typingIndicator = document.getElementById('typing-indicator');
  const typingText = document.getElementById('typing-text');
  const toastEl = document.getElementById('app-toast');

  // Initialize WebRTC
  const webrtc = new WebRTCManager(
    socket,
    // On Remote Stream Received
    (remoteSocketId, stream) => {
      console.log('Remote stream connected:', remoteSocketId);
      if (remoteVideoEl) {
        remoteVideoEl.srcObject = stream;
        remoteVideoEl.classList.remove('hidden');
        remoteVideoEl.play().catch(e => console.log('Remote play:', e));
      }
      if (remotePlaceholder) remotePlaceholder.classList.add('hidden');
      if (remotePeerTag) {
        remotePeerTag.classList.remove('hidden');
        remotePeerTag.classList.add('flex');
      }
      setP2PStatus(true);
      showToast('Peer connected with video & audio!');
    },
    // On Audio Volume (Visualizer)
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
      console.log(`P2P DataChannel (${senderSocketId}) state: ${channelState}`);
      setP2PStatus(channelState === 'open');
    }
  );
  state.webrtc = webrtc;

  // Set P2P Connection Status
  function setP2PStatus(connected) {
    state.isP2PConnected = connected;
    if (!p2pDot || !p2pStatusLabel) return;

    if (connected) {
      p2pDot.className = 'w-2.5 h-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_#4edea3]';
      p2pStatusLabel.className = 'text-primary font-bold';
      p2pStatusLabel.textContent = 'P2P Connected (E2EE)';
    } else {
      p2pDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
      p2pStatusLabel.className = 'text-on-surface-variant font-medium';
      p2pStatusLabel.textContent = 'Waiting for peer';
    }
  }

  // Toast notifications
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

  // Call timer
  function startCallTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      state.callSeconds++;
      const mins = Math.floor(state.callSeconds / 60);
      const secs = state.callSeconds % 60;
      if (callTimerEl) {
        callTimerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
    }, 1000);
  }

  // Handle incoming P2P message
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

  // Typing indicator
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

  // Append Chat Message to Stream
  function appendChatMessage(msg) {
    if (!chatStream) return;

    const div = document.createElement('div');
    const isMe = msg.isMe;

    div.className = isMe
      ? 'flex flex-col items-end self-end max-w-[85%] space-y-1 ml-auto'
      : 'flex flex-col items-start self-start max-w-[85%] space-y-1 mr-auto';

    div.innerHTML = `
      <div class="${isMe ? 'bg-primary text-on-primary-container' : 'bg-surface-container-high text-on-surface'} px-3.5 py-2 rounded-2xl ${isMe ? 'rounded-br-xs' : 'rounded-bl-xs'} shadow-sm break-words leading-relaxed text-sm">
        ${escapeHtml(msg.text)}
      </div>
      <div class="flex items-center gap-1.5 px-1 text-[11px] font-mono text-on-surface-variant">
        <span>${escapeHtml(msg.sender)}</span>
        <span>•</span>
        <span>${msg.timestamp}</span>
        ${msg.isP2P ? '<span class="bg-primary/20 text-primary px-1 rounded text-[9px] font-bold">P2P</span>' : ''}
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

  // Send message
  function sendMessage() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isDirectP2P = webrtc.hasActiveP2P();

    const msg = {
      id: 'msg-' + Date.now(),
      text,
      sender: state.userName,
      isMe: true,
      isP2P: isDirectP2P,
      timestamp: timeStr
    };

    // Render locally immediately
    appendChatMessage(msg);
    chatInput.value = '';

    // Send via P2P DataChannel
    const sentP2P = webrtc.sendP2PMessage({
      type: 'chat',
      msg: {
        ...msg,
        isMe: false,
        isP2P: true
      }
    });

    if (sentP2P) {
      console.log('[P2P] Message sent directly over RTCDataChannel');
    } else {
      // Fallback relay via socket if peer is still connecting
      socket.emit('chat-message-relay', { roomId: state.roomId, msg });
    }
  }

  // Spawn floating reactions
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
        el.style.transform = `scale(1.3) translate(${driftX}px, -300px)`;
        el.style.opacity = '0';
      });

      setTimeout(() => el.remove(), 1600);
    }
  }

  // Copy Invite Link
  function copyInviteLink() {
    const inviteUrl = `${window.location.origin}/?room=${encodeURIComponent(state.roomId)}&peer=2`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      showToast('Invite link copied! Open in a second tab to connect.');
    }).catch(() => {
      showToast(`Room: ${state.roomId}`);
    });
  }

  // Setup Event Listeners
  function setupEvents() {
    // Copy invite links
    const copyBtns = [
      document.getElementById('copy-invite-btn'),
      document.getElementById('invite-peer-btn')
    ];
    copyBtns.forEach(btn => {
      if (btn) btn.addEventListener('click', copyInviteLink);
    });

    // Chat input & send
    if (sendMsgBtn) {
      sendMsgBtn.addEventListener('click', sendMessage);
    }
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      chatInput.addEventListener('input', () => {
        if (webrtc.hasActiveP2P()) {
          webrtc.sendP2PMessage({
            type: 'typing',
            sender: state.userName
          });
        }
      });
    }

    // Quick emoji button
    const emojiQuickBtn = document.getElementById('emoji-quick-btn');
    if (emojiQuickBtn) {
      emojiQuickBtn.addEventListener('click', () => {
        if (chatInput) {
          chatInput.value += ' ✨ ';
          chatInput.focus();
        }
      });
    }

    // Reaction ribbon
    document.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.textContent.trim();
        spawnReaction(emoji);
        if (webrtc.hasActiveP2P()) {
          webrtc.sendP2PMessage({ type: 'reaction', emoji });
        }
      });
    });

    // Microphone toggle
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

    // Camera toggle
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

    // Screen sharing
    const shareScreenBtn = document.getElementById('shareScreenBtn');
    if (shareScreenBtn) {
      shareScreenBtn.addEventListener('click', async () => {
        const isSharing = await webrtc.toggleScreenShare(localVideoEl);
        if (isSharing) {
          shareScreenBtn.classList.add('bg-secondary', 'text-on-secondary');
          showToast('Screen sharing started');
        } else {
          shareScreenBtn.classList.remove('bg-secondary', 'text-on-secondary');
          showToast('Screen sharing stopped');
        }
      });
    }

    // Flip Camera
    const camFlipBtn = document.getElementById('camFlipBtn');
    if (camFlipBtn) {
      camFlipBtn.addEventListener('click', () => {
        webrtc.flipCamera(localVideoEl);
        showToast('Camera flipped');
      });
    }
  }

  // Socket signaling setup
  function setupSocket() {
    socket.on('existing-users', (users) => {
      console.log('Existing users in room:', users);
      users.forEach(u => webrtc.callUser(u.socketId));
    });

    socket.on('user-joined', ({ socketId, name }) => {
      console.log('Peer joined room:', socketId, name);
      if (remotePeerName) remotePeerName.textContent = name || 'Peer';
      showToast(`${name || 'Peer'} joined room`);
    });

    socket.on('signal', ({ senderSocketId, signalData }) => {
      webrtc.handleSignal(senderSocketId, signalData);
    });

    socket.on('user-left', ({ socketId }) => {
      console.log('Peer left room:', socketId);
      webrtc.closePeer(socketId);
      if (remoteVideoEl) {
        remoteVideoEl.classList.add('hidden');
        remoteVideoEl.srcObject = null;
      }
      if (remotePlaceholder) remotePlaceholder.classList.remove('hidden');
      if (remotePeerTag) remotePeerTag.classList.add('hidden');
      setP2PStatus(false);
      showToast('Peer disconnected');
    });

    // Relay fallback
    socket.on('chat-message-relay', ({ msg }) => {
      if (!msg.isMe) {
        appendChatMessage({ ...msg, isMe: false });
      }
    });
  }

  // App startup
  document.addEventListener('DOMContentLoaded', async () => {
    setupEvents();
    setupSocket();
    startCallTimer();

    // Start local camera & microphone
    await webrtc.initLocalStream(localVideoEl);

    // Join room for WebRTC P2P signaling
    socket.emit('join-video-room', {
      roomId: state.roomId,
      userName: state.userName
    });

    console.log(`Joined room ${state.roomId} as ${state.userName}`);
  });

})();
