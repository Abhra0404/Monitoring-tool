//go:build darwin

package collector

import (
	"os/exec"
	"strconv"
	"strings"
)

// cpuPercentPlatform returns the current CPU usage percentage on macOS by
// invoking `top -l 1 -n 0 -s 0` and parsing its "CPU usage:" summary line.
// Falls back to 0 on any parse error.
func cpuPercentPlatform() float64 {
	out, err := exec.Command("top", "-l", "1", "-n", "0", "-s", "0").Output()
	if err != nil {
		return 0
	}
	// Expected line: "CPU usage: 12.50% user, 6.25% sys, 81.25% idle"
	for _, line := range strings.Split(string(out), "\n") {
		if !strings.HasPrefix(line, "CPU usage:") {
			continue
		}
		user := extractPct(line, "user")
		sys := extractPct(line, "sys")
		pct := user + sys
		if pct < 0 {
			return 0
		}
		if pct > 100 {
			return 100
		}
		return pct
	}
	return 0
}

func extractPct(line, label string) float64 {
	idx := strings.Index(line, "% "+label)
	if idx < 0 {
		return 0
	}
	// Walk backwards to find the start of the number
	start := idx
	for start > 0 {
		c := line[start-1]
		if (c >= '0' && c <= '9') || c == '.' {
			start--
		} else {
			break
		}
	}
	v, err := strconv.ParseFloat(line[start:idx], 64)
	if err != nil {
		return 0
	}
	return v
}
