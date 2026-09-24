const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');

const hospitalRoutes = require('./routes/hospitalRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const ambulanceRoutes = require('./routes/ambulanceRoutes');
const opdRoutes = require('./routes/opdRoutes');
const emergencyService = require('./services/emergencyService');
const { runAllSeeds } = require('./db/seedHospitals');

// Auto-seed and verify all 5 hospital and driver databases on server startup
try {
  runAllSeeds();
  console.log('[Server Startup] Master hospital databases & ambulance fleets successfully verified.');
} catch (err) {
  console.error('[Server Startup] Database auto-seed error:', err.message);
}

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.set('io', io);

// Initialize 2-minute sequential routing background supervisor
emergencyService.initTimeoutWorker(io);

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/ambulance', ambulanceRoutes);
app.use('/api/opd', opdRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'SmartCare Hospital Management & Coordination Platform',
    timestamp: new Date().toISOString()
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on('join_hospital', (hospitalId) => {
    socket.join(`hospital_${hospitalId}`);
    console.log(`[Socket.IO] Client ${socket.id} joined room: hospital_${hospitalId}`);
  });

  socket.on('leave_hospital', (hospitalId) => {
    socket.leave(`hospital_${hospitalId}`);
    console.log(`[Socket.IO] Client ${socket.id} left room: hospital_${hospitalId}`);
  });

  socket.on('join_emergency', (requestId) => {
    socket.join(`emergency_${requestId}`);
    console.log(`[Socket.IO] Client ${socket.id} joined emergency room: emergency_${requestId}`);
  });

  socket.on('leave_emergency', (requestId) => {
    socket.leave(`emergency_${requestId}`);
    console.log(`[Socket.IO] Client ${socket.id} left emergency room: emergency_${requestId}`);
  });

  // Driver Fleet & Individual Driver Rooms
  socket.on('join_driver', (driverId) => {
    socket.join(`driver_${driverId}`);
    console.log(`[Socket.IO] Driver client ${socket.id} joined personal room: driver_${driverId}`);
  });

  socket.on('leave_driver', (driverId) => {
    socket.leave(`driver_${driverId}`);
    console.log(`[Socket.IO] Driver client ${socket.id} left personal room: driver_${driverId}`);
  });

  socket.on('join_hospital_drivers', (hospitalId) => {
    socket.join(`hospital_drivers_${hospitalId}`);
    console.log(`[Socket.IO] Driver client ${socket.id} joined fleet room: hospital_drivers_${hospitalId}`);
  });

  socket.on('leave_hospital_drivers', (hospitalId) => {
    socket.leave(`hospital_drivers_${hospitalId}`);
    console.log(`[Socket.IO] Driver client ${socket.id} left fleet room: hospital_drivers_${hospitalId}`);
  });

  // Real-time Driver GPS stream
  socket.on('driver_ping_location', (data) => {
    const { hospitalId, driverId, requestId, lat, lng } = data;
    if (requestId) {
      io.to(`emergency_${requestId}`).emit('ambulance:location_update', {
        driverId,
        requestId,
        lat,
        lng,
        timestamp: new Date().toISOString()
      });
    }
    if (hospitalId) {
      io.to(`hospital_${hospitalId}`).emit('ambulance:driver_location', {
        driverId,
        lat,
        lng,
        timestamp: new Date().toISOString()
      });
    }
  });

  // OPD Virtual Queue Room Subscriptions
  socket.on('join_opd_queue', ({ hospitalId, doctorId, date }) => {
    const room = `opd_queue_${hospitalId}_${doctorId}_${date}`;
    socket.join(room);
    console.log(`[Socket.IO] Client ${socket.id} joined OPD queue room: ${room}`);
  });

  socket.on('leave_opd_queue', ({ hospitalId, doctorId, date }) => {
    const room = `opd_queue_${hospitalId}_${doctorId}_${date}`;
    socket.leave(room);
    console.log(`[Socket.IO] Client ${socket.id} left OPD queue room: ${room}`);
  });

  // OPD Doctor Personal Room Subscriptions
  socket.on('join_opd_doctor', (data) => {
    const docId = typeof data === 'object' && data !== null ? data.doctorId : data;
    const room = `opd_doctor_${docId}`;
    socket.join(room);
    console.log(`[Socket.IO] Client ${socket.id} joined Doctor room: ${room}`);
  });

  socket.on('leave_opd_doctor', (data) => {
    const docId = typeof data === 'object' && data !== null ? data.doctorId : data;
    const room = `opd_doctor_${docId}`;
    socket.leave(room);
    console.log(`[Socket.IO] Client ${socket.id} left Doctor room: ${room}`);
  });

  // OPD Hospital General Room Subscriptions
  socket.on('join_opd_hospital', (data) => {
    const hospId = typeof data === 'object' && data !== null ? data.hospitalId : data;
    const room = `opd_hospital_${hospId}`;
    socket.join(room);
    console.log(`[Socket.IO] Client ${socket.id} joined OPD hospital room: ${room}`);
  });

  socket.on('leave_opd_hospital', (data) => {
    const hospId = typeof data === 'object' && data !== null ? data.hospitalId : data;
    const room = `opd_hospital_${hospId}`;
    socket.leave(room);
    console.log(`[Socket.IO] Client ${socket.id} left OPD hospital room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Serve frontend dist if built
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  console.log(`[Unified Server] Serving frontend from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  // Express 5 fallback route
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    next();
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      message: 'SmartCare Hospital Backend Server Running',
      port: 5000,
      endpoints: {
        hospitals: '/api/hospitals',
        health: '/api/health'
      }
    });
  });
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log('================================================================');
  console.log(` SmartCare Hospital Server running on http://localhost:${PORT}`);
  console.log(` Real-time Socket.IO Layer active`);
  console.log('================================================================');
});
