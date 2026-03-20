const os = require("os");
const axios = require("axios");
require("dotenv").config();

const SERVER_ID = process.env.SERVER_ID || os.hostname();
const API_URL = process.env.API_URL || "http://localhost:5000";
const API_KEY = process.env.API_KEY;

console.log(`Agent starting for server: ${SERVER_ID}`);
console.log(`Sending metrics to: ${API_URL}`);

if (!API_KEY) {
  console.error("ERROR: API_KEY not found in .env file");
  console.error("Please add your API key to the .env file:");
  console.error("API_KEY=your-api-key-here");
  process.exit(1);
}

function collectMetrics() {
  return {
    serverId: SERVER_ID,
    cpu: os.loadavg()[0],
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    uptime: os.uptime(),
    time: new Date().toLocaleTimeString(),
    timestamp: Date.now(),
  };
}

setInterval(async () => {
  try {
    const metrics = collectMetrics();
    await axios.post(`${API_URL}/metrics`, metrics, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });
    console.log(
      `Metrics sent - CPU: ${metrics.cpu.toFixed(2)}, Memory: ${(
        ((metrics.totalMem - metrics.freeMem) / metrics.totalMem) *
        100
      ).toFixed(1)}%`
    );
  } catch (err) {
    console.error("Agent error:", err.response?.data || err.message);
  }
}, 2000);