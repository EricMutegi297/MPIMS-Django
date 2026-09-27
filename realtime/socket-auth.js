const axios = require("axios");

function createSocketAuthenticator({
  djangoApiUrl = process.env.DJANGO_API_URL,
  httpClient = axios,
} = {}) {
  if (!djangoApiUrl) {
    throw new Error("DJANGO_API_URL must be configured for Socket.IO authentication.");
  }

  const meUrl = `${djangoApiUrl.replace(/\/+$/, "")}/api/auth/me/`;

  async function validateToken(token) {
    const response = await httpClient.get(meUrl, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
    });
    const profile = response.data;
    const userId = normalizeId(profile?.id);
    if (!userId || typeof profile?.role !== "string") {
      throw new Error("Django authentication response did not include a valid user profile.");
    }
    return {
      userId,
      battalionId: normalizeId(profile.battalion),
      role: profile.role,
      battalionType: profile.battalion_type,
      isSuperuser: profile.is_superuser === true,
    };
  }

  function authenticateSocket(socket, next) {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token.trim()) {
      next(new Error("Authentication required."));
      return;
    }

    validateToken(token.trim())
      .then((profile) => {
        socket.data.authenticatedProfile = profile;
        socket.data.accessToken = token.trim();
        next();
      })
      .catch(() => {
        next(new Error("Authentication failed."));
      });
  }

  return { authenticateSocket, validateToken };
}

function normalizeId(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? String(parsed) : null;
  }
  return null;
}

function authenticatedRooms(profile) {
  const rooms = [`user_${profile.userId}`];
  if (profile.isSuperuser) {
    rooms.push("role_superadmin");
  } else if (profile.role === "corps_cmd") {
    rooms.push("role_corps_cmd");
  } else if (
    ["admin", "mpc_hqs"].includes(profile.role)
    && profile.battalionId
    && profile.battalionType === "hqs"
  ) {
    rooms.push("role_hqs_admin");
  } else if (profile.battalionId) {
    rooms.push(`battalion_${profile.battalionId}`);
  }
  return rooms;
}

function incidentRooms(payload) {
  const battalionId = normalizeId(payload?.battalion_id);
  if (!battalionId) return [];
  return [
    `battalion_${battalionId}`,
    "role_superadmin",
    "role_corps_cmd",
    "role_hqs_admin",
  ];
}

function emitIncidentUpdate(io, payload, logger = console) {
  const rooms = incidentRooms(payload);
  if (rooms.length === 0) {
    logger.warn("[incident] ignored event without a valid battalion_id");
    return false;
  }
  io.to(rooms).emit("incident_update", payload);
  return true;
}

module.exports = {
  authenticatedRooms,
  createSocketAuthenticator,
  emitIncidentUpdate,
  incidentRooms,
};
