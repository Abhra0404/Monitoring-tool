package collector

import (
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

// memInfo returns total and free (available) memory in bytes on macOS.
func memInfo() (total, free uint64) {
	// Total via sysctl hw.memsize
	total, _ = sysctlUint64("hw.memsize")

	// Free + inactive pages via vm_stat
	out, err := exec.Command("vm_stat").Output()
	if err != nil {
		return total, 0
	}
	pageSize := uint64(syscall.Getpagesize())
	var freePages, inactivePages uint64
	for _, line := range strings.Split(string(out), "\n") {
		if strings.HasPrefix(line, "Pages free:") {
			freePages = parseVmStatValue(line)
		} else if strings.HasPrefix(line, "Pages inactive:") {
			inactivePages = parseVmStatValue(line)
		}
	}
	free = (freePages + inactivePages) * pageSize
	return
}

func parseVmStatValue(line string) uint64 {
	parts := strings.Fields(line)
	if len(parts) < 1 {
		return 0
	}
	s := strings.TrimSuffix(parts[len(parts)-1], ".")
	v, _ := strconv.ParseUint(s, 10, 64)
	return v
}

func sysctlUint64(name string) (uint64, error) {
	out, err := exec.Command("sysctl", "-n", name).Output()
	if err != nil {
		return 0, err
	}
	return strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64)
}

// uptime returns system uptime in seconds on macOS.
func uptime() float64 {
	var tv syscall.Timeval
	mib := [2]int32{1 /* CTL_KERN */, 21 /* KERN_BOOTTIME */}
	size := unsafe.Sizeof(tv)
	_, _, errno := syscall.Syscall6(
		syscall.SYS___SYSCTL,
		uintptr(unsafe.Pointer(&mib[0])),
		2,
		uintptr(unsafe.Pointer(&tv)),
		uintptr(unsafe.Pointer(&size)),
		0, 0,
	)
	if errno != 0 {
		return 0
	}
	bootTime := time.Unix(tv.Sec, int64(tv.Usec)*1000)
	return time.Since(bootTime).Seconds()
}

// loadAvg returns 1, 5, and 15 minute load averages on macOS.
func loadAvg() (l1, l5, l15 float64) {
	out, err := exec.Command("sysctl", "-n", "vm.loadavg").Output()
	if err != nil {
		return 0, 0, 0
	}
	s := strings.TrimSpace(string(out))
	s = strings.Trim(s, "{ }")
	fields := strings.Fields(s)
	if len(fields) < 3 {
		return 0, 0, 0
	}
	l1, _ = strconv.ParseFloat(fields[0], 64)
	l5, _ = strconv.ParseFloat(fields[1], 64)
	l15, _ = strconv.ParseFloat(fields[2], 64)
	return
}
