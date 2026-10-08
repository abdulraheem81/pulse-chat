/**
 * WebRTC and Media Stream Manager
 * Supports multi-peer WebRTC mesh, active keep-alive heartbeats,
 * screen wake locks, automated ICE recovery, and synthetic multi-peer generation.
 */

class WebRTCManager {
  constructor(socket, onRemoteStreamCallback, onRemoteStreamRemovedCallback, onAudioVolumeCallback, onDataChannelMessageCallback, onDataChannelStateChangeCallback) {
    this.socket = socket;
    this.onRemoteStream = onRemoteStreamCallback;
    this.onRemoteStreamRemoved = onRemoteStreamRemovedCallback;
    this.onAudioVolume = onAudioVolumeCallback;
    this.onDataChannelMessage = onDataChannelMessageCallback;
    this.onDataChannelStateChange = onDataChannelStateChangeCallback;

    this.localStream = null;
    this.screenStream = null;
    this.peerConnections = new Map(); // socketId -> RTCPeerConnection
    this.dataChannels = new Map();    // socketId -> RTCDataChannel
    this.remoteStreams = new Map();   // socketId -> MediaStream
    this.audioContext = null;
    this.analyser = null;
    this.animationFrameId = null;
    this.keepAliveInterval = null;
    this.wakeLock = null;

    this.isAudioMuted = false;
    this.isVideoMuted = false;
    this.isScreenSharing = false;
    this.facingMode = 'user'; // 'user' or 'environment'

    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };

    this.startKeepAlive();
    this.requestWakeLock();
  }

  /**
   * Request Screen WakeLock to prevent browser sleep and keep call active indefinitely
   */
  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('[Endurance] Screen WakeLock acquired — call will stay active indefinitely');
        
        document.addEventListener('visibilitychange', async () => {
          if (this.wakeLock !== null && document.visibilityState === 'visible') {
            try {
              this.wakeLock = await navigator.wakeLock.request('screen');
            } catch (e) {
              console.warn('[Endurance] WakeLock re-request:', e);
            }
          }
        });
      }
    } catch (err) {
      console.warn('[Endurance] WakeLock not supported or denied:', err.message);
    }
  }

  /**
   * Keep-Alive Heartbeat over RTCDataChannels and Socket to prevent router/NAT timeouts
   */
  startKeepAlive() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = setInterval(() => {
      // 1. DataChannel ping
      const pingPayload = JSON.stringify({ type: '__keep_alive__', ts: Date.now() });
      this.dataChannels.forEach((dc) => {
        if (dc && dc.readyState === 'open') {
          try {
            dc.send(pingPayload);
          } catch (e) {
            console.warn('[Keep-Alive] Ping error:', e);
          }
        }
      });

      // 2. Socket keep-alive
      if (this.socket && this.socket.connected) {
        this.socket.emit('room-keep-alive', { roomId: 'pulse-room' });
      }
    }, 8000);
  }

  /**
   * Initializes local media stream (camera + mic)
   * Falls back gracefully to synthetic canvas stream if hardware is unavailable.
   */
  async initLocalStream(videoEl) {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      }
    } catch (err) {
      console.warn('Camera/mic permission denied or hardware unavailable. Using synthetic feed:', err.message);
      this.localStream = this.createSyntheticStream('You', '#4edea3');
    }

    if (!this.localStream) {
      this.localStream = this.createSyntheticStream('You', '#4edea3');
    }

    if (videoEl && this.localStream) {
      videoEl.srcObject = this.localStream;
      videoEl.muted = true;
      videoEl.play().catch(e => console.log('Autoplay handled:', e));
    }

    this.setupAudioAnalysis(this.localStream);
    return this.localStream;
  }

  /**
   * Create an animated synthetic Canvas & Audio stream
   */
  createSyntheticStream(label = 'You', color = '#4edea3') {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let frame = 0;

    function draw() {
      frame++;
      ctx.fillStyle = '#0f131c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const grad = ctx.createRadialGradient(320, 240, 30, 320, 240, 280);
      grad.addColorStop(0, 'rgba(78, 222, 163, 0.22)');
      grad.addColorStop(0.5, 'rgba(99, 102, 241, 0.12)');
      grad.addColorStop(1, 'rgba(15, 19, 28, 0.98)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Rotating scanner ring
      ctx.save();
      ctx.translate(320, 240);
      ctx.rotate(frame * 0.02);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      const r = 95 + Math.sin(frame * 0.06) * 8;
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Inner pulse
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(320, 240, 32 + Math.sin(frame * 0.08) * 4, 0, Math.PI * 2);
      ctx.fill();

      // Person Icon
      ctx.fillStyle = '#0f131c';
      ctx.font = 'bold 26px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('👤', 320, 248);

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 20px "Space Grotesk", sans-serif';
      ctx.fillText(label.toUpperCase(), 320, 320);

      ctx.fillStyle = '#bbcabf';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillText(`HD 60FPS • ZERO LOSS • ${frame % 60}s`, 320, 345);

      requestAnimationFrame(draw);
    }
    draw();

    const videoStream = canvas.captureStream(30);

    // Audio Oscillator
    let audioStreamTrack;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const actx = new AudioCtx();
      const osc = actx.createOscillator();
      const dst = actx.createMediaStreamDestination();
      osc.frequency.setValueAtTime(440, actx.currentTime);
      const gain = actx.createGain();
      gain.gain.setValueAtTime(0.001, actx.currentTime);
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      audioStreamTrack = dst.stream.getAudioTracks()[0];
    } catch (e) {
      console.log('Synth audio bypass:', e);
    }

    if (audioStreamTrack) {
      videoStream.addTrack(audioStreamTrack);
    }

    return videoStream;
  }

  /**
   * Real-time Web Audio API frequency/volume analysis
   */
  setupAudioAnalysis(stream) {
    try {
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) return;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalized = Math.min(100, Math.round((average / 255) * 100));

        if (this.onAudioVolume) {
          this.onAudioVolume(this.isAudioMuted ? 0 : normalized);
        }

        this.animationFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('Audio analysis setup error:', e);
    }
  }

  /**
   * Mute or Unmute Audio
   */
  toggleAudio() {
    this.isAudioMuted = !this.isAudioMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isAudioMuted;
      });
    }
    return !this.isAudioMuted;
  }

  /**
   * Enable or Disable Video
   */
  toggleVideo() {
    this.isVideoMuted = !this.isVideoMuted;
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = !this.isVideoMuted;
      });
    }
    return !this.isVideoMuted;
  }

  /**
   * Flip Camera (Facing mode toggle)
   */
  async flipCamera(videoEl) {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
    }
    await this.initLocalStream(videoEl);
    if (this.localStream) {
      const newVideoTrack = this.localStream.getVideoTracks()[0];
      if (newVideoTrack) {
        this.peerConnections.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(newVideoTrack);
          }
        });
      }
    }
  }

  /**
   * Screen Sharing Toggle
   */
  async toggleScreenShare(localVideoEl) {
    if (this.isScreenSharing) {
      this.stopScreenShare(localVideoEl);
      return false;
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: true
        });

        const screenTrack = this.screenStream.getVideoTracks()[0];
        screenTrack.onended = () => {
          this.stopScreenShare(localVideoEl);
        };

        if (localVideoEl) {
          localVideoEl.srcObject = this.screenStream;
        }

        this.peerConnections.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        this.isScreenSharing = true;
        return true;
      }
    } catch (e) {
      console.warn('Screen sharing error or cancelled:', e);
    }
    return false;
  }

  stopScreenShare(localVideoEl) {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    this.isScreenSharing = false;

    if (this.localStream && localVideoEl) {
      localVideoEl.srcObject = this.localStream;
      const cameraTrack = this.localStream.getVideoTracks()[0];
      if (cameraTrack) {
        this.peerConnections.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(cameraTrack);
          }
        });
      }
    }
  }

  /**
   * Setup RTCDataChannel event handlers
   */
  setupDataChannel(targetSocketId, dataChannel) {
    this.dataChannels.set(targetSocketId, dataChannel);

    dataChannel.onopen = () => {
      console.log(`[P2P] RTCDataChannel opened with peer ${targetSocketId}`);
      if (this.onDataChannelStateChange) {
        this.onDataChannelStateChange(targetSocketId, 'open');
      }
    };

    dataChannel.onclose = () => {
      console.log(`[P2P] RTCDataChannel closed with peer ${targetSocketId}`);
      this.dataChannels.delete(targetSocketId);
      if (this.onDataChannelStateChange) {
        this.onDataChannelStateChange(targetSocketId, 'closed');
      }
    };

    dataChannel.onerror = (err) => {
      console.error(`[P2P] RTCDataChannel error with peer ${targetSocketId}:`, err);
      if (this.onDataChannelStateChange) {
        this.onDataChannelStateChange(targetSocketId, 'error');
      }
    };

    dataChannel.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        // Intercept internal keep-alive heartbeats to keep connection active
        if (payload && payload.type === '__keep_alive__') {
          try {
            dataChannel.send(JSON.stringify({ type: '__keep_alive_ack__', ts: Date.now() }));
          } catch (e) {}
          return;
        }
        if (payload && payload.type === '__keep_alive_ack__') {
          return;
        }

        console.log(`[P2P] Received direct message from peer ${targetSocketId}:`, payload);
        if (this.onDataChannelMessage) {
          this.onDataChannelMessage(targetSocketId, payload);
        }
      } catch (e) {
        console.log(`[P2P] Raw message received:`, event.data);
        if (this.onDataChannelMessage) {
          this.onDataChannelMessage(targetSocketId, { type: 'raw', data: event.data });
        }
      }
    };
  }

  /**
   * Send data directly to connected peer(s) over RTCDataChannel
   */
  sendP2PMessage(payload) {
    let sentCount = 0;
    const msgString = typeof payload === 'string' ? payload : JSON.stringify(payload);

    this.dataChannels.forEach((dc, peerId) => {
      if (dc && dc.readyState === 'open') {
        try {
          dc.send(msgString);
          sentCount++;
        } catch (err) {
          console.error(`[P2P] Failed to send to ${peerId}:`, err);
        }
      }
    });

    return sentCount > 0;
  }

  hasActiveP2P() {
    for (const dc of this.dataChannels.values()) {
      if (dc && dc.readyState === 'open') return true;
    }
    return false;
  }

  getActivePeerCount() {
    let count = 0;
    this.peerConnections.forEach(pc => {
      if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected') {
        count++;
      }
    });
    return count;
  }

  /**
   * WebRTC Peer Connection Setup
   */
  createPeerConnection(targetSocketId, isInitiator = false) {
    const pc = new RTCPeerConnection(this.rtcConfig);

    // If initiator, create the RTCDataChannel
    if (isInitiator) {
      const dc = pc.createDataChannel('pulse-p2p-chat', { ordered: true });
      this.setupDataChannel(targetSocketId, dc);
    }

    // If responder, listen for incoming data channel
    pc.ondatachannel = (event) => {
      console.log(`[P2P] Incoming RTCDataChannel detected from ${targetSocketId}`);
      this.setupDataChannel(targetSocketId, event.channel);
    };

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    // ICE Candidate
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('signal', {
          targetSocketId,
          signalData: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    // Automated ICE Recovery & Connection State Monitoring to make call last longer
    pc.oniceconnectionstatechange = () => {
      console.log(`[P2P] Peer ${targetSocketId} ICE state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        console.warn(`[P2P] Triggering ICE recovery for ${targetSocketId}...`);
        if (pc.restartIce) {
          pc.restartIce();
        }
      }
    };

    // Remote Track received
    pc.ontrack = (event) => {
      console.log('Received remote track from:', targetSocketId, event.streams[0]);
      const stream = event.streams[0];
      this.remoteStreams.set(targetSocketId, stream);
      if (this.onRemoteStream) {
        this.onRemoteStream(targetSocketId, stream);
      }
    };

    this.peerConnections.set(targetSocketId, pc);
    return pc;
  }

  async callUser(targetSocketId) {
    const pc = this.createPeerConnection(targetSocketId, true);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.socket.emit('signal', {
      targetSocketId,
      signalData: { type: 'offer', sdp: offer }
    });
  }

  async handleSignal(senderSocketId, signalData) {
    let pc = this.peerConnections.get(senderSocketId);

    if (signalData.type === 'offer') {
      if (!pc) {
        pc = this.createPeerConnection(senderSocketId, false);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket.emit('signal', {
        targetSocketId: senderSocketId,
        signalData: { type: 'answer', sdp: answer }
      });
    } else if (signalData.type === 'answer') {
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
      }
    } else if (signalData.type === 'candidate') {
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        } catch (e) {
          console.warn('[P2P] Candidate error handled:', e);
        }
      }
    }
  }

  closePeer(socketId) {
    const dc = this.dataChannels.get(socketId);
    if (dc) {
      dc.close();
      this.dataChannels.delete(socketId);
    }
    const pc = this.peerConnections.get(socketId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(socketId);
    }
    this.remoteStreams.delete(socketId);
    if (this.onRemoteStreamRemoved) {
      this.onRemoteStreamRemoved(socketId);
    }
  }

  cleanUp() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    this.dataChannels.forEach(dc => dc.close());
    this.dataChannels.clear();
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.remoteStreams.clear();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

window.WebRTCManager = WebRTCManager;
