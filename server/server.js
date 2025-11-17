// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// -------------------------------
// Setup Express & HTTP server
// -------------------------------
const app = express();
app.use(cors());

const server = http.createServer(app);

// -------------------------------
// Setup Socket.io
// -------------------------------
const io = new Server(server, {
  cors: {
    origin: "*", // replace with frontend URL in production
    methods: ["GET", "POST"],
  },
});

// -------------------------------
// In-memory storage of board history
// -------------------------------
const boards = {}; // { roomId: [ {x0, y0, x1, y1, color, size}, ... ] }

// -------------------------------
// Socket events
// -------------------------------
io.on("connection", (socket) => {
  //console.log("User connected:", socket.id);

  // Join a room
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    //console.log(`${socket.id} joined room ${roomId}`);

    // Send existing board history to the new client
    if (boards[roomId]) {
      socket.emit("init-board", boards[roomId]);
    } else {
      boards[roomId] = [];
    }
  });

  // Receive drawing data
  socket.on("draw", (data) => {
    const { roomId, x0, y0, x1, y1, color, size } = data;

    // Store drawing data in memory
    if (!boards[roomId]) boards[roomId] = [];
    boards[roomId].push({ x0, y0, x1, y1, color, size });

    // Broadcast to other users in the room
    socket.to(roomId).emit("draw", { x0, y0, x1, y1, color, size });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// -------------------------------
// Start server
// -------------------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
