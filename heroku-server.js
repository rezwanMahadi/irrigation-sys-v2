const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set!');
  process.exit(1);
}

// Initialize Prisma Client with error handling
let prisma;
try {
  prisma = new PrismaClient({
    errorFormat: 'minimal',
  });
  console.log('Prisma client initialized successfully');
} catch (error) {
  console.error('Failed to initialize Prisma client:', error);
  process.exit(1);
}

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
let pumpMode = false;
let reservoir1 = false;
let reservoir2 = false;
let soilMoistureUpperLimit = 0;
let soilMoistureLowerLimit = 0;
let waterLevelLimit = 0;
// Track connected ESP32 devices
const connectedDevices = new Map();

// Use the port provided by Heroku
const PORT = process.env.PORT || 3001;

// Function to save sensor data to the database
async function saveSensorData(data, deviceId) {
  try {
    // Create a date with GMT+6 offset
    const now = new Date();
    const offsetHours = 6; // GMT+6
    now.setHours(now.getHours());

    await prisma.sensorData.create({
      data: {
        temperature: data.temperature,
        soilMoisture: data.soilMoisture,
        waterLevel: data.waterLevel,
        deviceId: deviceId || 'unknown',
        createdAt: now // Set the timestamp with GMT+6 offset
      }
    });
    console.log('Sensor data saved to database with GMT+6 timestamp');
  } catch (error) {
    console.error('Error saving sensor data:', error);
  }
}

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
  socket.emit('reservoir1State', reservoir1);
  socket.emit('reservoir2State', reservoir2);
  socket.emit('soilMoistureUpperLimit', soilMoistureUpperLimit);
  socket.emit('soilMoistureLowerLimit', soilMoistureLowerLimit);
  socket.emit('waterLevelLimit', waterLevelLimit);
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

  socket.on('togglePumpMode', (state) => {
    console.log('Pump mode update from website:', state);
    if (pumpMode !== state) {
      pumpMode = state;
    }
    if (reservoir1 === true && pumpMode === true) {
      reservoir1 = false;
    }
    if (reservoir2 === true && pumpMode === true) {
      reservoir2 = false;
    }
    // Broadcast the updated state to all  clients
    io.emit('selectedPumpMode', pumpMode);
    io.emit('reservoir1State', reservoir1);
    io.emit('reservoir2State', reservoir2);
  });

  socket.on('toggleReservoir1', (state) => {
    console.log('Reservoir 1 state update from website:', state);
    if (reservoir1 !== state) {
      reservoir1 = state;
    }
    // Broadcast the updated state to all clients
    io.emit('reservoir1State', reservoir1);
  });

  socket.on('toggleReservoir2', (state) => {
    console.log('Reservoir 2 state update from website:', state);
    if (reservoir2 !== state) {
      reservoir2 = state;
    }
    // Broadcast the updated state to all clients
    io.emit('reservoir2State', reservoir2);
  });

  socket.on('setNewLimit', async (newSoilMoistureUpperLimit, newSoilMoistureLowerLimit, newWaterLevelLimit) => {
    console.log('Set limit from website:', newSoilMoistureUpperLimit, newSoilMoistureLowerLimit, newWaterLevelLimit);
    soilMoistureUpperLimit = newSoilMoistureUpperLimit;
    soilMoistureLowerLimit = newSoilMoistureLowerLimit;
    waterLevelLimit = newWaterLevelLimit;
    // Save the limit to the database
    await prisma.limit.update({
      where: {
        id: 11
      },
      data: {
        soilMoistureUpperLimit,
        soilMoistureLowerLimit,
        waterLevelLimit
      }
    });
    io.emit('setNewLimit', soilMoistureUpperLimit, soilMoistureLowerLimit, waterLevelLimit);
  });

  socket.on('sensorsData_controllingStatus', (sensorsValue) => {
    const { soilMoisture, temperature, waterLevel, newLedState, selectedPumpMode } = sensorsValue;
    console.log('sensors data update from device:', soilMoisture, temperature, waterLevel, newLedState, selectedPumpMode);
    
    // Save sensor data to database
    const deviceId = connectedDevices.has(socket.id) ? connectedDevices.get(socket.id).deviceId : 'unknown';
    saveSensorData({ 
      temperature, 
      soilMoisture, 
      waterLevel 
    }, deviceId);
    
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

// Clean up resources on process termination
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server 
server.listen(PORT, () => {
  console.log(`Heroku Socket.IO server running on port ${PORT}`);
  console.log(`Database URL is ${process.env.DATABASE_URL ? 'set' : 'NOT SET'}`);
}); 