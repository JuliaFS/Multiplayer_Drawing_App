import { useParams } from "react-router-dom";
import CanvasBoard from "./CanvasBoard";

export default function RoomPage() {
  const { roomId } = useParams();

  return <CanvasBoard roomId={roomId!} />;
}
