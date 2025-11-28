const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

// -------------------------------
// Firebase Admin SDK
// -------------------------------
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

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
// Serve Vite frontend
// -------------------------------
const distPath = path.join(__dirname, "dist"); // Vite build output
app.use(express.static(distPath));

// SPA fallback for React Router
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

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
const rooms = {}; // { roomId: { strokes: [], users: { socketId: username } } }

// This can be removed as we are merging it into the `rooms` object.
// const boards = {}; // { roomId: [strokes...] }

const dirtyRooms = new Set(); // rooms modified since last save

// -------------------------------
// Load room from Firestore
// -------------------------------
async function loadRoomFromFirestore(roomId) {
  try {
    const docRef = db.collection("rooms").doc(roomId);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const strokes = docSnap.data().strokes || [];
      rooms[roomId] = { strokes, users: {} };
      console.log(
        `Loaded room ${roomId} from Firestore (${rooms[roomId].strokes.length} strokes)`
      );
    } else {
      rooms[roomId] = { strokes: [], users: {} };
      // Optionally create the room in Firestore if it doesn’t exist yet
      await db
        .collection("rooms")
        .doc(roomId)
        .set({ strokes: [], updatedAt: Date.now() });
      console.log(`Created new room ${roomId} in Firestore`);
    }

    dirtyRooms.add(roomId);
  } catch (err) {
    console.error("Error loading room:", err);
    rooms[roomId] = { strokes: [], users: {} };
  }
}

// -------------------------------
// Save modified rooms to Firestore
// -------------------------------
async function saveAllRoomsToFirestore() {
  if (dirtyRooms.size === 0) {
    console.log("No modified rooms. Skipping save.");
    return;
  }

  console.log("Saving modified rooms to Firestore...");
  const savePromises = Array.from(dirtyRooms).map((roomId) =>
    db
      .collection("rooms")
      .doc(roomId)
      .set({
        updatedAt: Date.now(),
        strokes: rooms[roomId]?.strokes || [],
      })
  );

  try {
    await Promise.all(savePromises);
    console.log("Saved rooms:", [...dirtyRooms].join(", "));
    dirtyRooms.clear();
  } catch (err) {
    console.error("Error saving rooms:", err);
  }
}

// Auto-save every 30 seconds
setInterval(saveAllRoomsToFirestore, 30_000);

// Save on shutdown
async function gracefulShutdown(error) {
  if (error) console.error("Graceful shutdown due to error:", error);

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

  socket.on("join-room", async ({ roomId, username }) => {
    socket.join(roomId);
    socket.data.username = username;
    socket.data.roomId = roomId;

    if (!rooms[roomId]) {
      await loadRoomFromFirestore(roomId);
    }

    // Add user to the room
    rooms[roomId].users[socket.id] = username;

    // Send board history to the new user
    socket.emit("init-board", rooms[roomId].strokes || []);

    // Notify others in the room about the new user and send updated user list
    io.to(roomId).emit("update-user-list", Object.values(rooms[roomId].users));

    // --------- LIVE CURSOR HANDLERS ----------
    socket.on("cursor-move", ({ roomId, x, y, color, username }) => {
      socket.to(roomId).emit("cursor-update", {
        socketId: socket.id,
        x,
        y,
        color,
        username,
      });
    });

    socket.on("cursor-leave", ({ roomId }) => {
      socket.to(roomId).emit("cursor-remove", socket.id);
    });
  });

  socket.on("draw", (data) => {
    const { roomId, x0, y0, x1, y1, color, size } = data;

    if (!rooms[roomId]) rooms[roomId] = { strokes: [], users: {} };

    rooms[roomId].strokes.push({ x0, y0, x1, y1, color, size });

    dirtyRooms.add(roomId);

    socket.to(roomId).emit("draw", { x0, y0, x1, y1, color, size });
  });

  socket.on("commit-stroke", ({ roomId, stroke }) => {
    if (!roomId || !stroke) return;

    if (!rooms[roomId]) rooms[roomId] = { strokes: [], users: {} };
    rooms[roomId].strokes.push(stroke);
    dirtyRooms.add(roomId);

    socket.to(roomId).emit("commit-stroke", stroke);
  });

  socket.on("clear-room", async (roomId) => {
    console.log(`Room ${roomId} cleared by user.`);

    // Reset in-memory strokes
    if (rooms[roomId]) rooms[roomId].strokes = [];

    dirtyRooms.add(roomId);

    // Reset Firestore
    await db.collection("rooms").doc(roomId).set({
      strokes: [],
      updatedAt: Date.now(),
    });

    // Notify all connected clients
    io.to(roomId).emit("board-cleared");
  });

  socket.on("send-message", ({ roomId, username, text }) => {
    io.to(roomId).emit("new-message", { username, text, socketId: socket.id });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    const { roomId } = socket.data;

    if (roomId && rooms[roomId] && rooms[roomId].users) {
      // Remove user from the room
      delete rooms[roomId].users[socket.id];

      // Notify others in the room about the user leaving and send updated list
      io.to(roomId).emit("update-user-list", Object.values(rooms[roomId].users));

      // Also remove their cursor
      io.to(roomId).emit("cursor-remove", socket.id);
    }
  });
});

// -------------------------------
// Start server
// -------------------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
