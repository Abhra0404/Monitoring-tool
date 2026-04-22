//go:build windows

package collector

// cpuPercentPlatform — Windows fallback. The Win32 CPU-time API requires two
// samples separated by a real interval; wiring that in properly needs the
// same priming pattern the Linux path already uses. For now we report 0 so
// the payload still carries the field; the dashboard's alert rule treats a
// persistent zero as "unknown" and does not fire on it.
func cpuPercentPlatform() float64 { return 0 }
