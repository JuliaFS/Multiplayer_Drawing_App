import { useEffect, useRef, useState, useCallback } from "react";
import io from "socket.io-client";
import HeaderRaw from "./HeaderRaw";

interface DrawData {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string; // "__eraser__" or actual hex color
  size: number;
}

export default function CanvasBoard({ roomId }: { roomId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [prevPos, setPrevPos] = useState<{ x: number; y: number } | null>(null);

  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(3);

  // ------------------------------------------------
  // Draw function (supports eraser)
  // ------------------------------------------------
  const drawLine = (
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    strokeColor: string,
    size: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineCap = "round";

    if (strokeColor === "__eraser__") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = size * 4; // Eraser bigger than pen
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = size;
    }

    ctx.stroke();
    ctx.closePath();
  };

  // ------------------------------------------------
  // Handle draw events from server
  // ------------------------------------------------
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

  // ------------------------------------------------
  // Clear canvas function
  // ------------------------------------------------
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // ------------------------------------------------
  // Socket setup
  // ------------------------------------------------
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io("https://multiplayer-drawing-app.onrender.com");
    }

    const socket = socketRef.current;

    socket.emit("join-room", roomId);

    socket.on("draw", drawHandler);

    socket.on("init-board", (history: DrawData[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      history.forEach((stroke) => drawHandler(stroke));
    });

    socket.on("board-cleared", () => {
      clearCanvas();
    });

    return () => {
      socket.off("draw", drawHandler);
      socket.off("init-board");
      socket.off("board-cleared");
    };
  }, [roomId, drawHandler, clearCanvas]);

  // ------------------------------------------------
  // Mouse events
  // ------------------------------------------------
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

    // current stroke color based on tool
    const strokeColor = tool === "eraser" ? "__eraser__" : color;

    // Draw locally
    drawLine(ctx, prevPos.x, prevPos.y, x, y, strokeColor, size);

    // Emit stroke to server
    socketRef.current?.emit("draw", {
      roomId,
      x0: prevPos.x,
      y0: prevPos.y,
      x1: x,
      y1: y,
      color: strokeColor,
      size,
    });

    setPrevPos({ x, y });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    setPrevPos(null);
  };

  // ------------------------------------------------
  // Render
  // ------------------------------------------------
  return (
    <div>
      <HeaderRaw />

      <div className="flex flex-col items-center space-y-4 mt-8">
        {/* Tools */}
        <div className="flex space-x-2">
          <button
            onClick={() => setTool("pen")}
            className={`px-4 py-2 rounded ${
              tool === "pen" ? "bg-blue-500 text-white" : "bg-gray-300"
            }`}
          >
            Pen
          </button>

          <button
            onClick={() => setTool("eraser")}
            className={`px-4 py-2 rounded ${
              tool === "eraser" ? "bg-blue-500 text-white" : "bg-gray-300"
            }`}
          >
            Eraser
          </button>

          <button
            onClick={() => {
              clearCanvas();
              socketRef.current?.emit("clear-room", roomId);
            }}
            className="px-4 py-2 bg-red-500 text-white rounded"
          >
            Clear Board
          </button>
        </div>

        {/* Color + Size */}
        <div className="flex space-x-3 items-center">
          <input
            title="Color"
            type="color"
            disabled={tool === "eraser"}
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />

          <input
            title="Range"
            type="range"
            min="1"
            max="10"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </div>

        {/* Canvas */}
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
    </div>
  );
}
