// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// -------------------------------
// Firebase Admin SDK
// -------------------------------
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // downloaded from Firebase

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

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
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// -------------------------------
// In-memory board storage
// -------------------------------
const boards = {}; // { roomId: [strokes...] }

// ==========================================================
// 🔥 Load room history from Firestore
// ==========================================================
async function loadRoomFromFirestore(roomId) {
  try {
    const docRef = db.collection("rooms").doc(roomId);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      boards[roomId] = docSnap.data().strokes || [];
      console.log(`Loaded room ${roomId} from Firestore (${boards[roomId].length} strokes)`);
    } else {
      boards[roomId] = [];
    }
  } catch (err) {
    console.error("Error loading room:", err);
    boards[roomId] = [];
  }
}

// ==========================================================
// 🔥 Save all rooms to Firestore
// ==========================================================
async function saveAllRoomsToFirestore() {
  console.log("Saving ALL rooms to Firestore...");

  const savePromises = Object.entries(boards).map(([roomId, strokes]) => {
    return db.collection("rooms").doc(roomId).set({
      updatedAt: Date.now(),
      strokes,
    });
  });

  try {
    await Promise.all(savePromises);
    console.log("All rooms saved successfully.");
  } catch (err) {
    console.error("Error saving rooms:", err);
  }
}

// ==========================================================
// 🔥 Auto-save every 30 seconds
// ==========================================================
setInterval(saveAllRoomsToFirestore, 30_000);

// ==========================================================
// 🔥 Save on shutdown
// ==========================================================
async function gracefulShutdown() {
  console.log("Server shutting down... Saving rooms first...");
  await saveAllRoomsToFirestore();
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("uncaughtException", gracefulShutdown);
process.on("unhandledRejection", gracefulShutdown);

// -------------------------------
// Socket events
// -------------------------------
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join a room
  socket.on("join-room", async (roomId) => {
    socket.join(roomId);

    if (!boards[roomId]) {
      await loadRoomFromFirestore(roomId);
    }

    // Send existing board history
    socket.emit("init-board", boards[roomId]);
  });

  // Receive drawing stroke
  socket.on("draw", (data) => {
    const { roomId, x0, y0, x1, y1, color, size } = data;

    if (!boards[roomId]) boards[roomId] = [];

    boards[roomId].push({ x0, y0, x1, y1, color, size });

    // Broadcast to others in the room
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



// // server.js
// const express = require("express");
// const http = require("http");
// const { Server } = require("socket.io");
// const cors = require("cors");

// // -------------------------------
// // Setup Express & HTTP server
// // -------------------------------
// const app = express();
// app.use(cors());

// const server = http.createServer(app);

// // -------------------------------
// // Setup Socket.io
// // -------------------------------
// const io = new Server(server, {
//   cors: {
//     origin: "*", // replace with frontend URL in production
//     methods: ["GET", "POST"],
//   },
// });

// // -------------------------------
// // In-memory storage of board history
// // -------------------------------
// const boards = {}; // { roomId: [ {x0, y0, x1, y1, color, size}, ... ] }

// // -------------------------------
// // Socket events
// // -------------------------------
// io.on("connection", (socket) => {
//   //console.log("User connected:", socket.id);

//   // Join a room
//   socket.on("join-room", (roomId) => {
//     socket.join(roomId);
//     //console.log(`${socket.id} joined room ${roomId}`);

//     // Send existing board history to the new client
//     if (boards[roomId]) {
//       socket.emit("init-board", boards[roomId]);
//     } else {
//       boards[roomId] = [];
//     }
//   });

//   // Receive drawing data
//   socket.on("draw", (data) => {
//     const { roomId, x0, y0, x1, y1, color, size } = data;

//     // Store drawing data in memory
//     if (!boards[roomId]) boards[roomId] = [];
//     boards[roomId].push({ x0, y0, x1, y1, color, size });

//     // Broadcast to other users in the room
//     socket.to(roomId).emit("draw", { x0, y0, x1, y1, color, size });
//   });

//   socket.on("disconnect", () => {
//     console.log("User disconnected:", socket.id);
//   });
// });

// // -------------------------------
// // Start server
// // -------------------------------
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
