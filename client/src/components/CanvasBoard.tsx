import { useEffect, useRef, useState, useCallback } from "react";
import io from "socket.io-client"; // default import
// import type { Socket } from "socket.io-client"; // type-only import

interface DrawData {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  size: number;
}

export default function CanvasBoard({ roomId }: { roomId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // const socketRef = useRef<Socket | null>(null); // ✅ move socket here
 const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [prevPos, setPrevPos] = useState<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(3);

  // -------------------------------
  // Drawing function
  // -------------------------------
  const drawLine = (
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    size: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.stroke();
    ctx.closePath();
  };

  // -------------------------------
  // Receive draw events from server
  // -------------------------------
  const drawHandler = useCallback(
    ({ x0, y0, x1, y1, color, size }: DrawData) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawLine(ctx, x0, y0, x1, y1, color, size);
    },
    []
  );

  // -------------------------------
  // Setup socket once
  // -------------------------------
  useEffect(() => {
  if (!socketRef.current) {
    socketRef.current = io("http://localhost:5000");
  }

  const socket = socketRef.current;

  // Join the room
  socket.emit("join-room", roomId);

  // Listen for live drawing updates
  socket.on("draw", drawHandler);

  // Listen for initial board history
  socket.on("init-board", (history: DrawData[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw every previous line
    history.forEach((data) => drawHandler(data));
  });

  return () => {
    socket.off("draw", drawHandler);
    socket.off("init-board");
  };
}, [roomId, drawHandler]);


  // -------------------------------
  // Mouse events
  // -------------------------------
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const rect = canvasRef.current!.getBoundingClientRect();
    setPrevPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !prevPos) return;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    drawLine(ctx, prevPos.x, prevPos.y, x, y, color, size);

    socketRef.current?.emit("draw", {
      roomId,
      x0: prevPos.x,
      y0: prevPos.y,
      x1: x,
      y1: y,
      color,
      size,
    });

    setPrevPos({ x, y });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    setPrevPos(null);
  };

  // -------------------------------
  // Render
  // -------------------------------
  return (
    <div className="flex flex-col items-center space-y-2">
      <div className="flex space-x-2">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <input type="range" min="1" max="10" value={size} onChange={(e) => setSize(Number(e.target.value))} />
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="border border-gray-400 bg-white rounded-md shadow"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </div>
  );
}

