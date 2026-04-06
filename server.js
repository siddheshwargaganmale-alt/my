const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

// Serve static files from current dir (public-like)
app.use(express.static(__dirname));
app.use('/images', express.static(path.join(__dirname, 'uploads')));

// Multer for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  }
});

app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  res.json({ url: `/images/${req.file.filename}` });
});

// In-memory rooms data
const rooms = new Map(); // roomId -> { users: Map(socket.id -> {username, isTyping}), messages: [] }

function getRoomUsers(roomId) {
  return rooms.get(roomId)?.users || new Map();
}

function broadcastToRoom(roomId, event, data) {
  io.to(roomId).emit(event, data);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ username, room }) => {
    if (!username || !room || username.length < 2 || username.length > 20 || room.length < 3 || room.length > 50) {
      socket.emit('join-error', 'Invalid username or room');
      return;
    }

    socket.username = username;
    socket.room = room;
    socket.join(room);

    // Init or get room
    if (!rooms.has(room)) rooms.set(room, { users: new Map(), messages: [] });
    const roomData = rooms.get(room);
    roomData.users.set(socket.id, { username, isTyping: false });

    // Send room data
    socket.emit('room-joined', { 
      room, 
      users: Array.from(roomData.users.values()).map(u => u.username),
      messages: roomData.messages 
    });

    // Broadcast new user
    broadcastToRoom(room, 'user-joined', { username, users: Array.from(roomData.users.values()).map(u => u.username) });
    console.log(`${username} joined room ${room}`);
  });

  socket.on('send-message', ({ message, replyTo }) => {
    if (!socket.room || !socket.username || message.trim().length === 0 || message.length > 500) return;

    const roomData = rooms.get(socket.room);
    const msg = {
      id: Date.now(),
      author: socket.username,
      content: message.trim(),
      timestamp: new Date().toISOString(),
      type: 'text',
      replyTo: replyTo ? { author: replyTo.author, content: replyTo.content } : null
    };

    roomData.messages.push(msg);
    // Limit messages to 1000
    if (roomData.messages.length > 1000) roomData.messages.shift();

    broadcastToRoom(socket.room, 'chat-message', msg);
  });

  socket.on('send-image', ({ imageUrl, replyTo }) => {
    if (!socket.room || !socket.username) return;

    const roomData = rooms.get(socket.room);
    const msg = {
      id: Date.now(),
      author: socket.username,
      content: imageUrl,
      timestamp: new Date().toISOString(),
      type: 'image',
      replyTo: replyTo ? { author: replyTo.author, content: replyTo.content } : null
    };

    roomData.messages.push(msg);
    if (roomData.messages.length > 1000) roomData.messages.shift();

    broadcastToRoom(socket.room, 'chat-message', msg);
  });

  socket.on('typing', (isTyping) => {
    if (!socket.room) return;
    const roomData = rooms.get(socket.room);
    if (roomData.users.has(socket.id)) {
      roomData.users.get(socket.id).isTyping = isTyping;
      // Emit to others
      socket.to(socket.room).emit('user-typing', { username: socket.username, isTyping });
    }
  });

  socket.on('clear-chat', () => {
    if (!socket.room) return;
    const roomData = rooms.get(socket.room);
    roomData.messages = [{ id: Date.now(), author: 'system', content: 'Chat cleared', timestamp: new Date().toISOString(), type: 'system' }];
    broadcastToRoom(socket.room, 'clear-chat');
  });

  socket.on('disconnect', () => {
    if (socket.room) {
      const roomData = rooms.get(socket.room);
      roomData.users.delete(socket.id);
      if (roomData.users.size === 0) {
        rooms.delete(socket.room);
      } else {
        broadcastToRoom(socket.room, 'user-left', { username: socket.username, users: Array.from(roomData.users.values()).map(u => u.username) });
      }
      console.log(`${socket.username || 'User'} left room ${socket.room}`);
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ChatHub server running on http://localhost:${PORT}`);
});
