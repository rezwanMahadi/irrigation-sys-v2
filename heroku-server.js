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
  
  // Handle LED toggle from web client
  socket.on('toggleLED', (state) => {
    console.log('LED state toggled to:', state);
    ledState = state;
    // Broadcast the new state to all connected clients (including ESP32)
    io.emit('ledState', ledState);
  });

  // Handle LED status update from ESP32 (sync state)
  socket.on('ledStatus', (state) => {
    console.log('LED status update from device:', state);
    if (ledState !== state) {
      ledState = state;
      // Broadcast the updated state to all clients
      io.emit('ledState', ledState);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Heroku Socket.IO server running on port ${PORT}`);
}); 