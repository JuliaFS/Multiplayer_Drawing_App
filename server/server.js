const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

// -------------------------------
// Firebase Admin SDK
// -------------------------------
const admin = require("firebase-admin");

// const serviceAccount = require("./serviceAccountKey.json"); // downloaded from Firebase
// const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT);
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

// Fallback to index.html for SPA routing
app.get("*", (req, res) => {
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
const boards = {};      // { roomId: [strokes...] }
const dirtyRooms = new Set(); // rooms modified since last save

// ==========================================================
// 🔥 Load room history from Firestore
// ==========================================================
async function loadRoomFromFirestore(roomId) {
  try {
    const docRef = db.collection("rooms").doc(roomId);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      boards[roomId] = docSnap.data().strokes || [];
      console.log(
        `Loaded room ${roomId} from Firestore (${boards[roomId].length} strokes)`
      );
    } else {
      boards[roomId] = [];
    }

    dirtyRooms.add(roomId);

  } catch (err) {
    console.error("Error loading room:", err);
    boards[roomId] = [];
  }
}

// ==========================================================
// 🔥 Save only modified rooms to Firestore
// ==========================================================
async function saveAllRoomsToFirestore() {
if (dirtyRooms.size === 0) {
console.log("No modified rooms. Skipping save.");
return;
}

console.log("Saving modified rooms to Firestore...");

const savePromises = Array.from(dirtyRooms).map((roomId) =>
db.collection("rooms").doc(roomId).set({
updatedAt: Date.now(),
strokes: boards[roomId] || [],
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

// ==========================================================
// 🔥 Auto-save every 30 seconds
// ==========================================================
setInterval(saveAllRoomsToFirestore, 30_000);

// ==========================================================
// 🔥 Save on shutdown
// ==========================================================
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

// Join a room
socket.on("join-room", async (roomId) => {
socket.join(roomId);

```
if (!boards[roomId]) {
  await loadRoomFromFirestore(roomId);
}

// Send existing board history
socket.emit("init-board", boards[roomId]);
```

});

// Receive drawing stroke
socket.on("draw", (data) => {
const { roomId, x0, y0, x1, y1, color, size } = data;

```
if (!boards[roomId]) boards[roomId] = [];

boards[roomId].push({ x0, y0, x1, y1, color, size });

dirtyRooms.add(roomId);

socket.to(roomId).emit("draw", { x0, y0, x1, y1, color, size });
```

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




