// sockets/index.js
const jwt = require("jsonwebtoken");
const { setupRedisAdapter } = require("../services/redis");
let io;

exports.initSocket = (server) => {
  io = require("socket.io")(server, {
    cors: { origin: "*" },
  });

  setupRedisAdapter(io);

  // Socket.IO authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id, "User:", socket.userId);

    // Join user-specific room
    socket.join(`user:${socket.userId}`);

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
};

exports.getIO = () => io;