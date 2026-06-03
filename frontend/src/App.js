import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import LandingPage from "./components/LandingPage";

const Dashboard = lazy(() => import("./components/Dashboard"));

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard/*"
          element={
            <Suspense fallback={
              <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white text-sm">
                Loading...
              </div>
            }>
              <Dashboard />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
