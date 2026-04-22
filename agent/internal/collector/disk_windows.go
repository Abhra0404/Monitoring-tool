//go:build windows

package collector

import (
	"syscall"
	"unsafe"
)

// DiskUsage returns total and free bytes for the system drive (C:\ by
// default) via GetDiskFreeSpaceExW.
func DiskUsage() (total, free uint64) {
	root, err := syscall.UTF16PtrFromString(`C:\`)
	if err != nil {
		return 0, 0
	}
	var freeBytesAvailable, totalBytes, totalFree uint64
	mod := syscall.NewLazyDLL("kernel32.dll")
	proc := mod.NewProc("GetDiskFreeSpaceExW")
	ret, _, _ := proc.Call(
		uintptr(unsafe.Pointer(root)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&totalFree)),
	)
	if ret == 0 {
		return 0, 0
	}
	return totalBytes, totalFree
}
