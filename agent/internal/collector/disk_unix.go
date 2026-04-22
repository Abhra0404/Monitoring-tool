//go:build linux || darwin

package collector

import "syscall"

// DiskUsage returns total and free bytes for the root filesystem.
func DiskUsage() (total, free uint64) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs("/", &stat); err != nil {
		return 0, 0
	}
	total = stat.Blocks * uint64(stat.Bsize)
	free = stat.Bfree * uint64(stat.Bsize)
	return
}
