import { createServer, IncomingMessage } from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';

// ─── Configuration ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '4444', 10);
const ROOM_TTL_MS = parseInt(process.env.ROOM_TTL_MS || '86400000', 10); // 24 hours

// ─── Room Key Generation ────────────────────────────────────────────────────

const ADJECTIVES = [
  'swift', 'calm', 'bold', 'warm', 'cool', 'soft', 'keen', 'pure', 'wild', 'fair',
  'deep', 'high', 'late', 'wide', 'true', 'dark', 'vast', 'thin', 'rich', 'rare',
  'free', 'kind', 'glad', 'safe', 'open', 'neat', 'long', 'pale', 'slim', 'real',
  'firm', 'flat', 'dull', 'odd', 'raw', 'sly', 'dry', 'shy', 'dim', 'red',
  'new', 'old', 'big', 'hot', 'low', 'wet', 'fit', 'fun', 'sad', 'mad',
];

const COLORS = [
  'amber', 'azure', 'coral', 'ember', 'frost', 'gold', 'jade', 'lime',
  'mint', 'navy', 'olive', 'pearl', 'rose', 'sage', 'teal', 'violet',
  'wine', 'zinc', 'ruby', 'onyx',
];

function generateRoomKey(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const num = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${adj}-${color}-${num}`;
}

// ─── Room Store ─────────────────────────────────────────────────────────────

interface RoomEntry {
  noteId: string;
  createdAt: number;
}

const rooms = new Map<string, RoomEntry>();

// TTL cleanup: remove rooms older than ROOM_TTL_MS
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rooms) {
    if (now - entry.createdAt > ROOM_TTL_MS) {
      rooms.delete(key);
    }
  }
}, 60 * 1000); // Check every minute

// ─── Express App ────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// POST /api/rooms — create a room
app.post('/api/rooms', (req, res) => {
  const { noteId } = req.body;

  if (!noteId || typeof noteId !== 'string') {
    return res.status(400).json({ error: 'noteId is required' });
  }

  // Check if this noteId already has a room
  for (const [key, entry] of rooms) {
    if (entry.noteId === noteId) {
      return res.json({ roomKey: key });
    }
  }

  // Generate unique room key
  let roomKey = generateRoomKey();
  let attempts = 0;
  while (rooms.has(roomKey) && attempts < 100) {
    roomKey = generateRoomKey();
    attempts++;
  }

  rooms.set(roomKey, { noteId, createdAt: Date.now() });
  console.log(`[ROOM] Created: ${roomKey} → ${noteId}`);
  res.json({ roomKey });
});

// POST /api/rooms/resolve — resolve a key to a noteId
app.post('/api/rooms/resolve', (req, res) => {
  const { roomKey } = req.body;

  if (!roomKey || typeof roomKey !== 'string') {
    return res.status(400).json({ error: 'roomKey is required' });
  }

  const room = rooms.get(roomKey.toLowerCase());
  if (!room) {
    return res.status(404).json({ error: 'Room not found or expired' });
  }

  console.log(`[ROOM] Resolved: ${roomKey} → ${room.noteId}`);
  res.json({ noteId: room.noteId });
});

// ─── HTTP Server + WebSocket ────────────────────────────────────────────────

const server = createServer(app);

// y-webrtc signaling WebSocket server
// This implements the signaling protocol expected by y-webrtc
const wss = new WebSocketServer({ server });

// Topic → Set of subscribers
const topics = new Map<string, Set<WebSocket>>();

function send(ws: WebSocket, message: object): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // Connection might have closed
  }
}

wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
  const subscribedTopics = new Set<string>();

  ws.on('message', (data: Buffer | string) => {
    let message: any;
    try {
      message = JSON.parse(typeof data === 'string' ? data : data.toString());
    } catch {
      return;
    }

    if (message && message.type) {
      switch (message.type) {
        case 'subscribe': {
          // Subscribe to a list of topics
          const topicNames: string[] = message.topics || [];
          for (const topicName of topicNames) {
            if (typeof topicName !== 'string') continue;

            let subs = topics.get(topicName);
            if (!subs) {
              subs = new Set();
              topics.set(topicName, subs);
            }
            subs.add(ws);
            subscribedTopics.add(topicName);
          }
          break;
        }

        case 'unsubscribe': {
          const topicNames: string[] = message.topics || [];
          for (const topicName of topicNames) {
            const subs = topics.get(topicName);
            if (subs) {
              subs.delete(ws);
              if (subs.size === 0) topics.delete(topicName);
            }
            subscribedTopics.delete(topicName);
          }
          break;
        }

        case 'publish': {
          // Relay message to all subscribers of the topic except sender
          const topic = message.topic;
          if (typeof topic === 'string') {
            const subs = topics.get(topic);
            if (subs) {
              for (const sub of subs) {
                if (sub !== ws && sub.readyState === WebSocket.OPEN) {
                  send(sub, message);
                }
              }
            }
          }
          break;
        }

        case 'ping': {
          send(ws, { type: 'pong' });
          break;
        }
      }
    }
  });

  ws.on('close', () => {
    // Clean up subscriptions
    for (const topicName of subscribedTopics) {
      const subs = topics.get(topicName);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) topics.delete(topicName);
      }
    }
  });

  ws.on('error', () => {
    // Silently handle errors
  });
});

// ─── Start Server ───────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n  🚀 NoteRoom Signaling Server`);
  console.log(`  ├── HTTP:  http://localhost:${PORT}/api`);
  console.log(`  ├── WS:    ws://localhost:${PORT}`);
  console.log(`  └── TTL:   ${ROOM_TTL_MS / 1000 / 60 / 60}h\n`);
});
