const http = require("http");
const https = require("https");
const { URL } = require("url");
const { HttpChecks } = require("../store");
const { evaluateAlerts } = require("./alertEngine");
const { dispatchAlert } = require("./notifier");

const MAX_RESULTS = 100;
const REQUEST_TIMEOUT = 10000;

// Map<checkId, intervalHandle>
const intervals = new Map();

function startAll() {
  const checks = HttpChecks.findActive();
  for (const check of checks) {
    scheduleCheck(check);
  }
  if (checks.length > 0) {
    console.log(`HTTP check runner: scheduled ${checks.length} active checks`);
  }
}

function scheduleCheck(check) {
  if (intervals.has(check._id)) return;
  // Run immediately, then on interval
  runCheck(check);
  const handle = setInterval(() => runCheck(check), check.interval || 60000);
  intervals.set(check._id, handle);
}

function unscheduleCheck(checkId) {
  const handle = intervals.get(checkId);
  if (handle) {
    clearInterval(handle);
    intervals.delete(checkId);
  }
}

function rescheduleCheck(check) {
  unscheduleCheck(check._id);
  if (check.isActive) {
    scheduleCheck(check);
  }
}

async function runCheck(check) {
  // Re-read from store to get latest state
  const current = HttpChecks.findById(check._id);
  if (!current || !current.isActive) {
    unscheduleCheck(check._id);
    return;
  }

  let statusCode = null;
  let responseTime = 0;
  let sslDaysRemaining = null;
  let error = null;
  let status = "down";

  try {
    const result = await makeRequest(current.url);
    statusCode = result.statusCode;
    responseTime = result.responseTime;
    sslDaysRemaining = result.sslDaysRemaining;
    status = statusCode === (current.expectedStatus || 200) ? "up" : "down";
  } catch (err) {
    error = err.message || "Request failed";
    status = "down";
  }

  // Build result entry
  const resultEntry = {
    timestamp: Date.now(),
    statusCode,
    responseTime,
    status,
    sslDaysRemaining,
    error,
  };

  // Update check in store
  const results = [...(current.results || []), resultEntry].slice(-MAX_RESULTS);
  const upCount = results.filter((r) => r.status === "up").length;
  const uptimePercent = results.length > 0
    ? Math.round((upCount / results.length) * 1000) / 10
    : 100;

  HttpChecks.update(current._id, {
    status,
    lastCheckedAt: new Date().toISOString(),
    lastResponseTime: responseTime,
    lastStatusCode: statusCode,
    sslExpiry: sslDaysRemaining,
    uptimePercent,
    results,
  });

  // Emit via Socket.IO
  if (global.io) {
    global.io.to("all").emit("httpcheck:result", {
      checkId: current._id,
      name: current.name,
      url: current.url,
      status,
      statusCode,
      responseTime,
      sslDaysRemaining,
      uptimePercent,
      error,
      timestamp: resultEntry.timestamp,
    });
  }

  // Feed synthetic metric into alert engine
  const metricsMap = {
    httpcheck_status: {
      value: status === "up" ? 1 : 0,
      labels: { url: current.url, name: current.name },
    },
  };

  try {
    const firedAlerts = await evaluateAlerts(current.userId, metricsMap);
    if (global.io) {
      for (const alert of firedAlerts) {
        global.io.to("all").emit("alert:fired", alert);
        dispatchAlert(current.userId, alert, "fired").catch((err) =>
          console.error("HTTP check alert notification error:", err.message)
        );
      }
    }
  } catch (err) {
    console.error("HTTP check alert evaluation error:", err.message);
  }
}

function makeRequest(urlStr) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch {
      return reject(new Error("Invalid URL"));
    }

    const isHttps = parsed.protocol === "https:";
    const client = isHttps ? https : http;
    const startTime = Date.now();
    let sslDaysRemaining = null;

    const options = {
      timeout: REQUEST_TIMEOUT,
      rejectUnauthorized: false,
      headers: {
        "User-Agent": "Theoria/1.0",
      },
    };

    const req = client.get(parsed.href, options, (res) => {
      const responseTime = Date.now() - startTime;

      // Read SSL cert info
      if (isHttps && res.socket && res.socket.getPeerCertificate) {
        try {
          const cert = res.socket.getPeerCertificate();
          if (cert && cert.valid_to) {
            const expiryDate = new Date(cert.valid_to);
            sslDaysRemaining = Math.ceil((expiryDate - Date.now()) / 86400000);
          }
        } catch {}
      }

      // Consume the response body to free up the socket
      res.resume();
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          responseTime,
          sslDaysRemaining,
        });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    req.on("error", (err) => {
      reject(new Error(err.code === "ENOTFOUND" ? "DNS lookup failed" : err.message));
    });
  });
}

module.exports = { startAll, scheduleCheck, unscheduleCheck, rescheduleCheck };
