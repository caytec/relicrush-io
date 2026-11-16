'use strict';

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(express.static('public'));
app.get('/health', (req, res) => {
  res.json({ ok: true, game: 'RelicRush.io', rooms: rooms.size });
});
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const rooms = new Map();
function id(prefix) { return `${prefix}_${crypto.randomBytes(5).toString('hex')}`; }
wss.on('connection', socket => { socket.on('message', () => {}); });
server.listen(PORT, () => console.log(`RelicRush.io listening on port ${PORT}`));
