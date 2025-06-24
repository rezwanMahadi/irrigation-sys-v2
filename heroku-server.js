const http = require('http');
const { Server } = require('socket.io');

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end('Heroku Socket.IO Server Running');
});

// Store the current LED state
let ledState = false;
let pinState = false;
// Track connected ESP32 devices
const connectedDevices = new Map();

// Use the port provided by Heroku
const PORT = process.env.PORT || 3001;

// Create Socket.IO server with CORS enabled
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current LED state to newly connected client
  socket.emit('ledState', ledState);

  // Send current connected devices to newly connected client
  socket.emit('connectedDevices', Array.from(connectedDevices.values()));

  // Handle ESP32 device registration with custom ID
  socket.on('registerDevice', (deviceInfo) => {
    const { deviceId, deviceType = 'ESP32' } = deviceInfo;
    console.log('Device registered:', deviceId, deviceType);

    // Store the device with its details
    connectedDevices.set(socket.id, {
      socketId: socket.id,
      deviceId,
      deviceType,
      lastSeen: new Date().toISOString(),
      connected: true
    });

    // Broadcast the updated device list to all clients
    io.emit('deviceUpdate', Array.from(connectedDevices.values()));
  });

  // Handle device heartbeat/ping
  socket.on('deviceHeartbeat', (deviceId) => {
    if (connectedDevices.has(socket.id)) {
      const device = connectedDevices.get(socket.id);
      device.lastSeen = new Date().toISOString();
      connectedDevices.set(socket.id, device);
    }
  });

  // Handle LED toggle from web client
  socket.on('toggleLED', (state) => {
    console.log('LED state toggled to:', state);
    ledState = state;
    // Broadcast the new state to all connected clients (including ESP32)
    io.emit('ledState', ledState);
  });

  // Handle LED status update from ESP32 (sync state)
  socket.on('controllingStatus', (state) => {
    const { newLedState, selectedPumpMode } = state;
    console.log('LED status update from device:', state);
    if (ledState !== newLedState) {
      ledState = newLedState;
    }
    // Broadcast the updated state to all clients
    io.emit('controllingStatus', ledState, selectedPumpMode);
  });

  socket.on('sensorsData_controllingStatus', (sensorsValue) => {
    const { soilMoisture, temperature, waterLevel, newLedState, selectedPumpMode } = sensorsValue;
    console.log('sensors data update from device:', soilMoisture, temperature, waterLevel, newLedState, selectedPumpMode);
    // Broadcast the updated state to all clients
    io.emit('sensorsData_controllingStatus', soilMoisture, temperature, waterLevel, newLedState, selectedPumpMode);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    // If the disconnected socket is a registered device, update its status
    if (connectedDevices.has(socket.id)) {
      const device = connectedDevices.get(socket.id);
      device.connected = false;
      device.disconnectedAt = new Date().toISOString();
      connectedDevices.set(socket.id, device);

      // After a delay, remove the device completely if it doesn't reconnect
      setTimeout(() => {
        if (connectedDevices.has(socket.id) && !connectedDevices.get(socket.id).connected) {
          connectedDevices.delete(socket.id);
          // Notify clients that device is gone
          io.emit('deviceUpdate', Array.from(connectedDevices.values()));
        }
      }, 300000); // Remove after 5 minutes of disconnection

      // Immediately notify clients of disconnection
      io.emit('deviceUpdate', Array.from(connectedDevices.values()));
    }
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Heroku Socket.IO server running on port ${PORT}`);
}); 