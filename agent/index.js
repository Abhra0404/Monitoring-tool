const os = require("os");
const axios = require("axios");

function getMetrics() {
  return {
    cpu: os.loadavg()[0],
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    uptime: os.uptime(),
    time: Date.now(),
  };
}

setInterval(async () => {
  try {
    await axios.post("http://localhost:5000/metrics", getMetrics());
    console.log("Sent metrics");
  } catch (err) {
    console.error("Error:", err.message);
  }
}, 2000);