import { useEffect, useRef, useState, useCallback } from "react";
import io from "socket.io-client";
import HeaderRaw from "./HeaderRaw";

interface DrawData {
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
}

export default function CanvasBoard({ roomId }: { roomId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const boards = useRef<any[]>([]);

  const [isDrawing, setIsDrawing] = useState(false);
  const [prevPos, setPrevPos] = useState<{ x: number; y: number } | null>(null);

  const [tool, setTool] = useState<"pen" | "eraser" | "text">("pen");
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(3);

  const [fontSize, setFontSize] = useState(20);
  const [fontFamily, setFontFamily] = useState("Arial");

  const [cursors, setCursors] = useState<Record<string, CursorData>>({});

  const [textInput, setTextInput] = useState("");
  const [textPosition, setTextPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

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
    ({ x0, y0, x1, y1, color, size }: DrawData) => {
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

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(
        "https://multiplayer-drawing-app.onrender.com"
      );
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

    socket.on("text", (data) => {
      const ctx = canvasRef.current!.getContext("2d")!;
      ctx.font = `${data.fontSize}px ${data.fontFamily}`;
      ctx.fillStyle = data.color;
      ctx.fillText(data.text, data.x, data.y);

      boards.current.push({
        type: "text",
        ...data,
      });
    });

    return () => {
      socket.off("draw", drawHandler);
      socket.off("init-board");
      socket.off("board-cleared");
      socket.off("cursor-update");
      socket.off("cursor-remove");
      socket.off("text");
    };
  }, [roomId, drawHandler, clearCanvas]);

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "text") {
      setTextPosition(getMousePos(e));
      setTextInput("");
      return;
    }
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
      socketId: socketRef.current.id,
    });

    if (!isDrawing || !prevPos) return;

    const ctx = canvasRef.current!.getContext("2d")!;
    const strokeColor = tool === "eraser" ? "__eraser__" : color;

    drawLine(ctx, prevPos.x, prevPos.y, pos.x, pos.y, strokeColor, size);

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
      socketId: socketRef.current.id,
    });

    if (!isDrawing || !prevPos) return;

    const ctx = canvasRef.current!.getContext("2d")!;
    const strokeColor = tool === "eraser" ? "__eraser__" : color;

    drawLine(ctx, prevPos.x, prevPos.y, pos.x, pos.y, strokeColor, size);

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
        ></div>{" "}
      </div>
    ));
  };

  const placeText = () => {
    if (!textPosition || !textInput.trim()) return;

    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.fillText(textInput, textPosition.x, textPosition.y);

    socketRef.current?.emit("text", {
      roomId,
      x: textPosition.x,
      y: textPosition.y,
      text: textInput,
      color: color,
      fontSize,
      fontFamily,
    });

    boards.current.push({
      type: "text",
      x: textPosition.x,
      y: textPosition.y,
      text: textInput,
      color: color,
      fontSize,
      fontFamily,
    });

    setTextPosition(null);
    setTextInput("");
  };

  return (
    <div>
      {" "}
      <HeaderRaw />{" "}
      <div className="flex flex-col items-center space-y-4 mt-8 relative">
        {" "}
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
          <button className={`px-4 py-2 rounded ${
              tool === "text" ? "bg-green-400 text-white" : "bg-gray-300"
            }`} onClick={() => setTool("text")
            
          }>Text</button>
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

          {/* FONT SIZE & FAMILY */}
          {tool === "text" && (
            <>
              <input
                type="number"
                min={10}
                max={100}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-16 border p-1 rounded"
              />
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="border p-1 rounded"
              >
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Verdana">Verdana</option>
              </select>
            </>
          )}
        </div>
        <div className="relative">
          {renderCursors()}

          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="border border-gray-400 bg-white rounded-md shadow"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />

          {textPosition && (
            <input
              autoFocus
              className="absolute border p-1 bg-white text-black"
              style={{
                left: textPosition.x,
                top: textPosition.y,
                transform: "translateY(-100%)",
                fontSize: fontSize,
                fontFamily: fontFamily,
              }}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  placeText();
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// import { useEffect, useRef, useState, useCallback } from "react";
// import io from "socket.io-client";
// import HeaderRaw from "./HeaderRaw";

// interface DrawData {
//   x0: number;
//   y0: number;
//   x1: number;
//   y1: number;
//   color: string;
//   size: number;
// }

// export default function CanvasBoard({ roomId }: { roomId: string }) {
//   const canvasRef = useRef<HTMLCanvasElement | null>(null);
//   const socketRef = useRef<ReturnType<typeof io> | null>(null);

//   const [isDrawing, setIsDrawing] = useState(false);
//   const [prevPos, setPrevPos] = useState<{ x: number; y: number } | null>(null);

//   const [tool, setTool] = useState<"pen" | "eraser">("pen");
//   const [color, setColor] = useState("#000000");
//   const [size, setSize] = useState(3);

//   const drawLine = (
//     ctx: CanvasRenderingContext2D,
//     x0: number,
//     y0: number,
//     x1: number,
//     y1: number,
//     strokeColor: string,
//     size: number
//   ) => {
//     ctx.beginPath();
//     ctx.moveTo(x0, y0);
//     ctx.lineTo(x1, y1);
//     ctx.lineCap = "round";

//     if (strokeColor === "__eraser__") {
//       ctx.globalCompositeOperation = "destination-out";
//       ctx.strokeStyle = "rgba(0,0,0,1)";
//       ctx.lineWidth = size * 4;
//     } else {
//       ctx.globalCompositeOperation = "source-over";
//       ctx.strokeStyle = strokeColor;
//       ctx.lineWidth = size;
//     }

//     ctx.stroke();
//     ctx.closePath();
//   };

//   const drawHandler = useCallback(
//     ({ x0, y0, x1, y1, color, size }: DrawData) => {
//       const canvas = canvasRef.current;
//       if (!canvas) return;
//       const ctx = canvas.getContext("2d");
//       if (!ctx) return;

//       drawLine(ctx, x0, y0, x1, y1, color, size);
//     },
//     []
//   );

//   const clearCanvas = useCallback(() => {
//     const canvas = canvasRef.current;
//     if (!canvas) return;
//     canvas
//       .getContext("2d")
//       ?.clearRect(0, 0, canvas.width, canvas.height);
//   }, []);

//   useEffect(() => {
//     if (!socketRef.current) {
//       socketRef.current = io("https://multiplayer-drawing-app.onrender.com");
//     }

//     const socket = socketRef.current;

//     socket.emit("join-room", roomId);

//     socket.on("draw", drawHandler);

//     socket.on("init-board", (history: DrawData[]) => {
//       const canvas = canvasRef.current;
//       if (!canvas) return;
//       const ctx = canvas.getContext("2d");
//       if (!ctx) return;

//       history.forEach((stroke) => drawHandler(stroke));
//     });

//     socket.on("board-cleared", () => {
//       clearCanvas();
//     });

//     return () => {
//       socket.off("draw", drawHandler);
//       socket.off("init-board");
//       socket.off("board-cleared");
//     };
//   }, [roomId, drawHandler, clearCanvas]);

//   const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
//     setIsDrawing(true);
//     const rect = canvasRef.current!.getBoundingClientRect();
//     setPrevPos({
//       x: e.clientX - rect.left,
//       y: e.clientY - rect.top,
//     });
//   };

//   const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
//     if (!isDrawing || !prevPos) return;

//     const canvas = canvasRef.current!;
//     const ctx = canvas.getContext("2d")!;
//     const rect = canvas.getBoundingClientRect();

//     const x = e.clientX - rect.left;
//     const y = e.clientY - rect.top;

//     const strokeColor = tool === "eraser" ? "__eraser__" : color;

//     drawLine(ctx, prevPos.x, prevPos.y, x, y, strokeColor, size);

//     socketRef.current?.emit("draw", {
//       roomId,
//       x0: prevPos.x,
//       y0: prevPos.y,
//       x1: x,
//       y1: y,
//       color: strokeColor,
//       size,
//     });

//     setPrevPos({ x, y });
//   };

//   const handleMouseUp = () => {
//     setIsDrawing(false);
//     setPrevPos(null);
//   };

//   return (
//     <div>
//       <HeaderRaw />

//       <div className="flex flex-col items-center space-y-4 mt-8">
//         <div className="flex space-x-2">
//           <button
//             onClick={() => setTool("pen")}
//             className={`px-4 py-2 rounded ${
//               tool === "pen" ? "bg-blue-500 text-white" : "bg-gray-300"
//             }`}
//           >
//             Pen
//           </button>

//           <button
//             onClick={() => setTool("eraser")}
//             className={`px-4 py-2 rounded ${
//               tool === "eraser" ? "bg-blue-500 text-white" : "bg-gray-300"
//             }`}
//           >
//             Eraser
//           </button>

//           <button
//             onClick={() => {
//               clearCanvas();
//               socketRef.current?.emit("clear-room", roomId);
//             }}
//             className="px-4 py-2 bg-red-500 text-white rounded"
//           >
//             Clear Board
//           </button>
//         </div>

//         <div className="flex space-x-3 items-center">
//           <input
//             type="color"
//             disabled={tool === "eraser"}
//             value={color}
//             onChange={(e) => setColor(e.target.value)}
//             placeholder="eraser"
//           />

//           <input
//             type="range"
//             min="1"
//             max="10"
//             value={size}
//             onChange={(e) => setSize(Number(e.target.value))}
//             placeholder="size"
//           />
//         </div>

//         <canvas
//           ref={canvasRef}
//           width={800}
//           height={600}
//           className="border border-gray-400 bg-white rounded-md shadow"
//           onMouseDown={handleMouseDown}
//           onMouseMove={handleMouseMove}
//           onMouseUp={handleMouseUp}
//         />
//       </div>
//     </div>
//   );
// }
