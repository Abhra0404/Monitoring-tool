// sockets/index.js
let io;

exports.initSocket = (server) => {
  io = require("socket.io")(server, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // All clients join the global room
    socket.join("all");

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
};

exports.getIO = () => io;