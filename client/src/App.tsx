// App.tsx
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import HomePage from "./components/HomePage";
import RoomPage from "./components/RoomPage";

// Define routes
const router = createBrowserRouter(
  [
    { path: "/", element: <HomePage /> },
    { path: "/room/:roomId", element: <RoomPage /> },
  ]
);

export default function App() {
  return <RouterProvider router={router} />;
}




