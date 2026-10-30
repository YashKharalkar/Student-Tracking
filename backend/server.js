const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const historyStore = require('./historyStore');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the production-built frontend
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

// REST API Endpoints for 24-Hour History
app.get('/api/history', (req, res) => {
  const { search, semester } = req.query;
  const records = historyStore.getHistory({ search, semester });
  res.json({ success: true, count: records.length, data: records });
});

app.get('/api/history/stats', (req, res) => {
  const stats = historyStore.getStats();
  res.json({ success: true, data: stats });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// In-memory store for active students
const activeStudents = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // When a user identifies as admin, join the admin room
  socket.on('joinAdmin', () => {
    socket.join('admin');
    console.log('Admin joined:', socket.id);
    // Send existing active students to the new admin
    socket.emit('initialStudents', activeStudents);
  });

  // Enforce college time (9:00 AM to 4:15 PM IST)
  function isCollegeTime() {
    const istString = new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"});
    const istDate = new Date(istString);
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    
    if (hours > 9 && hours < 16) return true;
    if (hours === 9 && minutes >= 0) return true;
    if (hours === 16 && minutes <= 15) return true;
    return false;
  }

  // When a student updates their location
  socket.on('updateLocation', (data) => {
    const { id, name, semester, lat, lng, bypass } = data;
    
    // Server-side check
    if (!bypass && !isCollegeTime()) {
      socket.emit('trackingError', 'Outside of college hours (9:00 AM to 4:15 PM IST).');
      return; 
    }

    // Enforce 80 students capacity limit
    if (Object.keys(activeStudents).length >= 80 && !activeStudents[socket.id]) {
      socket.emit('trackingError', 'Campus tracking capacity full (Max 80 students).');
      return;
    }

    const studentName = name ? name.trim() : `Student-${socket.id.substring(0, 4)}`;
    const studentSemester = semester ? semester.trim() : 'Unspecified';

    // Update active student record
    activeStudents[socket.id] = {
      socketId: socket.id,
      studentId: id || socket.id,
      name: studentName,
      semester: studentSemester,
      lat: Number(lat),
      lng: Number(lng),
      lastUpdate: new Date()
    };

    // Update or add unique student record in 24h history store
    const historyEntry = historyStore.updateOrAddStudentLocation({
      name: studentName,
      semester: studentSemester,
      lat: Number(lat),
      lng: Number(lng),
      socketId: socket.id
    });

    // Broadcast the live update to all admins
    io.to('admin').emit('studentLocationUpdate', activeStudents[socket.id]);

    // Broadcast history update to admins
    if (historyEntry) {
      io.to('admin').emit('historyUpdated', historyEntry);
    }
  });

  // When a user disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (activeStudents[socket.id]) {
      io.to('admin').emit('studentDisconnected', socket.id);
      delete activeStudents[socket.id];
    }
    const updatedHistory = historyStore.markStudentDisconnected(socket.id);
    if (updatedHistory) {
      io.to('admin').emit('historyUpdated', updatedHistory);
    }
  });

  // Client manually stops tracking
  socket.on('stopTracking', () => {
     if (activeStudents[socket.id]) {
        io.to('admin').emit('studentDisconnected', socket.id);
        delete activeStudents[socket.id];
     }
     const updatedHistory = historyStore.markStudentDisconnected(socket.id);
     if (updatedHistory) {
       io.to('admin').emit('historyUpdated', updatedHistory);
     }
  });
});

// Catch-all: serve index.html for any non-API route (SPA support)
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Student Tracking Server is running on port ${PORT}`);
});
