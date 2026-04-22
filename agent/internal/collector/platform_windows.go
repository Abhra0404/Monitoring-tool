//go:build windows

package collector

import (
	"syscall"
	"unsafe"
)

// memInfo returns total and available physical memory in bytes on Windows via
// the GlobalMemoryStatusEx Win32 API.
func memInfo() (total, free uint64) {
	type memoryStatusEx struct {
		dwLength                uint32
		dwMemoryLoad            uint32
		ullTotalPhys            uint64
		ullAvailPhys            uint64
		ullTotalPageFile        uint64
		ullAvailPageFile        uint64
		ullTotalVirtual         uint64
		ullAvailVirtual         uint64
		ullAvailExtendedVirtual uint64
	}
	var m memoryStatusEx
	m.dwLength = uint32(unsafe.Sizeof(m))

	mod := syscall.NewLazyDLL("kernel32.dll")
	proc := mod.NewProc("GlobalMemoryStatusEx")
	ret, _, _ := proc.Call(uintptr(unsafe.Pointer(&m)))
	if ret == 0 {
		return 0, 0
	}
	return m.ullTotalPhys, m.ullAvailPhys
}

// loadAvg has no Win32 equivalent — return zeros so JSON always includes the
// field with a deterministic value.
func loadAvg() (l1, l5, l15 float64) { return 0, 0, 0 }

// uptime returns system uptime in seconds via GetTickCount64.
func uptime() float64 {
	mod := syscall.NewLazyDLL("kernel32.dll")
	proc := mod.NewProc("GetTickCount64")
	ms, _, _ := proc.Call()
	return float64(ms) / 1000.0
}
