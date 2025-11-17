// App.tsx
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import type { FutureConfig } from "react-router-dom"; // ✅ type-only import
import HomePage from "./components/HomePage";
import RoomPage from "./components/RoomPage";

// Create a type that adds v7_startTransition to FutureConfig
type MyFutureConfig = FutureConfig & {
  v7_startTransition: boolean;
};

// Define routes
const router = createBrowserRouter(
  [
    { path: "/", element: <HomePage /> },
    { path: "/room/:roomId", element: <RoomPage /> },
  ],
  {
    future: {
      v7_startTransition: true,        // added flag
      v7_relativeSplatPath: true,      // matches original FutureConfig type
    } as MyFutureConfig,
  }
);

export default function App() {
  return <RouterProvider router={router} />;
}




