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
const {
  authenticatedRooms,
  createSocketAuthenticator,
  emitIncidentUpdate,
} = require("./socket-auth");

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";
const AUTH_REVALIDATION_INTERVAL_MS = Number(process.env.AUTH_REVALIDATION_INTERVAL_MS || 60000);
if (!Number.isSafeInteger(AUTH_REVALIDATION_INTERVAL_MS) || AUTH_REVALIDATION_INTERVAL_MS < 1000) {
  throw new Error("AUTH_REVALIDATION_INTERVAL_MS must be an integer of at least 1000.");
}
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// --- Express + Socket.io setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true,
  },
});
const { authenticateSocket, validateToken } = createSocketAuthenticator();

app.get("/health", (_req, res) => res.json({ status: "ok" }));

io.use(authenticateSocket);

// --- Socket.io: join only the room belonging to the authenticated account ---
io.on("connection", (socket) => {
  const { userId } = socket.data.authenticatedProfile;
  socket.join(authenticatedRooms(socket.data.authenticatedProfile));
  console.log(`[socket] user ${userId} connected (${socket.id})`);

  let revalidating = false;
  const revalidationTimer = setInterval(() => {
    if (revalidating) return;
    revalidating = true;
    validateToken(socket.data.accessToken)
      .then((profile) => {
        const currentRooms = authenticatedRooms(socket.data.authenticatedProfile);
        const refreshedRooms = authenticatedRooms(profile);
        if (JSON.stringify(currentRooms) !== JSON.stringify(refreshedRooms)) {
          console.log(`[socket] disconnecting after authorization scope changed (${socket.id})`);
          socket.disconnect(true);
          return;
        }
        socket.data.authenticatedProfile = profile;
      })
      .catch(() => {
        console.log(`[socket] disconnecting unauthenticated session (${socket.id})`);
        socket.disconnect(true);
      })
      .finally(() => {
        revalidating = false;
      });
  }, AUTH_REVALIDATION_INTERVAL_MS);

  socket.on("disconnect", () => {
    clearInterval(revalidationTimer);
    console.log(`[socket] user ${userId} disconnected (${socket.id})`);
  });
});

// --- PostgreSQL LISTEN/NOTIFY ---
// Django (or a pg trigger) can call:
//   NOTIFY mpims_notification, '{"recipient_id": 5, "message": "...", "type": "incident"}';
//   NOTIFY mpims_incident, '{"battalion_id": 1, "incident_number": "INC/2024/0001"}';

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
        if (!emitIncidentUpdate(io, payload)) return;
        console.log("[incident] scoped update:", payload);
      }
    });
  } catch (err) {
    console.error("[pg] connection failed:", err.message);
    // Retry after 5 seconds
    setTimeout(startPgListener, 5000);
  }
}

server.listen(PORT, HOST, () => {
  console.log(`[server] MPIMS realtime listening on ${HOST}:${PORT}`);
  startPgListener();
});
