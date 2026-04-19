package collector

import (
	"os"
	"runtime"
	"time"
)

// Metrics is the payload sent to the Theoria server.
type Metrics struct {
	ServerID  string      `json:"serverId"`
	CPU       float64     `json:"cpu"`
	TotalMem  uint64      `json:"totalMem"`
	FreeMem   uint64      `json:"freeMem"`
	Uptime    float64     `json:"uptime"`
	LoadAvg1  float64     `json:"loadAvg1"`
	LoadAvg5  float64     `json:"loadAvg5"`
	LoadAvg15 float64     `json:"loadAvg15"`
	DiskTotal uint64      `json:"diskTotal"`
	DiskFree  uint64      `json:"diskFree"`
	NetworkRx float64     `json:"networkRx"`
	NetworkTx float64     `json:"networkTx"`
	CPUCount  int         `json:"cpuCount"`
	Platform  string      `json:"platform"`
	Arch      string      `json:"arch"`
	Hostname  string      `json:"hostname"`
	Timestamp int64       `json:"timestamp"`
	Containers []Container `json:"containers,omitempty"`
}

// Collect gathers all system metrics.
func Collect(serverID string) Metrics {
	hostname, _ := os.Hostname()
	cpuPct := CPUPercent()

	var memTotal, memFree uint64
	memTotal, memFree = memInfo()

	diskTotal, diskFree := DiskUsage()
	rxPerSec, txPerSec := NetworkDelta()
	l1, l5, l15 := loadAvg()

	return Metrics{
		ServerID:  serverID,
		CPU:       cpuPct,
		TotalMem:  memTotal,
		FreeMem:   memFree,
		Uptime:    uptime(),
		LoadAvg1:  l1,
		LoadAvg5:  l5,
		LoadAvg15: l15,
		DiskTotal: diskTotal,
		DiskFree:  diskFree,
		NetworkRx: rxPerSec,
		NetworkTx: txPerSec,
		CPUCount:  runtime.NumCPU(),
		Platform:  runtime.GOOS,
		Arch:      runtime.GOARCH,
		Hostname:  hostname,
		Timestamp: time.Now().UnixMilli(),
	}
}
