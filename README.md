# Pulse — Simple P2P Video, Audio & Text Chat App

Pulse is a simple, modern, unified **Text, Audio, and Video Chat Application** built with WebRTC Peer-to-Peer (`RTCPeerConnection` + `RTCDataChannel`) and dark obsidian aesthetics.

---

## 🌟 Overview & Layout

Everything is unified on **one simple, clean screen**:

```
+-----------------------------------------------------------------------------------------+
| [Pulse] P2P Audio • Video • Text          [P2P Connected]  [Copy Invite Link]   [02:45] |
+-------------------------------------------------------------+---------------------------+
|                                                             |                           |
|                    VIDEO & AUDIO STAGE                      |         P2P CHAT          |
|                                                             |                           |
|  +-------------------------------------------------------+  |  🔒 WebRTC E2EE Direct    |
|  |                                     +--------------+  |  |                           |
|  |                                     |  Local PiP   |  |  |  [Peer] • 09:15 PM  [P2P] |
|  |             Remote Video            |   (You) 🎤   |  |  |  Hey! Can you hear me?    |
|  |                (Peer)               +--------------+  |  |                           |
|  |                                                       |  |  [You] • 09:16 PM   [P2P] |
|  |  🟢 Peer  [E2EE]                                      |  |  Loud and clear! 60fps HD |
|  +-------------------------------------------------------+  |                           |
|                                                             |  Peer is typing...        |
|  [ 🎤 Mic ]  [ 📹 Cam ]  [ 🖥️ Share ]  [ 🔄 Flip ]  [❤️ 🔥] |  +---------------------+  |
|                                                             |  | Type message... [🚀]|  |
+-------------------------------------------------------------+---------------------------+
```

---

## ⚡ Core Features

1. **📹 P2P Video Calling**:
   - Real-time WebRTC peer-to-peer video streaming.
   - Picture-in-Picture (PiP) local self-view.
   - Camera flip (front/back camera).
   - 1-click Screen Sharing (`getDisplayMedia`).

2. **🎙️ P2P Audio Calling**:
   - Real-time bidirectional microphone audio streaming.
   - 1-click Mic Mute / Unmute.
   - Bouncing audio level indicators that react to your voice.

3. **💬 Direct P2P Text Chat**:
   - Transmitted directly browser-to-browser via **`RTCDataChannel`** (Zero server relay, end-to-end encrypted).
   - Instant typing indicator (`Peer is typing...`).
   - Reaction emoji bursts (`❤️`, `🔥`, `👏`, `🚀`).
   - Emerald `[P2P]` badge on delivered messages.

4. **🔗 1-Click Multi-User Link**:
   - Click **"Copy Invite Link"** to copy the room link.
   - Open it in another browser tab or device to immediately connect video, audio, and text chat!

---

## 🚀 How to Run & Test

```bash
# Start the server
npm start
```

1. Open **[http://localhost:3000](http://localhost:3000)** in your browser.
2. Click **"Copy Invite Link"** (or **"Copy Link for 2nd Tab"**).
3. Paste and open that link in a **second tab** or another browser window.
4. **Instantly:**
   - Both windows connect via **P2P WebRTC**.
   - Video and audio streams start playing.
   - Status badge turns green: `🟢 P2P Connected (E2EE)`.
   - Send text messages and see them arrive directly with `[P2P]` tags!
