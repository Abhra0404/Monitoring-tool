package collector

import (
	"bufio"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
)

// cpuState tracks previous CPU times for delta-based calculation.
type cpuState struct {
	mu        sync.Mutex
	prevIdle  uint64
	prevTotal uint64
	primed    bool
}

var cpu cpuState

// PrimeCPU takes an initial reading so the next call to CPUPercent returns a real delta.
func PrimeCPU() {
	if runtime.GOOS != "linux" {
		return
	}
	cpu.mu.Lock()
	defer cpu.mu.Unlock()
	idle, total, err := readProcStat()
	if err != nil {
		return
	}
	cpu.prevIdle = idle
	cpu.prevTotal = total
	cpu.primed = true
}

// CPUPercent returns overall CPU usage as a percentage (0-100).
func CPUPercent() float64 {
	if runtime.GOOS != "linux" {
		// Non-Linux (e.g. macOS): use platform-specific instant sampler.
		return cpuPercentPlatform()
	}

	cpu.mu.Lock()
	defer cpu.mu.Unlock()

	idle, total, err := readProcStat()
	if err != nil {
		return 0
	}

	if !cpu.primed {
		cpu.prevIdle = idle
		cpu.prevTotal = total
		cpu.primed = true
		return 0
	}

	idleDelta := idle - cpu.prevIdle
	totalDelta := total - cpu.prevTotal
	cpu.prevIdle = idle
	cpu.prevTotal = total

	if totalDelta == 0 {
		return 0
	}
	pct := float64(totalDelta-idleDelta) / float64(totalDelta) * 100
	if pct < 0 {
		return 0
	}
	if pct > 100 {
		return 100
	}
	return pct
}

func readProcStat() (idle, total uint64, err error) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			return 0, 0, fmt.Errorf("unexpected /proc/stat format")
		}
		// fields: cpu user nice system idle iowait irq softirq steal guest guest_nice
		var vals [10]uint64
		for i := 1; i < len(fields) && i <= 10; i++ {
			v, _ := strconv.ParseUint(fields[i], 10, 64)
			vals[i-1] = v
		}
		for _, v := range vals {
			total += v
		}
		idle = vals[3] // idle is the 4th value (index 3)
		if len(fields) > 5 {
			idle += vals[4] // iowait
		}
		return idle, total, nil
	}
	return 0, 0, fmt.Errorf("/proc/stat: cpu line not found")
}
