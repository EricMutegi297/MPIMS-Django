/**
 * MPIMS Real-time Server
 * ----------------------
 * Uses PostgreSQL LISTEN/NOTIFY to detect new notifications/incidents
 * and pushes them via Socket.io to authenticated React clients.
 *
 * Architecture:
 *   React client  <--Socket.io-->  this server  <--LISTEN/NOTIFY-->  PostgreSQL
 *   (Django sets pg NOTIFY via triggers or signal handlers)
 */

require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Client } = require("pg");

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

// --- Express + Socket.io setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true,
  },
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// --- Socket.io: each client joins their own user room ---
io.on("connection", (socket) => {
  const userId = socket.handshake.auth?.userId;
  if (!userId) {
    socket.disconnect(true);
    return;
  }
  socket.join(`user_${userId}`);
  console.log(`[socket] user ${userId} connected (${socket.id})`);

  socket.on("disconnect", () => {
    console.log(`[socket] user ${userId} disconnected (${socket.id})`);
  });
});

// --- PostgreSQL LISTEN/NOTIFY ---
// Django (or a pg trigger) can call:
//   NOTIFY mpims_notification, '{"recipient_id": 5, "message": "...", "type": "incident"}';
//   NOTIFY mpims_incident, '{"unit_id": 3, "incident_number": "INC/2024/0001"}';

async function startPgListener() {
  const pgClient = new Client({ connectionString: process.env.DATABASE_URL });

  pgClient.on("error", (err) => {
    console.error("[pg] client error:", err.message);
  });

  try {
    await pgClient.connect();
    console.log("[pg] connected, listening on mpims_notification & mpims_incident");

    await pgClient.query("LISTEN mpims_notification");
    await pgClient.query("LISTEN mpims_incident");

    pgClient.on("notification", (msg) => {
      let payload;
      try {
        payload = JSON.parse(msg.payload);
      } catch {
        console.warn("[pg] unparseable payload:", msg.payload);
        return;
      }

      if (msg.channel === "mpims_notification" && payload.recipient_id) {
        io.to(`user_${payload.recipient_id}`).emit("notification", payload);
        console.log(`[notify] → user_${payload.recipient_id}:`, payload);
      } else if (msg.channel === "mpims_incident") {
        // Broadcast incident updates to all connected clients
        io.emit("incident_update", payload);
        console.log("[incident] broadcast:", payload);
      }
    });
  } catch (err) {
    console.error("[pg] connection failed:", err.message);
    // Retry after 5 seconds
    setTimeout(startPgListener, 5000);
  }
}

server.listen(PORT, () => {
  console.log(`[server] MPIMS realtime listening on port ${PORT}`);
  startPgListener();
});
