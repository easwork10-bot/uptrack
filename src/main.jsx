import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import Login from "./pages/Login";
import ManagerDashboard from "./pages/ManagerDashboard";
import EmployeePage from "./pages/EmployeePage";
import "./index.css";

const router = createBrowserRouter([
  { path: "/", element: <App /> },
  { path: "/login", element: <Login /> },
  { path: "/manager", element: <ManagerDashboard /> },
  { path: "/employee", element: <EmployeePage /> },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <RouterProvider router={router} />
);
