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
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory state
const rooms = new Map(); // roomId -> { type: 'video'|'audio', users: Map(socketId -> userData), messages: [] }
const spaces = new Map(); // spaceId -> { title, topic, listenersCount: 142, speakers: [], audience: [], handRaises: [] }

// Initialize a default audio space
spaces.set('product-design-1', {
  id: 'product-design-1',
  title: 'Design Systems & AI Workflows',
  topic: '#product-design',
  description: 'Exploring automated component tokens, token syncs & multimodal design handoff.',
  listenersCount: 142,
  speakers: [
    { id: 'bot-alex', name: 'Alex Rivers', role: 'HOST', isSpeaking: true, isMuted: false, avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDWJUeVZ-_dk0vwpI5CjKJh82a4RLPS8ThYCi52vbe7WUslrAfm9HCSkgewQ9WHqC_JMiLvMDz8VpEJlfnFlBNgrb5fC1l8PRzq43vwdQmq8FxKHzrqZSQ3yZF93k-ZWATuXqIvBvSYX1XSbxBX7PHZuYopAhSpbtWCx8FMEqlCEhQZ9u0Bqy8WwrejVZB4obw1Ni_l0dlBg3XRuwTt4Z9Uc_3oipXQx1V-dc1Zzw' },
    { id: 'bot-elena', name: 'Elena R.', role: 'CO-HOST', isSpeaking: false, isMuted: false, avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDIG3YTreCJBZheGUATIstbNo-FLMdiXtYuRS03oVK4I5SdeNXcYSCTL818vOpUxciJ0BmDxebxhISKFJBHAgfMQZ2LFKvHnL14hhLY--zU5TMgzujWe3sODEXKjXrgCa6FOOfDlpgrmaR97cYuTvenPHOdGe3gbyqoVIVw-wbiNjscrtNoSMCAfG_qt5CWB-uKdp1CE1X6PNu1BVqs3nRgoyRGcn5ixHJ6VvxqzQ' },
    { id: 'bot-marcus', name: 'Marcus V.', role: 'SPEAKER', isSpeaking: false, isMuted: true, avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuARdh6soalAFqHAYA8j02LQzlrfVkUM5uSKlY3ekc6T5Ts7d2Hkt5tykjgJC-oxakVKZjTcu6iDLbWo_xpkJB9iUAbZsjWL6uMDWua6_nrVzLUEeBMojiM1uxLNbbc7v7gB-b9iLVN5w9IavQaOWhCmGsBgUo24BK_UpiCipViKwmzdAikbKmcl5Fy9AN7UW4k6cP8kJd6xfWguFN39lyxVH6IGKMw99PROFUNrAA' },
    { id: 'bot-sofia', name: 'Sofia Chen', role: 'SPEAKER', isSpeaking: false, isMuted: true, avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCUDibOkUrZzGMQn0sG7Gobv-TaWhqzPXoV8B4aJgcykWVQdtM9tLDLdw4nw-56Apgfwwnvt6XQdYu2udZ-NxdrjEcewXOaFqaoODAGLt101E861eEIvopCPDTbSP5LnDscsYSF8nVyq4Zs-J5mKGQMMDmMs7ap6m38oBPHjqvwtkfnisyDnL1LA2GQ9gm468foZb1bsmt9nYFde5ARM3fNI5ITNzFvniTkGmOrmg' }
  ],
  handRaises: []
});

// Seed default conversation messages for in-call chat
const defaultChatMessages = [
  {
    id: 'msg-1',
    type: 'event',
    text: 'Elena started video call • 14:15',
    icon: 'call',
    timestamp: '14:15'
  },
  {
    id: 'msg-2',
    type: 'message',
    sender: 'Elena Rostova',
    senderId: 'bot-elena',
    isMe: false,
    text: "Sharing the screen recording and design notes from our sync. Let's make sure the audio curves are aligned!",
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBH2owqJmqMN-QGBYkN7L2Zm1cJf2ctyVwETeA-v0n8smXVlF-ViUTTQTgh2eHdjsJdlMdyJZ0DvWnIeWEg_5vG6kOZMUd8SNFc8Mi_8p5w_k8JpRd4QSOKRT02av3ywJPipmgXTFQVwg5hFopkkQrkBcEGbBuBkq_zVRCy3WXBoStoUosbFye3uQ-r1l2W2-OBGDmANLTBvTd-TdJQQYz_Dt0b9GP4bncxWUMqbg',
    timestamp: '14:18'
  },
  {
    id: 'msg-3',
    type: 'media',
    sender: 'Elena Rostova',
    isMe: false,
    title: 'Call_Recording_2405.mp4',
    duration: '04:15',
    size: '32.4 MB',
    currentTime: '01:42',
    timestamp: '14:20'
  },
  {
    id: 'msg-4',
    type: 'event',
    text: 'Screen sharing active • 14:22',
    icon: 'screen_share',
    timestamp: '14:22'
  },
  {
    id: 'msg-5',
    type: 'message',
    sender: 'You',
    senderId: 'me',
    isMe: true,
    text: 'Awesome, looking at the Figma prototype right now! Audio latency was super low today.',
    timestamp: '14:25'
  },
  {
    id: 'msg-6',
    type: 'voice',
    sender: 'Elena Rostova',
    senderId: 'bot-elena',
    isMe: false,
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuApn9EKaKzFvpLy8BpPARYnOc2QcN1YdBfOpSLRhrrH0JWrdOIel3qIeKw1ytwrVXyHatPPmVSr96lb6amD9fpbX8inV1EQMiCyFlb2gODPfKVVk2TbgHpPenhNmiwedfSQQzBVCn42BfU4VAjZ68uN9VKcO4_1yPiJbJ1oDpFIDA-ZFtxBPjtfMylh29tvYoc_GA7lLjAr_BZMsZ8oi1qIrpI4ZPjbb2457b7jaA',
    duration: '0:24',
    currentTime: '0:09',
    speed: '1.5x',
    transcription: "“Let's review the final animations before ship... everything else looks ready to merge.”",
    timestamp: '14:28'
  }
];

let globalMessages = [...defaultChatMessages];

// API Routes
app.get('/api/spaces', (req, res) => {
  res.json(Array.from(spaces.values()));
});

app.get('/api/messages', (req, res) => {
  res.json(globalMessages);
});

app.post('/api/messages', (req, res) => {
  const { text, type = 'message', sender = 'You', isMe = true, audioData, transcription } = req.body;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const newMsg = {
    id: 'msg-' + Date.now(),
    type,
    text,
    sender,
    isMe,
    audioData,
    transcription,
    timestamp: timeStr
  };
  globalMessages.push(newMsg);
  io.emit('chat-message', newMsg);

  // Bot response simulation if addressed or solo
  if (isMe && type === 'message') {
    setTimeout(() => {
      const botReplies = [
        "Sounds great! Checking the WebRTC stream metrics now. Zero packet loss on 48kHz.",
        "Got it! Let's verify the audio ducking parameters in the staging build.",
        "Confirmed! Elena here, screen share quality is crystal clear at 60fps.",
        "Totally agree. Spatial audio placement makes team syncs feel so much more natural.",
        "I've updated the Figma design tokens to match the Obsidian theme!"
      ];
      const botReply = botReplies[Math.floor(Math.random() * botReplies.length)];
      const botTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const botMsg = {
        id: 'msg-' + Date.now(),
        type: 'message',
        sender: 'Elena Rostova',
        senderId: 'bot-elena',
        isMe: false,
        text: botReply,
        avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBH2owqJmqMN-QGBYkN7L2Zm1cJf2ctyVwETeA-v0n8smXVlF-ViUTTQTgh2eHdjsJdlMdyJZ0DvWnIeWEg_5vG6kOZMUd8SNFc8Mi_8p5w_k8JpRd4QSOKRT02av3ywJPipmgXTFQVwg5hFopkkQrkBcEGbBuBkq_zVRCy3WXBoStoUosbFye3uQ-r1l2W2-OBGDmANLTBvTd-TdJQQYz_Dt0b9GP4bncxWUMqbg',
        timestamp: botTime
      };
      globalMessages.push(botMsg);
      io.emit('chat-message', botMsg);
    }, 1200);
  }

  res.json({ success: true, message: newMsg });
});

// Socket.io Realtime Signaling & State
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // WebRTC Video Room Signaling
  socket.on('join-video-room', ({ roomId = 'default-video-room', userName = 'User' }) => {
    socket.join(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Map() });
    }
    const room = rooms.get(roomId);
    room.users.set(socket.id, { id: socket.id, name: userName });

    // Tell existing room members about the new peer
    const existingUsers = Array.from(room.users.entries())
      .filter(([id]) => id !== socket.id)
      .map(([id, data]) => ({ socketId: id, name: data.name }));

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

  // Relay chat message if data channel is still establishing
  socket.on('chat-message-relay', ({ roomId = 'pulse-room', msg }) => {
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
