package collector

import (
	"bufio"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// netState tracks previous readings for delta-based network I/O.
type netState struct {
	mu     sync.Mutex
	prevRx uint64
	prevTx uint64
	prevTs time.Time
	primed bool
}

var netSt netState

// PrimeNetwork takes an initial network reading.
func PrimeNetwork() {
	netSt.mu.Lock()
	defer netSt.mu.Unlock()
	rx, tx, err := readNetBytes()
	if err != nil {
		return
	}
	netSt.prevRx = rx
	netSt.prevTx = tx
	netSt.prevTs = time.Now()
	netSt.primed = true
}

// NetworkDelta returns rx and tx bytes per second since the last call.
func NetworkDelta() (rxPerSec, txPerSec float64) {
	netSt.mu.Lock()
	defer netSt.mu.Unlock()

	rx, tx, err := readNetBytes()
	if err != nil || !netSt.primed {
		if err == nil {
			netSt.prevRx = rx
			netSt.prevTx = tx
			netSt.prevTs = time.Now()
			netSt.primed = true
		}
		return 0, 0
	}

	now := time.Now()
	elapsed := now.Sub(netSt.prevTs).Seconds()
	if elapsed <= 0 {
		return 0, 0
	}

	rxPerSec = float64(rx-netSt.prevRx) / elapsed
	txPerSec = float64(tx-netSt.prevTx) / elapsed

	netSt.prevRx = rx
	netSt.prevTx = tx
	netSt.prevTs = now
	return
}

// readNetBytes reads total rx/tx bytes from /proc/net/dev (Linux only).
// macOS and Windows return an error so NetworkDelta reports 0.
func readNetBytes() (rx, tx uint64, err error) {
	if runtime.GOOS != "linux" {
		return 0, 0, fmt.Errorf("network stats not available on %s", runtime.GOOS)
	}

	f, err := os.Open("/proc/net/dev")
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		if lineNum <= 2 {
			continue // skip headers
		}
		line := strings.TrimSpace(scanner.Text())
		parts := strings.Fields(line)
		if len(parts) < 10 {
			continue
		}
		iface := strings.TrimSuffix(parts[0], ":")
		if iface == "lo" {
			continue
		}
		r, _ := strconv.ParseUint(parts[1], 10, 64)
		t, _ := strconv.ParseUint(parts[9], 10, 64)
		rx += r
		tx += t
	}
	return rx, tx, nil
}
