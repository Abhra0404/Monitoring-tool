const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

exports.setupRedisAdapter = async (io) => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("Redis adapter disabled: REDIS_URL not configured");
    return;
  }

  try {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Redis adapter enabled for Socket.IO");
  } catch (error) {
    console.error("Failed to initialize Redis adapter:", error.message);
  }
};
