/**
 * WebRTC and Media Stream Manager
 * Optimized for Low Bandwidth Connections:
 * - Dynamic Bitrate Adaptation & Sender Encoding Parameter limits (RTCRtpSender.setParameters)
 * - In-Band Forward Error Correction (FEC) & Discontinuous Transmission (DTX) for Opus Audio
 * - Resolution Scaling & Framerate Capping (Data Saver Mode)
 * - Real-time Network Telemetry & Automatic Bandwidth Adaptation
 * - Multi-Peer Mesh, Keep-Alive Heartbeat, and Screen WakeLock
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
    this.statsInterval = null;
    this.wakeLock = null;

    this.isAudioMuted = false;
    this.isVideoMuted = false;
    this.isScreenSharing = false;
    this.facingMode = 'user'; // 'user' or 'environment'

    // Low Bandwidth Profiles
    this.bandwidthProfile = 'saver'; // Default to Data Saver for low bandwidth resilience
    this.autoAdapt = true;

    this.bandwidthProfiles = {
      'saver': {
        key: 'saver',
        label: 'Data Saver (Low Bandwidth)',
        maxVideoBitrate: 160000,     // 160 kbps for smooth low-data video
        maxAudioBitrate: 20000,      // 20 kbps Opus voice
        scaleResolutionDownBy: 2.0,  // Downscale 2x
        maxFramerate: 15,            // 15 fps
        idealWidth: 480,
        idealHeight: 360
      },
      'balanced': {
        key: 'balanced',
        label: 'Balanced',
        maxVideoBitrate: 450000,     // 450 kbps
        maxAudioBitrate: 32000,      // 32 kbps
        scaleResolutionDownBy: 1.25,
        maxFramerate: 24,
        idealWidth: 640,
        idealHeight: 480
      },
      'hd': {
        key: 'hd',
        label: 'HD',
        maxVideoBitrate: 1200000,    // 1.2 Mbps
        maxAudioBitrate: 48000,
        scaleResolutionDownBy: 1.0,
        maxFramerate: 30,
        idealWidth: 1280,
        idealHeight: 720
      },
      'audio-only': {
        key: 'audio-only',
        label: 'Audio Only (Ultra-Low Bandwidth)',
        maxVideoBitrate: 0,
        maxAudioBitrate: 16000,      // 16 kbps ultra-low
        scaleResolutionDownBy: 4.0,
        maxFramerate: 5,
        audioOnly: true
      }
    };

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
   * Initializes local media stream with low-bandwidth friendly audio and video constraints
   */
  async initLocalStream(videoEl) {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Optimized for network efficiency: mono audio channel + efficient resolution
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: this.facingMode,
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 20, max: 24 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1 // Mono audio uses 50% less data with optimal voice fidelity
          }
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
   * Dynamically switch bandwidth profile (e.g. 'saver', 'balanced', 'hd', 'audio-only')
   * Applies encoding parameters to all active RTCRtpSenders immediately without renegotiating!
   */
  setBandwidthProfile(profileKey) {
    const profile = this.bandwidthProfiles[profileKey];
    if (!profile) return;

    this.bandwidthProfile = profileKey;
    console.log(`[Bandwidth] Applied profile: ${profile.label}`);

    // Update all active peer connections
    this.peerConnections.forEach((pc) => {
      this.applyBandwidthParameters(pc);
    });

    return profile;
  }

  /**
   * Applies bitrate and resolution constraints to RTCRtpSenders
   */
  async applyBandwidthParameters(pc) {
    if (!pc) return;
    const profile = this.bandwidthProfiles[this.bandwidthProfile] || this.bandwidthProfiles['saver'];

    const senders = pc.getSenders();
    for (const sender of senders) {
      if (!sender.track) continue;

      try {
        const params = sender.getParameters();
        if (!params || !params.encodings || !params.encodings.length) continue;

        if (sender.track.kind === 'video') {
          if (profile.audioOnly) {
            sender.track.enabled = false;
          } else {
            sender.track.enabled = !this.isVideoMuted;
            params.encodings[0].maxBitrate = profile.maxVideoBitrate;
            params.encodings[0].maxFramerate = profile.maxFramerate;
            params.encodings[0].scaleResolutionDownBy = profile.scaleResolutionDownBy;
            await sender.setParameters(params);
          }
        } else if (sender.track.kind === 'audio') {
          params.encodings[0].maxBitrate = profile.maxAudioBitrate;
          await sender.setParameters(params);
        }
      } catch (err) {
        console.warn('[Bandwidth] Error applying sender parameters:', err);
      }
    }
  }

  /**
   * SDP Munging for Low-Bandwidth Resilience
   * - Injects Opus Forward Error Correction (FEC) & Discontinuous Transmission (DTX)
   * - Limits video bandwidth ceiling (b=AS / b=TIAS)
   */
  optimizeSdp(sdp) {
    if (!sdp) return sdp;
    let lines = sdp.split('\r\n');
    const profile = this.bandwidthProfiles[this.bandwidthProfile] || this.bandwidthProfiles['saver'];

    // 1. Optimize Opus Audio (In-Band FEC + DTX for packet loss resilience)
    lines = lines.map(line => {
      if (line.includes('a=fmtp:') && (line.includes('minptime=') || line.includes('useinbandfec=') || line.includes('opus/'))) {
        if (!line.includes('useinbandfec=1')) line += ';useinbandfec=1';
        if (!line.includes('usedtx=1')) line += ';usedtx=1';
        if (!line.includes('maxaveragebitrate=')) line += `;maxaveragebitrate=${profile.maxAudioBitrate}`;
        if (!line.includes('stereo=')) line += ';stereo=0';
      }
      return line;
    });

    // 2. Add Bandwidth limit modifier for Video (b=AS in kbps, b=TIAS in bps)
    const videoKbps = Math.round(profile.maxVideoBitrate / 1000);
    const newLines = [];
    let inVideo = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('m=video')) {
        inVideo = true;
        newLines.push(line);
        if (videoKbps > 0) {
          newLines.push(`b=AS:${videoKbps}`);
          newLines.push(`b=TIAS:${profile.maxVideoBitrate}`);
        }
        continue;
      }
      if (line.startsWith('m=audio') || line.startsWith('m=application')) {
        inVideo = false;
      }
      if (inVideo && (line.startsWith('b=AS:') || line.startsWith('b=TIAS:'))) {
        continue; // overwrite existing bandwidth lines
      }
      newLines.push(line);
    }

    return newLines.join('\r\n');
  }

  /**
   * Real-time WebRTC Stats Monitoring & Auto Low-Bandwidth Detection
   */
  startStatsMonitoring(onStatsCallback) {
    if (this.statsInterval) clearInterval(this.statsInterval);
    this.statsInterval = setInterval(async () => {
      let highestRtt = 0;
      let totalPacketsLost = 0;
      let totalPackets = 0;

      for (const pc of this.peerConnections.values()) {
        if (pc.connectionState === 'connected') {
          try {
            const stats = await pc.getStats();
            stats.forEach(report => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                if (report.currentRoundTripTime) {
                  highestRtt = Math.max(highestRtt, Math.round(report.currentRoundTripTime * 1000));
                }
              }
              if (report.type === 'inbound-rtp' && report.kind === 'video') {
                if (report.packetsLost !== undefined) totalPacketsLost += report.packetsLost;
                if (report.packetsReceived !== undefined) totalPackets += (report.packetsReceived + (report.packetsLost || 0));
              }
            });
          } catch (e) {}
        }
      }

      const lossPercentage = totalPackets > 0 ? Math.round((totalPacketsLost / totalPackets) * 100) : 0;

      // Auto-adapt to Data Saver if high packet loss (>6%) or RTT spikes (>350ms)
      if ((lossPercentage > 6 || highestRtt > 350) && this.bandwidthProfile !== 'saver' && this.autoAdapt) {
        console.warn('[Network] High latency or packet loss detected. Automatically switched to Data Saver mode.');
        this.setBandwidthProfile('saver');
      }

      if (onStatsCallback) {
        onStatsCallback({
          rtt: highestRtt || 24,
          loss: lossPercentage,
          profile: this.bandwidthProfiles[this.bandwidthProfile] || this.bandwidthProfiles['saver']
        });
      }
    }, 3500);
  }

  /**
   * Create an animated synthetic Canvas & Audio stream
   */
  createSyntheticStream(label = 'You', color = '#4edea3') {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    let frame = 0;

    function draw() {
      frame++;
      ctx.fillStyle = '#0f131c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const grad = ctx.createRadialGradient(240, 180, 20, 240, 180, 220);
      grad.addColorStop(0, 'rgba(78, 222, 163, 0.22)');
      grad.addColorStop(0.5, 'rgba(99, 102, 241, 0.12)');
      grad.addColorStop(1, 'rgba(15, 19, 28, 0.98)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Rotating scanner ring
      ctx.save();
      ctx.translate(240, 180);
      ctx.rotate(frame * 0.02);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      const r = 70 + Math.sin(frame * 0.06) * 6;
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Inner pulse
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(240, 180, 24 + Math.sin(frame * 0.08) * 3, 0, Math.PI * 2);
      ctx.fill();

      // Person Icon
      ctx.fillStyle = '#0f131c';
      ctx.font = 'bold 20px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('👤', 240, 187);

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 16px "Space Grotesk", sans-serif';
      ctx.fillText(label.toUpperCase(), 240, 240);

      ctx.fillStyle = '#bbcabf';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(`LOW BANDWIDTH OPTIMIZED • ${frame % 60}s`, 240, 260);

      requestAnimationFrame(draw);
    }
    draw();

    const videoStream = canvas.captureStream(15);

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
            sender.replaceTrack(newVideoTrack).then(() => {
              this.applyBandwidthParameters(pc);
            });
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
          video: { cursor: 'always', frameRate: { ideal: 15, max: 20 } },
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
            sender.replaceTrack(screenTrack).then(() => {
              this.applyBandwidthParameters(pc);
            });
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
            sender.replaceTrack(cameraTrack).then(() => {
              this.applyBandwidthParameters(pc);
            });
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
      // Apply initial bandwidth parameters
      setTimeout(() => this.applyBandwidthParameters(pc), 100);
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

    // Automated ICE Recovery & Connection State Monitoring
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
    const modifiedSdp = this.optimizeSdp(offer.sdp);
    const desc = new RTCSessionDescription({ type: 'offer', sdp: modifiedSdp });
    await pc.setLocalDescription(desc);

    this.socket.emit('signal', {
      targetSocketId,
      signalData: { type: 'offer', sdp: desc }
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
      const modifiedSdp = this.optimizeSdp(answer.sdp);
      const desc = new RTCSessionDescription({ type: 'answer', sdp: modifiedSdp });
      await pc.setLocalDescription(desc);

      this.socket.emit('signal', {
        targetSocketId: senderSocketId,
        signalData: { type: 'answer', sdp: desc }
      });
    } else if (signalData.type === 'answer') {
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        // Apply bandwidth parameters to newly established connection
        this.applyBandwidthParameters(pc);
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
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
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
