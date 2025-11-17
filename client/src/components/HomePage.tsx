import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function HomePage() {
  const [room, setRoom] = useState("");
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center gap-4 mt-20">
      <input
        className="border p-2 rounded"
        placeholder="Enter room name..."
        value={room}
        onChange={(e) => setRoom(e.target.value)}
        autoComplete="off"
      />

      <button
        onClick={() => navigate(`/room/${room}`)}
        className="px-4 py-2 bg-blue-500 text-red-500 rounded"
      >
        Join Room
      </button>
    </div>
  );
}
