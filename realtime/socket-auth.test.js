const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");

const {
  authenticatedRooms,
  createSocketAuthenticator,
  emitIncidentUpdate,
  incidentRooms,
} = require("./socket-auth");

let server;
let apiUrl;
let lastAuthorization;

before(async () => {
  server = http.createServer((request, response) => {
    lastAuthorization = request.headers.authorization;
    if (lastAuthorization === "Bearer valid-access-token") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: 17,
        role: "personnel",
        battalion: 3,
        battalion_type: "mp",
        is_superuser: false,
      }));
      return;
    }
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ detail: "Authentication credentials were not provided." }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  apiUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function runAuthentication(auth) {
  const socket = {
    handshake: { auth },
    data: {},
  };
  const { authenticateSocket } = createSocketAuthenticator({ djangoApiUrl: apiUrl });
  return new Promise((resolve) => {
    authenticateSocket(socket, (error) => resolve({ error, socket }));
  });
}

test("authenticates using Django and sets the room identity from its response", async () => {
  const { error, socket } = await runAuthentication({
    token: "valid-access-token",
    userId: 999,
  });

  assert.equal(error, undefined);
  assert.equal(lastAuthorization, "Bearer valid-access-token");
  assert.deepEqual(socket.data.authenticatedProfile, {
    userId: "17",
    battalionId: "3",
    role: "personnel",
    battalionType: "mp",
    isSuperuser: false,
  });
  assert.equal(socket.data.accessToken, "valid-access-token");
});

test("rejects connections without a JWT", async () => {
  const { error } = await runAuthentication({ userId: 17 });

  assert.equal(error.message, "Authentication required.");
});

test("rejects invalid or expired JWTs", async () => {
  const { error } = await runAuthentication({ token: "invalid-access-token" });

  assert.equal(error.message, "Authentication failed.");
});

test("assigns ordinary users only to their own battalion room", () => {
  const rooms = authenticatedRooms({
    userId: "17",
    battalionId: "3",
    role: "personnel",
    battalionType: "mp",
    isSuperuser: false,
  });

  assert.deepEqual(rooms, ["user_17", "battalion_3"]);
});

test("assigns only Django-authorized global roles to global incident rooms", () => {
  assert.deepEqual(
    authenticatedRooms({
      userId: "3",
      battalionId: null,
      role: "admin",
      battalionType: null,
      isSuperuser: true,
    }),
    ["user_3", "role_superadmin"],
  );
  assert.deepEqual(
    authenticatedRooms({
      userId: "4",
      battalionId: null,
      role: "corps_cmd",
      battalionType: null,
      isSuperuser: false,
    }),
    ["user_4", "role_corps_cmd"],
  );
  assert.deepEqual(
    authenticatedRooms({
      userId: "5",
      battalionId: "2",
      role: "admin",
      battalionType: "hqs",
      isSuperuser: false,
    }),
    ["user_5", "role_hqs_admin"],
  );
});

test("routes incident updates only to their battalion and authorized global roles", () => {
  assert.deepEqual(incidentRooms({ battalion_id: 3 }), [
    "battalion_3",
    "role_superadmin",
    "role_corps_cmd",
    "role_hqs_admin",
  ]);
  assert.deepEqual(incidentRooms({ unit_id: 3 }), []);
  assert.deepEqual(incidentRooms({ battalion_id: "not-an-id" }), []);
});

test("emits incident updates to scope rooms only and drops unscoped events", () => {
  const targetedRooms = [];
  const emittedEvents = [];
  const warnings = [];
  const io = {
    to: (rooms) => {
      targetedRooms.push(rooms);
      return {
        emit: (event, payload) => emittedEvents.push({ event, payload }),
      };
    },
    emit: () => assert.fail("Incident updates must not be broadcast globally."),
  };

  assert.equal(emitIncidentUpdate(io, { battalion_id: 8 }, { warn: (message) => warnings.push(message) }), true);
  assert.equal(emitIncidentUpdate(io, { incident_number: "INC/2026/0001" }, { warn: (message) => warnings.push(message) }), false);
  assert.deepEqual(targetedRooms, [[
    "battalion_8",
    "role_superadmin",
    "role_corps_cmd",
    "role_hqs_admin",
  ]]);
  assert.deepEqual(emittedEvents, [{
    event: "incident_update",
    payload: { battalion_id: 8 },
  }]);
  assert.equal(warnings.length, 1);
});
