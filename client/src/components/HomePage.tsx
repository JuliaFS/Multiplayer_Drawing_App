import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import { collection, getDocs, setDoc, doc } from "firebase/firestore";

export default function HomePage() {
  const [rooms, setRooms] = useState<string[]>();
  const [newRoom, setNewRoom] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Load existing rooms only when button is clicked
  async function loadRooms() {
    try {
      setLoading(true);

      const snap = await getDocs(collection(db, "rooms"));
      const list = snap.docs.map((d) => d.id);

      setRooms(list);
    } catch (err) {
      console.error("Error loading rooms:", err);
    } finally {
      setLoading(false);
    }
  }

  // Create a new room
  async function createRoom() {
    if (!newRoom.trim()) return;

    await setDoc(doc(db, "rooms", newRoom), {
      strokes: [],
      createdAt: Date.now(),
    });

    navigate(`/room/${newRoom}`);
  }

  return (
    <div className="flex flex-col items-center mx-auto gap-6 mt-20 w-full max-w-sm">
      {/* Create new room */}
      <div className="w-full flex flex-col gap-2">
        <input
          className="border p-2 rounded w-full"
          placeholder="Create new room"
          value={newRoom}
          onChange={(e) => setNewRoom(e.target.value)}
          autoComplete="off"
        />

        <button
          onClick={createRoom}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          Create Room
        </button>
      </div>

      {/* Load existing rooms */}
      <div className="w-full flex flex-col gap-4 mt-6">
        <button
          onClick={loadRooms}
          className="px-4 py-2 bg-purple-500 text-white rounded"
        >
          Load Existing Rooms
        </button>

        {loading && <p className="text-center text-gray-600">Loading...</p>}

        {/* {!loading && rooms.length === 0 && (
          <p className="text-gray-500 text-center">No rooms loaded</p>
        )} */}

        {/* Room buttons */}
        {rooms && (
          <div className="flex flex-col gap-2">
            <select
              title="Available Rooms"
              className="px-2 py-3 rounded border border-purple-500"
              defaultValue=""
              onChange={(e) => {
                const roomId = e.target.value;
                if (!roomId) return;
                // Open in same tab
                // navigate(`/room/${roomId}`);

                // OR open in new tab
                window.open(`/room/${roomId}`, "_blank");
              }}
            >
              <option value="">Choose room</option>
              {rooms.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
