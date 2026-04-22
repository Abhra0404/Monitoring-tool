package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/theoria/agent/internal/collector"
)

// Build-time metadata (populated via -ldflags -X main.version=...).
var (
	version   = "dev"
	commit    = "unknown"
	buildDate = "unknown"
)

func main() {
	// CLI flags
	url := flag.String("url", envOr("API_URL", "http://localhost:4000"), "Theoria server URL")
	key := flag.String("key", os.Getenv("API_KEY"), "API key for authentication")
	id := flag.String("id", envOr("SERVER_ID", hostname()), "Server identifier")
	interval := flag.Duration("interval", envDuration("INTERVAL_MS", 5*time.Second), "Collection interval")
	docker := flag.Bool("docker", envBool("DOCKER"), "Enable Docker container monitoring")
	dockerSocket := flag.String("docker-socket", envOr("DOCKER_SOCKET", "/var/run/docker.sock"), "Docker socket path")
	showVersion := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("theoria-agent %s (commit %s, built %s)\n", version, commit, buildDate)
		return
	}

	if *key == "" {
		fmt.Fprintln(os.Stderr, "ERROR: API key not provided")
		fmt.Fprintln(os.Stderr, "  theoria-agent --url http://server:4000 --key <your-key>")
		fmt.Fprintln(os.Stderr, "  or set API_KEY environment variable")
		os.Exit(1)
	}

	log.Printf("theoria-agent %s starting for server: %s", version, *id)
	log.Printf("Sending metrics to: %s", *url)
	log.Printf("Collection interval: %s", *interval)
	if *docker {
		log.Printf("Docker monitoring: enabled (%s)", *dockerSocket)
	}

	// Prime CPU and network delta calculations
	collector.PrimeCPU()
	collector.PrimeNetwork()
	time.Sleep(time.Second)

	log.Println("Agent started. Collecting metrics...")

	client := &http.Client{Timeout: 5 * time.Second}
	endpoint := *url + "/metrics"

	// Graceful shutdown
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(*interval)
	defer ticker.Stop()

	var consecutiveErrors int
	var nextSendAt time.Time
	const maxBackoffSec = 1800 // 30 minutes
	const maxErrorCount = 20   // caps 2^n calculation to prevent overflow

	sendMetrics := func() {
		// Respect backoff: skip this tick if we're still cooling down after a failure.
		if !nextSendAt.IsZero() && time.Now().Before(nextSendAt) {
			return
		}

		metrics := collector.Collect(*id)

		if *docker {
			containers, err := collector.CollectDocker(*dockerSocket)
			if err == nil && len(containers) > 0 {
				metrics.Containers = containers
			}
		}

		body, err := json.Marshal(metrics)
		if err != nil {
			log.Printf("Marshal error: %v", err)
			return
		}

		req, err := http.NewRequest("POST", endpoint, bytes.NewReader(body))
		if err != nil {
			log.Printf("Request error: %v", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+*key)

		computeBackoff := func() time.Duration {
			n := consecutiveErrors
			if n > maxErrorCount {
				n = maxErrorCount
			}
			secs := float64(*interval/time.Second) * math.Pow(2, float64(n))
			if secs > maxBackoffSec {
				secs = maxBackoffSec
			}
			return time.Duration(secs) * time.Second
		}

		resp, err := client.Do(req)
		if err != nil {
			consecutiveErrors++
			backoff := computeBackoff()
			nextSendAt = time.Now().Add(backoff)
			log.Printf("Send failed (attempt %d): %v — next try in %s", consecutiveErrors, err, backoff)
			return
		}
		resp.Body.Close()

		if resp.StatusCode != 200 {
			consecutiveErrors++
			backoff := computeBackoff()
			nextSendAt = time.Now().Add(backoff)
			log.Printf("Server returned %d (attempt %d) — next try in %s", resp.StatusCode, consecutiveErrors, backoff)
			return
		}

		consecutiveErrors = 0
		nextSendAt = time.Time{}
		memPct := float64(metrics.TotalMem-metrics.FreeMem) / float64(metrics.TotalMem) * 100
		diskPct := 0.0
		if metrics.DiskTotal > 0 {
			diskPct = float64(metrics.DiskTotal-metrics.DiskFree) / float64(metrics.DiskTotal) * 100
		}
		log.Printf("CPU: %.1f%% | Mem: %.1f%% | Disk: %.1f%% | Net: ↓%s/s ↑%s/s",
			metrics.CPU, memPct, diskPct,
			formatBytes(metrics.NetworkRx), formatBytes(metrics.NetworkTx))
	}

	// First collection
	sendMetrics()

	for {
		select {
		case <-ticker.C:
			sendMetrics()
		case s := <-sig:
			log.Printf("Received %v, shutting down", s)
			return
		}
	}
}

func formatBytes(b float64) string {
	switch {
	case b < 1024:
		return fmt.Sprintf("%.0fB", b)
	case b < 1048576:
		return fmt.Sprintf("%.1fKB", b/1024)
	default:
		return fmt.Sprintf("%.1fMB", b/1048576)
	}
}

func hostname() string {
	h, _ := os.Hostname()
	return h
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	ms, err := time.ParseDuration(v + "ms")
	if err != nil {
		return fallback
	}
	return ms
}

func envBool(key string) bool {
	return os.Getenv(key) == "true"
}
