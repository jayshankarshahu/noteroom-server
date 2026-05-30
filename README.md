# PeerNotes

**Peer-to-peer collaborative notes. No login. No server. Your data stays yours.**

PeerNotes is a Chrome Extension that provides a zero-login, peer-to-peer collaborative Markdown notepad. Notes live locally on your device. Collaboration is opt-in, real-time, and powered by WebRTC. No note content ever touches a server.

## Features

- ✍️ **Rich Markdown Editor** — Powered by Milkdown (ProseMirror-based) with WYSIWYG editing
- 💾 **Local-first** — All notes stored in `chrome.storage.local`, never on a server
- 🔗 **Real-time Collaboration** — Share a human-readable room key and edit together via WebRTC
- 👥 **Presence Awareness** — See who's connected with colored cursors and avatars
- 🔐 **Zero Login** — No accounts, no passwords, no tracking
- ⌨️ **Keyboard-first** — `Cmd+N` new note, `Cmd+[` toggle sidebar, `Cmd+K` collab panel

## Architecture

```
peernotes/
├── extension/              # Chrome Extension (Vite + React + TypeScript)
│   ├── src/
│   │   ├── components/     # UI components (Editor, Sidebar, CollabPanel, etc.)
│   │   ├── services/       # Storage, collaboration, room key services
│   │   ├── store/          # Zustand state management
│   │   ├── types/          # TypeScript interfaces
│   │   └── pages/notepad/  # Full-tab notepad app
│   └── public/manifest.json
│
└── signaling-server/       # Thin Node.js signaling server
    └── src/index.ts        # Room key API + WebRTC signaling relay
```

## Setup

### Prerequisites

- Node.js 18+
- Chrome browser

### Extension (Development)

```bash
cd extension
npm install
npm run dev
```

Then load the extension in Chrome:
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/dist` directory

### Signaling Server

```bash
cd signaling-server
npm install
npm run dev
```

The signaling server runs on `http://localhost:4444` by default.

### Environment Variables

**Extension** (`extension/.env.local`):
```
VITE_SIGNALING_SERVER_URL=ws://localhost:4444
VITE_ROOM_API_URL=http://localhost:4444/api
```

**Signaling Server** (`signaling-server/.env`):
```
PORT=4444
ROOM_TTL_MS=86400000
```

## How Collaboration Works

1. **Create a Room**: Click "Share" → A human-readable room key is generated (e.g., `swift-coral-42`)
2. **Share the Key**: Send the room key to collaborators via any channel
3. **Join**: Others enter the key → WebRTC peer-to-peer connection is established
4. **Edit Together**: Real-time collaborative editing with presence cursors
5. **Leave**: Click "Leave Room" → Local copy of the note is retained

The signaling server only handles:
- Room key ↔ noteId mapping (REST API)
- WebRTC SDP exchange (WebSocket relay)

**No note content ever passes through the server.**

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18 + TypeScript |
| Build Tool | Vite + @crxjs/vite-plugin |
| Editor | Milkdown (ProseMirror) |
| CRDT / Sync | Yjs |
| P2P Transport | y-webrtc (primary) |
| Fallback Transport | y-websocket |
| Local Storage | chrome.storage.local |
| State Management | Zustand |
| Styling | CSS Modules + CSS Variables |

## License

MIT
