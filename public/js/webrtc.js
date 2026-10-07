/**
 * WebRTC and Media Stream Manager
 * Handles local media capture, screen sharing, peer connections, and Web Audio API analysis
 */

class WebRTCManager {
  constructor(socket, onRemoteStreamCallback, onAudioVolumeCallback, onDataChannelMessageCallback, onDataChannelStateChangeCallback) {
    this.socket = socket;
    this.onRemoteStream = onRemoteStreamCallback;
    this.onAudioVolume = onAudioVolumeCallback;
    this.onDataChannelMessage = onDataChannelMessageCallback;
    this.onDataChannelStateChange = onDataChannelStateChangeCallback;

    this.localStream = null;
    this.screenStream = null;
    this.peerConnections = new Map(); // socketId -> RTCPeerConnection
    this.dataChannels = new Map(); // socketId -> RTCDataChannel
    this.audioContext = null;
    this.analyser = null;
    this.animationFrameId = null;

    this.isAudioMuted = false;
    this.isVideoMuted = false;
    this.isScreenSharing = false;
    this.facingMode = 'user'; // 'user' or 'environment'

    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  /**
   * Initializes local media stream (camera + mic)
   * If hardware is unavailable or blocked, falls back gracefully to a synthetic stream.
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
      console.warn('Real camera/mic unavailable or permission denied. Falling back to synthetic media stream:', err.message);
      this.localStream = this.createSyntheticStream();
    }

    if (!this.localStream) {
      this.localStream = this.createSyntheticStream();
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
   * Create an animated synthetic Canvas & Audio stream if hardware camera is not accessible
   */
  createSyntheticStream() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let frame = 0;

    function draw() {
      frame++;
      // Obsidian futuristic visual feed
      ctx.fillStyle = '#0f131c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const grad = ctx.createRadialGradient(320, 240, 40, 320, 240, 260);
      grad.addColorStop(0, 'rgba(78, 222, 163, 0.25)');
      grad.addColorStop(0.6, 'rgba(99, 102, 241, 0.15)');
      grad.addColorStop(1, 'rgba(15, 19, 28, 0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Rotating radar circle
      ctx.strokeStyle = '#4edea3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const radius = 90 + Math.sin(frame * 0.05) * 10;
      ctx.arc(320, 240, radius, 0, Math.PI * 2);
      ctx.stroke();

      // User avatar symbol
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 24px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LOCAL USER CAM', 320, 235);

      ctx.fillStyle = '#bbcabf';
      ctx.font = '14px "JetBrains Mono", monospace';
      ctx.fillText(`HD STREAM • ${Math.round(60 + Math.sin(frame * 0.1) * 2)} FPS`, 320, 265);

      requestAnimationFrame(draw);
    }
    draw();

    const videoStream = canvas.captureStream(30);

    // Synthetic audio oscillator
    let audioStreamTrack;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const actx = new AudioCtx();
      const osc = actx.createOscillator();
      const dst = actx.createMediaStreamDestination();
      osc.frequency.setValueAtTime(440, actx.currentTime);
      const gain = actx.createGain();
      gain.gain.setValueAtTime(0.001, actx.currentTime); // very low volume
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      audioStreamTrack = dst.stream.getAudioTracks()[0];
    } catch (e) {
      console.log('Synth audio skip:', e);
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
        const average = sum / bufferLength; // 0 to 255
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
    // Replace track in existing peer connections
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
      // Revert to camera
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

        // Replace track on all peer connections
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
   * Setup RTCDataChannel event handlers for peer-to-peer data transmission
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

    // Remote Track received
    pc.ontrack = (event) => {
      console.log('Received remote track from:', targetSocketId, event.streams[0]);
      if (this.onRemoteStream) {
        this.onRemoteStream(targetSocketId, event.streams[0]);
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
        await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
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
  }

  cleanUp() {
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
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

window.WebRTCManager = WebRTCManager;
