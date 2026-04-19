package collector

import (
	"os"
	"runtime"
	"testing"
)

func TestCPUPercent(t *testing.T) {
	PrimeCPU()
	pct := CPUPercent()
	if pct < 0 || pct > 100 {
		t.Errorf("CPUPercent() = %f, want 0-100", pct)
	}
}

func TestDiskUsage(t *testing.T) {
	total, free := DiskUsage()
	if total == 0 {
		t.Error("DiskUsage total = 0")
	}
	if free > total {
		t.Errorf("DiskUsage free (%d) > total (%d)", free, total)
	}
}

func TestMemInfo(t *testing.T) {
	total, free := memInfo()
	if total == 0 {
		t.Error("memInfo total = 0")
	}
	if free > total {
		t.Errorf("memInfo free (%d) > total (%d)", free, total)
	}
}

func TestUptime(t *testing.T) {
	u := uptime()
	if u <= 0 {
		t.Errorf("uptime() = %f, want > 0", u)
	}
}

func TestLoadAvg(t *testing.T) {
	l1, l5, l15 := loadAvg()
	if l1 < 0 || l5 < 0 || l15 < 0 {
		t.Errorf("loadAvg negative: %f %f %f", l1, l5, l15)
	}
}

func TestCollect(t *testing.T) {
	PrimeCPU()
	PrimeNetwork()

	m := Collect("test-server")
	if m.ServerID != "test-server" {
		t.Errorf("ServerID = %q, want test-server", m.ServerID)
	}
	if m.TotalMem == 0 {
		t.Error("TotalMem = 0")
	}
	if m.CPUCount != runtime.NumCPU() {
		t.Errorf("CPUCount = %d, want %d", m.CPUCount, runtime.NumCPU())
	}
	if m.Platform != runtime.GOOS {
		t.Errorf("Platform = %q, want %q", m.Platform, runtime.GOOS)
	}
	h, _ := os.Hostname()
	if m.Hostname != h {
		t.Errorf("Hostname = %q, want %q", m.Hostname, h)
	}
	if m.Timestamp == 0 {
		t.Error("Timestamp = 0")
	}
}

func TestNetworkDelta(t *testing.T) {
	PrimeNetwork()
	rx, tx := NetworkDelta()
	// On macOS, network stats aren't available via /proc, so they'll be 0
	if runtime.GOOS == "linux" {
		// Just verify no negative values
		if rx < 0 || tx < 0 {
			t.Errorf("NetworkDelta negative: rx=%f tx=%f", rx, tx)
		}
	} else {
		if rx != 0 || tx != 0 {
			// Unexpected but not necessarily wrong
			t.Logf("Non-zero network on %s: rx=%f tx=%f", runtime.GOOS, rx, tx)
		}
	}
}
