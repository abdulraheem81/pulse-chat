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

// API Routes
app.get('/api/spaces', (req, res) => {
  res.json(Array.from(spaces.values()));
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
  socket.on('join-video-room', ({ roomId = 'default-video-room', userName = 'User' }) => {
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

  // Keep-alive heartbeat from client to ensure connection longevity
  socket.on('room-keep-alive', ({ roomId = 'pulse-room' }) => {
    socket.emit('room-keep-alive-ack', { ts: Date.now(), status: 'alive' });
  });

  // Relay chat message if data channel is still establishing or for multi-peer broadcast
  socket.on('chat-message-relay', ({ roomId = 'pulse-room', msg }) => {
    const room = getOrCreateRoom(roomId);
    if (msg) {
      room.messages.push(msg);
    }
    socket.to(roomId).emit('chat-message-relay', { msg });
  });

  // Reaction Broadcast (Sparks, floating emojis)
  socket.on('spawn-reaction', ({ roomId = 'default-video-room', emoji, sender }) => {
    io.to(roomId).emit('reaction-spawned', { emoji, sender: sender || 'User', id: Date.now() });
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
