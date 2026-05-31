"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ws_1 = require("ws");
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
function generateRoomKey() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const num = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    return `${adj}-${color}-${num}`;
}
const rooms = new Map();
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
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve static website
const path_1 = __importDefault(require("path"));
app.use(express_1.default.static(path_1.default.join(__dirname, '../public'), { extensions: ['html'] }));
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
const server = (0, http_1.createServer)(app);
// y-webrtc signaling WebSocket server
// This implements the signaling protocol expected by y-webrtc
const wss = new ws_1.WebSocketServer({ server });
// Topic → Set of subscribers
const topics = new Map();
function send(ws, message) {
    try {
        ws.send(JSON.stringify(message));
    }
    catch {
        // Connection might have closed
    }
}
wss.on('connection', (ws, _req) => {
    const subscribedTopics = new Set();
    ws.on('message', (data) => {
        let message;
        try {
            message = JSON.parse(typeof data === 'string' ? data : data.toString());
        }
        catch {
            return;
        }
        if (message && message.type) {
            switch (message.type) {
                case 'subscribe': {
                    // Subscribe to a list of topics
                    const topicNames = message.topics || [];
                    for (const topicName of topicNames) {
                        if (typeof topicName !== 'string')
                            continue;
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
                    const topicNames = message.topics || [];
                    for (const topicName of topicNames) {
                        const subs = topics.get(topicName);
                        if (subs) {
                            subs.delete(ws);
                            if (subs.size === 0)
                                topics.delete(topicName);
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
                                if (sub !== ws && sub.readyState === ws_1.WebSocket.OPEN) {
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
                if (subs.size === 0)
                    topics.delete(topicName);
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
//# sourceMappingURL=index.js.map