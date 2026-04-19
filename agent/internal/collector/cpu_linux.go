//go:build linux

package collector

// cpuPercentPlatform is unused on Linux (the delta-based /proc/stat reader handles it).
func cpuPercentPlatform() float64 { return 0 }
