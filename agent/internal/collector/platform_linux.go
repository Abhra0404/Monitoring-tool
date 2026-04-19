package collector

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"syscall"
)

// memInfo returns total and free memory in bytes.
func memInfo() (total, free uint64) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	var memAvailable uint64
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		val, _ := strconv.ParseUint(parts[1], 10, 64)
		val *= 1024 // kB to bytes
		switch parts[0] {
		case "MemTotal:":
			total = val
		case "MemAvailable:":
			memAvailable = val
		case "MemFree:":
			free = val
		}
	}
	// Prefer MemAvailable if present (accounts for caches/buffers)
	if memAvailable > 0 {
		free = memAvailable
	}
	return
}

// uptime returns system uptime in seconds.
func uptime() float64 {
	var info syscall.Sysinfo_t
	if err := syscall.Sysinfo(&info); err != nil {
		return 0
	}
	return float64(info.Uptime)
}

// loadAvg returns 1, 5, and 15 minute load averages.
func loadAvg() (l1, l5, l15 float64) {
	data, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0, 0, 0
	}
	fields := strings.Fields(string(data))
	if len(fields) < 3 {
		return 0, 0, 0
	}
	l1, _ = strconv.ParseFloat(fields[0], 64)
	l5, _ = strconv.ParseFloat(fields[1], 64)
	l15, _ = strconv.ParseFloat(fields[2], 64)
	return
}
