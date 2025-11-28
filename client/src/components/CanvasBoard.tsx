import { useEffect, useRef, useState, useCallback } from "react";
import io from "socket.io-client";
import HeaderRaw from "./HeaderRaw";

interface Stroke {
  type?: "stroke" | "text";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  size: number;
}

interface CursorData {
  x: number;
  y: number;
  socketId: string;
  color: string;
  username: string;
}

export default function CanvasBoard({ roomId }: { roomId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const boards = useRef<any[]>([]);

  const [isDrawing, setIsDrawing] = useState(false);
  const [prevPos, setPrevPos] = useState<{ x: number; y: number } | null>(null);

  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(3);

  const [cursors, setCursors] = useState<Record<string, CursorData>>({});
  const [username, setUsername] = useState("");
  const [activeUsers, setActiveUsers] = useState<string[]>([]);

  interface Message {
    username: string;
    text: string;
  }
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");

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
      ctx.lineWidth = size * 4;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = size;
    }

    ctx.stroke();
    ctx.closePath();
  };

  const drawHandler = useCallback(
    ({ x0, y0, x1, y1, color, size }: Stroke) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawLine(ctx, x0, y0, x1, y1, color, size);
    },
    []
  );

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Redraw the entire board history
  const redrawBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear before redrawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Redraw from history
    boards.current.forEach((item) => {
      if (item.type !== "text") {
        drawLine(ctx, item.x0, item.y0, item.x1, item.y1, item.color, item.size);
      }
    });
  }, []);

  // Handle canvas resizing
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    redrawBoard();
  }, [redrawBoard]);

  // Prompt for username on component mount
  useEffect(() => {
    const name = prompt("Please enter your name:");
    setUsername(name || `User-${Math.random().toString(16).slice(2, 6)}`);
  }, []);

  useEffect(() => {
    if (!username) return; // Don't connect until username is set

    if (!socketRef.current) {
      socketRef.current = io(
        "https://multiplayer-drawing-app.onrender.com"
      );
    }

    const socket = socketRef.current;

    socket.emit("join-room", { roomId, username });

    socket.on("draw", drawHandler);

    socket.on("init-board", (history: Stroke[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Store history and draw it
      boards.current = history;
      resizeCanvas(); // This will also call redrawBoard
    });

    socket.on("board-cleared", clearCanvas);

    socket.on("cursor-update", (data: CursorData) => {
      setCursors((prev) => ({ ...prev, [data.socketId]: data }));
    });

    socket.on("cursor-remove", (socketId: string) => {
      setCursors((prev) => {
        const updated = { ...prev };
        delete updated[socketId];
        return updated;
      });
    });

    socket.on("update-user-list", (users: string[]) => {
      setActiveUsers(users);
    });

    socket.on("new-message", (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    // Resize listener
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas(); // Initial resize

    return () => {
      socket.off("draw", drawHandler);
      socket.off("init-board");
      socket.off("board-cleared");
      socket.off("cursor-update");
      socket.off("cursor-remove");
      socket.off("update-user-list");
      socket.off("new-message");
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [roomId, username, drawHandler, clearCanvas, resizeCanvas]);

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    setPrevPos(getMousePos(e));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);

    socketRef.current?.emit("cursor-move", {
      roomId,
      x: pos.x,
      y: pos.y,
      color,
      username,
      socketId: socketRef.current.id,
    });

    if (!isDrawing || !prevPos) return;

    const ctx = canvasRef.current!.getContext("2d")!;
    const strokeColor = tool === "eraser" ? "__eraser__" : color;

    drawLine(ctx, prevPos.x, prevPos.y, pos.x, pos.y, strokeColor, size);
    boards.current.push({ x0: prevPos.x, y0: prevPos.y, x1: pos.x, y1: pos.y, color: strokeColor, size });

    socketRef.current?.emit("draw", {
      roomId,
      x0: prevPos.x,
      y0: prevPos.y,
      x1: pos.x,
      y1: pos.y,
      color: strokeColor,
      size,
    });

    setPrevPos(pos);
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    setPrevPos(null);
  };

  const getTouchPos = (e: TouchEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const touch = e.touches[0];
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = getTouchPos(e.nativeEvent);
    setIsDrawing(true);
    setPrevPos(touch);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pos = getTouchPos(e.nativeEvent);

    socketRef.current?.emit("cursor-move", {
      roomId,
      x: pos.x,
      y: pos.y,
      color,
      username,
      socketId: socketRef.current.id,
    });

    if (!isDrawing || !prevPos) return;

    const ctx = canvasRef.current!.getContext("2d")!;
    const strokeColor = tool === "eraser" ? "__eraser__" : color;

    drawLine(ctx, prevPos.x, prevPos.y, pos.x, pos.y, strokeColor, size);
    boards.current.push({ x0: prevPos.x, y0: prevPos.y, x1: pos.x, y1: pos.y, color: strokeColor, size });

    socketRef.current?.emit("draw", {
      roomId,
      x0: prevPos.x,
      y0: prevPos.y,
      x1: pos.x,
      y1: pos.y,
      color: strokeColor,
      size,
    });

    setPrevPos(pos);
  };

  const handleTouchEnd = () => {
    setIsDrawing(false);
    setPrevPos(null);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim() && username) {
      socketRef.current?.emit("send-message", { roomId, username, text: chatInput });
      setMessages((prev) => [...prev, { username: "You", text: chatInput }]); // Optimistic update
      setChatInput("");
    }
  };

  const renderCursors = () => {
    return Object.values(cursors).map((cursor) => (
      <div
        key={cursor.socketId}
        className="pointer-events-none absolute z-50"
        style={{
          left: cursor.x,
          top: cursor.y,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          className="w-3 h-3 rounded-full"
          style={{
            backgroundColor: cursor.color,
            border: "2px solid white",
          }}
        ></div>
        <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 text-xs bg-black bg-opacity-50 text-white px-1 rounded whitespace-nowrap">
          {cursor.username}
        </span>
      </div>
    ));
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-gray-100">
      {" "}
      <HeaderRaw />{" "}
      <div className="flex flex-grow overflow-hidden">
        {/* Main Content */}
        <div className="flex flex-col items-center p-4 space-y-4 flex-grow">
          {" "}
          {/* Toolbar */}
        <div className="flex space-x-2">
          <button
            onClick={() => setTool("pen")}
            className={`px-4 py-2 rounded ${
              tool === "pen" ? "bg-blue-500 text-white" : "bg-gray-300"
            }`}
          >
            Pen{" "}
          </button>
          <button
            onClick={() => setTool("eraser")}
            className={`px-4 py-2 rounded ${
              tool === "eraser" ? "bg-blue-500 text-white" : "bg-gray-300"
            }`}
          >
            Eraser{" "}
          </button>
          <button
            onClick={() => {
              clearCanvas();
              socketRef.current?.emit("clear-room", roomId);
            }}
            className="px-4 py-2 bg-red-500 text-white rounded"
          >
            Clear Board{" "}
          </button>{" "}
        </div>
        <div className="flex space-x-3 items-center">
          <input
            type="color"
            disabled={tool === "eraser"}
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <input
            type="range"
            min="1"
            max="10"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </div>
        {/* Canvas Container */}
        <div className="relative w-full h-full max-w-[800px] max-h-[600px] aspect-[4/3]">
          {renderCursors()}
          <canvas
            ref={canvasRef}
            className="border border-gray-400 bg-white rounded-md shadow-lg w-full h-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
        </div>
        </div>

        {/* Side Panel */}
        <div className="w-64 bg-white border-l p-4 flex flex-col space-y-4">
          {/* Who's Online */}
          <div>
            <h3 className="font-bold text-lg mb-2">Who's Online ({activeUsers.length})</h3>
            <ul className="list-disc list-inside">
              {activeUsers.map((user, index) => (
                <li key={index} className="truncate">{user}</li>
              ))}
            </ul>
          </div>

          {/* Chat */}
          <div className="flex-grow flex flex-col border-t pt-4">
            <h3 className="font-bold text-lg mb-2">Chat</h3>
            <div className="flex-grow bg-gray-50 p-2 rounded border overflow-y-auto mb-2">
              {messages.map((msg, index) => (
                <div key={index} className="text-sm mb-1">
                  <span className="font-semibold">{msg.username}: </span>
                  <span>{msg.text}</span>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendMessage} className="flex">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-grow border rounded-l p-2"
                placeholder="Say something..."
              />
              <button type="submit" className="bg-blue-500 text-white px-4 rounded-r">Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
