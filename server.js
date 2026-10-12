const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 120000,
  pingInterval: 25000,
  connectTimeout: 45000
});

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory state
// roomId -> { type: 'video'|'audio', users: Map(socketId -> userData), messages: [], startTime: timestamp }
const rooms = new Map();
const spaces = new Map(); // spaceId -> { title, topic, listenersCount: 142, speakers: [], audience: [], handRaises: [] }

// Seed default rich Audio Space
spaces.set('product-design-1', {
  id: 'product-design-1',
  title: 'Design Systems & AI Workflows',
  topic: '#product-design',
  description: 'Exploring automated component tokens, token syncs & multimodal design handoff.',
  listenersCount: 142,
  speakers: [
    {
      id: 'speaker-alex',
      name: 'Alex Rivers',
      role: 'HOST',
      isSpeaking: true,
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDWJUeVZ-_dk0vwpI5CjKJh82a4RLPS8ThYCi52vbe7WUslrAfm9HCSkgewQ9WHqC_JMiLvMDz8VpEJlfnFlBNgrb5fC1l8PRzq43vwdQmq8FxKHzrqZSQ3yZF93k-ZWATuXqIvBvSYX1XSbxBX7PHZuYopAhSpbtWCx8FMEqlCEhQZ9u0Bqy8WwrejVZB4obw1Ni_l0dlBg3XRuwTt4Z9Uc_3oipXQx1V-dc1Zzw'
    },
    {
      id: 'speaker-elena',
      name: 'Elena Rostova',
      role: 'CO-HOST',
      isSpeaking: false,
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDIG3YTreCJBZheGUATIstbNo-FLMdiXtYuRS03oVK4I5SdeNXcYSCTL818vOpUxciJ0BmDxebxhISKFJBHAgfMQZ2LFKvHnL14hhLY--zU5TMgzujWe3sODEXKjXrgCa6FOOfDlpgrmaR97cYuTvenPHOdGe3gbyqoVIVw-wbiNjscrtNoSMCAfG_qt5CWB-uKdp1CE1X6PNu1BVqs3nRgoyRGcn5ixHJ6VvxqzQ'
    },
    {
      id: 'speaker-marcus',
      name: 'Marcus Vance',
      role: 'SPEAKER',
      isSpeaking: false,
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuARdh6soalAFqHAYA8j02LQzlrfVkUM5uSKlY3ekc6T5Ts7d2Hkt5tykjgJC-oxakVKZjTcu6iDLbWo_xpkJB9iUAbZsjWL6uMDWua6_nrVzLUEeBMojiM1uxLNbbc7v7gB-b9iLVN5w9IavQaOWhCmGsBgUo24BK_UpiCipViKwmzdAikbKmcl5Fy9AN7UW4k6cP8kJd6xfWguFN39lyxVH6IGKMw99PROFUNrAA'
    },
    {
      id: 'speaker-sofia',
      name: 'Sofia Chen',
      role: 'SPEAKER',
      isSpeaking: false,
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCUDibOkUrZzGMQn0sG7Gobv-TaWhqzPXoV8B4aJgcykWVQdtM9tLDLdw4nw-56Apgfwwnvt6XQdYu2udZ-NxdrjEcewXOaFqaoODAGLt101E861eEIvopCPDTbSP5LnDscsYSF8nVyq4Zs-J5mKGQMMDmMs7ap6m38oBPHjqvwtkfnisyDnL1LA2GQ9gm468foZb1bsmt9nYFde5ARM3fNI5ITNzFvniTkGmOrmg'
    }
  ],
  handRaises: [
    { id: 'user-kai', name: 'Kai Takahashi', role: 'AUDIENCE' }
  ],
  audience: [
    { id: 'aud-1', name: 'Jordan Hayes', avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBmKixmEoiU3rCABD8FoNxxeE5dcyxXdHyNj3GyY5JQ1ExiSrrXhJfIYCEIPUe41GMS1UY3ue31mheAuplxHoDrCvdYH_FRVL_j3c8cSD3i89qjl_DSPbgCUc0zY-DZr4ohKJ73AgYv8mgxBwLBdvjIrJA04HD7wE8gYyMH_YD__3rvUkT3x5EfFjQ2aC1hufLj6n0QLK_9-Lxf8Np3JKrE5Rk70J2w7a-kf2KuAQ' },
    { id: 'aud-2', name: 'Sarah Miller', avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDg8wvF-drbRQH1nXk3HJc8CNECu0AuusB5JBAoOEeBCVTOMOvrWJJ4wkJErOrMA_SY4NGmBfDOpZCt2MFVlS8UB6ReBqxdZyHqKxsCxyJKcO5bqBu4yg8qh-2MeB4Nc81Pu3tXjXeu202aKNOnQqGMQYWjVMb_xoD_z8sv_bvOVrCWSWH6V41TviSWmzXM39XEkAubh_75WquAwL-bsvdFzEdlFWHwlK3pscNokw' },
    { id: 'aud-3', name: 'Liam O\'Connor', avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDA-X-SMwX429ZSg5otvICzNxraAJSnzhPBdWQaFVSlZU5efRreipnDS4BZGPWTMGNb5aiATVdwVTZdLtaE3d5-FuFI_Ygap6PyPPx6P26usr1diUF3AsUPt54Hw8uH5BLV2eTBj9el59jPBzc5TX632PsONEBixPTIf6Bu6n16xgfEx9WJsUu9ddahXI_cRqKuQxB8sPF2XURGl-CiK0gbLa2QYc56Ldo2GQflwA' }
  ]
});

// Seed default Call Logs
let callLogs = [
  {
    id: 'log-1',
    peerName: 'Elena Rostova',
    room: 'pulse-room',
    type: 'video',
    direction: 'incoming',
    status: 'connected',
    duration: '24:18',
    timestamp: 'Today, 14:28',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDIG3YTreCJBZheGUATIstbNo-FLMdiXtYuRS03oVK4I5SdeNXcYSCTL818vOpUxciJ0BmDxebxhISKFJBHAgfMQZ2LFKvHnL14hhLY--zU5TMgzujWe3sODEXKjXrgCa6FOOfDlpgrmaR97cYuTvenPHOdGe3gbyqoVIVw-wbiNjscrtNoSMCAfG_qt5CWB-uKdp1CE1X6PNu1BVqs3nRgoyRGcn5ixHJ6VvxqzQ',
    quality: 'HD 60FPS • 24ms'
  },
  {
    id: 'log-2',
    peerName: 'Marcus Vance',
    room: 'design-sync-42',
    type: 'video',
    direction: 'missed',
    status: 'missed',
    duration: 'Missed',
    timestamp: 'Today, 11:05',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuARdh6soalAFqHAYA8j02LQzlrfVkUM5uSKlY3ekc6T5Ts7d2Hkt5tykjgJC-oxakVKZjTcu6iDLbWo_xpkJB9iUAbZsjWL6uMDWua6_nrVzLUEeBMojiM1uxLNbbc7v7gB-b9iLVN5w9IavQaOWhCmGsBgUo24BK_UpiCipViKwmzdAikbKmcl5Fy9AN7UW4k6cP8kJd6xfWguFN39lyxVH6IGKMw99PROFUNrAA',
    quality: 'Unanswered'
  },
  {
    id: 'log-3',
    peerName: 'Sofia Chen',
    room: 'sofia-direct',
    type: 'audio',
    direction: 'outgoing',
    status: 'connected',
    duration: '18:42',
    timestamp: 'Yesterday, 19:30',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCUDibOkUrZzGMQn0sG7Gobv-TaWhqzPXoV8B4aJgcykWVQdtM9tLDLdw4nw-56Apgfwwnvt6XQdYu2udZ-NxdrjEcewXOaFqaoODAGLt101E861eEIvopCPDTbSP5LnDscsYSF8nVyq4Zs-J5mKGQMMDmMs7ap6m38oBPHjqvwtkfnisyDnL1LA2GQ9gm468foZb1bsmt9nYFde5ARM3fNI5ITNzFvniTkGmOrmg',
    quality: 'Studio 48kHz'
  },
  {
    id: 'log-4',
    peerName: 'Design Systems Space',
    room: 'product-design-1',
    type: 'space',
    direction: 'incoming',
    status: 'connected',
    duration: '1 hr 12m',
    timestamp: 'Yesterday, 16:00',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDWJUeVZ-_dk0vwpI5CjKJh82a4RLPS8ThYCi52vbe7WUslrAfm9HCSkgewQ9WHqC_JMiLvMDz8VpEJlfnFlBNgrb5fC1l8PRzq43vwdQmq8FxKHzrqZSQ3yZF93k-ZWATuXqIvBvSYX1XSbxBX7PHZuYopAhSpbtWCx8FMEqlCEhQZ9u0Bqy8WwrejVZB4obw1Ni_l0dlBg3XRuwTt4Z9Uc_3oipXQx1V-dc1Zzw',
    quality: 'Spatial 360° • 142 Users'
  }
];

// Helper to get or create room with persistent start time
function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      type: 'video',
      users: new Map(),
      messages: [],
      startTime: Date.now(),
      createdDate: new Date()
    });
  }
  return rooms.get(roomId);
}

// In-memory messages for real users only
let globalMessages = [];

// API Route for WebRTC ICE Servers (STUN + TURN for cross-country NAT/firewall traversal)
app.get('/api/ice-servers', (req, res) => {
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      // OpenRelay Free TURN Servers (TCP & UDP)
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelay',
        credential: 'openrelay'
      }
    ]
  });
});

// API Route for WebTransport / Server Transport Config
app.get('/api/transport-info', (req, res) => {
  res.json({
    protocol: 'webtransport-quic',
    fallback: 'websocket-binary',
    port: PORT,
    certHash: 'nif3lLUTIOqbbwWugmjAZHSyWZYOqVJwtPRj2cJ7yBo=',
    maxPacketSize: 65536
  });
});

// API Routes
app.get('/api/spaces', (req, res) => {
  res.json(Array.from(spaces.values()));
});

app.get('/api/call-logs', (req, res) => {
  res.json(callLogs);
});

app.post('/api/call-logs', (req, res) => {
  const newLog = {
    id: 'log-' + Date.now(),
    peerName: req.body.peerName || 'Peer',
    room: req.body.room || 'pulse-room',
    type: req.body.type || 'video',
    direction: req.body.direction || 'outgoing',
    status: req.body.status || 'connected',
    duration: req.body.duration || '00:00',
    timestamp: 'Just now',
    avatar: req.body.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuBmKixmEoiU3rCABD8FoNxxeE5dcyxXdHyNj3GyY5JQ1ExiSrrXhJfIYCEIPUe41GMS1UY3ue31mheAuplxHoDrCvdYH_FRVL_j3c8cSD3i89qjl_DSPbgCUc0zY-DZr4ohKJ73AgYv8mgxBwLBdvjIrJA04HD7wE8gYyMH_YD__3rvUkT3x5EfFjQ2aC1hufLj6n0QLK_9-Lxf8Np3JKrE5Rk70J2w7a-kf2KuAQ',
    quality: req.body.quality || 'HD • 24ms'
  };
  callLogs.unshift(newLog);
  res.json({ success: true, log: newLog });
});

app.get('/api/messages', (req, res) => {
  res.json(globalMessages);
});

app.post('/api/messages', (req, res) => {
  const { text, type = 'message', sender = 'User', isMe = true } = req.body;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const newMsg = {
    id: 'msg-' + Date.now(),
    type,
    text,
    sender,
    isMe,
    timestamp: timeStr
  };
  globalMessages.push(newMsg);
  io.emit('chat-message', newMsg);
  res.json({ success: true, message: newMsg });
});

// Socket.io Realtime Signaling & State
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // WebRTC Video Room Signaling
  socket.on('join-video-room', ({ roomId = 'pulse-room', userName = 'User' }) => {
    socket.join(roomId);
    const room = getOrCreateRoom(roomId);
    room.users.set(socket.id, { id: socket.id, name: userName });

    // Tell existing room members about the new peer
    const existingUsers = Array.from(room.users.entries())
      .filter(([id]) => id !== socket.id)
      .map(([id, data]) => ({ socketId: id, name: data.name }));

    // Send room metadata (persistent startTime, existing messages, users) to joined user
    socket.emit('room-info', {
      roomId,
      startTime: room.startTime,
      elapsedSeconds: Math.floor((Date.now() - room.startTime) / 1000),
      users: existingUsers,
      messages: room.messages
    });

    socket.emit('existing-users', existingUsers);
    socket.to(roomId).emit('user-joined', { socketId: socket.id, name: userName });
    console.log(`User ${userName} (${socket.id}) joined video room: ${roomId}`);
  });

  socket.on('signal', ({ targetSocketId, signalData }) => {
    io.to(targetSocketId).emit('signal', {
      senderSocketId: socket.id,
      signalData
    });
  });

  // Direct Data Packet Relay (P2P direct channel emulation over WebSocket)
  socket.on('client-direct-data', ({ roomId, payload }) => {
    const targetRoom = roomId || Array.from(socket.rooms).find(r => r !== socket.id) || 'pulse-room';
    socket.to(targetRoom).emit('peer-direct-data', {
      senderSocketId: socket.id,
      payload
    });
  });

  // High-Speed WebSocket Binary PCM Audio Relay (100% Reliable across all countries)
  socket.on('client-audio-pcm', ({ roomId, pcm, sampleRate }) => {
    const targetRoom = roomId || Array.from(socket.rooms).find(r => r !== socket.id) || 'pulse-room';
    socket.to(targetRoom).emit('peer-audio-pcm', {
      senderSocketId: socket.id,
      pcm,
      sampleRate
    });
  });

  // Real-Time Video Frame Streaming Relay
  socket.on('client-video-frame', ({ roomId, frame }) => {
    const targetRoom = roomId || Array.from(socket.rooms).find(r => r !== socket.id) || 'pulse-room';
    socket.to(targetRoom).emit('peer-video-frame', {
      senderSocketId: socket.id,
      frame
    });
  });

  // Keep-alive heartbeat from client to ensure connection longevity
  socket.on('room-keep-alive', ({ roomId }) => {
    socket.emit('room-keep-alive-ack', { ts: Date.now(), status: 'alive' });
  });

  // Relay chat message if data channel is still establishing or for multi-peer broadcast
  socket.on('chat-message-relay', ({ roomId, msg }) => {
    const targetRoom = roomId || Array.from(socket.rooms).find(r => r !== socket.id) || 'pulse-room';
    const room = getOrCreateRoom(targetRoom);
    if (msg && msg.text) {
      room.messages.push(msg);
    }
    socket.to(targetRoom).emit('chat-message-relay', { msg });
  });

  // Reaction Broadcast (Sparks, floating emojis)
  socket.on('spawn-reaction', ({ roomId, emoji, sender }) => {
    const targetRoom = roomId || Array.from(socket.rooms).find(r => r !== socket.id) || 'pulse-room';
    io.to(targetRoom).emit('reaction-spawned', { emoji, sender: sender || 'User', id: Date.now() });
  });

  // Audio Space room actions
  socket.on('join-space', ({ spaceId = 'product-design-1', userName = 'Guest User' }) => {
    socket.join(spaceId);
    let space = spaces.get(spaceId);
    if (!space) {
      space = {
        id: spaceId,
        title: 'Community Voice Stage',
        topic: '#general',
        description: 'Drop-in audio conversations and discussions.',
        listenersCount: 1,
        speakers: [],
        handRaises: []
      };
      spaces.set(spaceId, space);
    }
    space.listenersCount++;
    io.to(spaceId).emit('space-updated', space);
  });

  socket.on('raise-hand', ({ spaceId = 'product-design-1', userName = 'You' }) => {
    const space = spaces.get(spaceId);
    if (space) {
      if (!space.handRaises.find(h => h.id === socket.id)) {
        space.handRaises.push({ id: socket.id, name: userName });
      }
      io.to(spaceId).emit('space-updated', space);
    }
  });

  socket.on('lower-hand', ({ spaceId = 'product-design-1' }) => {
    const space = spaces.get(spaceId);
    if (space) {
      space.handRaises = space.handRaises.filter(h => h.id !== socket.id);
      io.to(spaceId).emit('space-updated', space);
    }
  });

  socket.on('approve-speaker', ({ spaceId = 'product-design-1', targetSocketId }) => {
    const space = spaces.get(spaceId);
    if (space) {
      const handIndex = space.handRaises.findIndex(h => h.id === targetSocketId);
      if (handIndex !== -1) {
        const approved = space.handRaises.splice(handIndex, 1)[0];
        space.speakers.push({
          id: approved.id,
          name: approved.name,
          role: 'SPEAKER',
          isSpeaking: false,
          isMuted: true,
          avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBmKixmEoiU3rCABD8FoNxxeE5dcyxXdHyNj3GyY5JQ1ExiSrrXhJfIYCEIPUe41GMS1UY3ue31mheAuplxHoDrCvdYH_FRVL_j3c8cSD3i89qjl_DSPbgCUc0zY-DZr4ohKJ73AgYv8mgxBwLBdvjIrJA04HD7wE8gYyMH_YD__3rvUkT3x5EfFjQ2aC1hufLj6n0QLK_9-Lxf8Np3JKrE5Rk70J2w7a-kf2KuAQ'
        });
        io.to(spaceId).emit('space-updated', space);
      }
    }
  });

  socket.on('speaking-state', ({ spaceId = 'product-design-1', isSpeaking }) => {
    const space = spaces.get(spaceId);
    if (space) {
      const speaker = space.speakers.find(s => s.id === socket.id);
      if (speaker) {
        speaker.isSpeaking = isSpeaking;
        io.to(spaceId).emit('space-updated', space);
      }
    }
  });

  socket.on('disconnecting', () => {
    for (const roomName of socket.rooms) {
      if (rooms.has(roomName)) {
        const room = rooms.get(roomName);
        room.users.delete(socket.id);
        socket.to(roomName).emit('user-left', { socketId: socket.id });
      }
      if (spaces.has(roomName)) {
        const space = spaces.get(roomName);
        space.listenersCount = Math.max(0, space.listenersCount - 1);
        space.speakers = space.speakers.filter(s => s.id !== socket.id);
        space.handRaises = space.handRaises.filter(h => h.id !== socket.id);
        io.to(roomName).emit('space-updated', space);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// Single page entry point
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Pulse Obsidian Audio/Video/Text Chat App running on http://localhost:${PORT}`);
});
