package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"time"
)

// Container represents Docker container metrics matching the server schema.
type Container struct {
	ContainerID string  `json:"containerId"`
	Name        string  `json:"name"`
	Image       string  `json:"image"`
	Status      string  `json:"status"`
	State       string  `json:"state"`
	CPUPercent  float64 `json:"cpuPercent"`
	MemUsage    uint64  `json:"memUsage"`
	MemLimit    uint64  `json:"memLimit"`
	MemPercent  float64 `json:"memPercent"`
	NetRx       uint64  `json:"netRx"`
	NetTx       uint64  `json:"netTx"`
	Restarts    int     `json:"restarts"`
}

// dockerClient talks to the Docker daemon via the Unix socket.
type dockerClient struct {
	client *http.Client
}

func newDockerClient(socketPath string) *dockerClient {
	return &dockerClient{
		client: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
					return net.DialTimeout("unix", socketPath, 5*time.Second)
				},
			},
		},
	}
}

func (d *dockerClient) get(path string, out interface{}) error {
	resp, err := d.client.Get("http://localhost" + path)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("docker API %s returned %d", path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

type dockerContainer struct {
	ID    string   `json:"Id"`
	Names []string `json:"Names"`
	Image string   `json:"Image"`
	State string   `json:"State"`
	Status string  `json:"Status"`
}

type dockerStats struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     int    `json:"online_cpus"`
	} `json:"cpu_stats"`
	PrecpuStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64 `json:"usage"`
		Limit uint64 `json:"limit"`
	} `json:"memory_stats"`
	Networks map[string]struct {
		RxBytes uint64 `json:"rx_bytes"`
		TxBytes uint64 `json:"tx_bytes"`
	} `json:"networks"`
}

// CollectDocker collects metrics from all Docker containers.
func CollectDocker(socketPath string) ([]Container, error) {
	dc := newDockerClient(socketPath)

	var containers []dockerContainer
	if err := dc.get("/containers/json?all=true", &containers); err != nil {
		return nil, err
	}

	results := make([]Container, 0, len(containers))
	for _, c := range containers {
		name := ""
		if len(c.Names) > 0 {
			name = c.Names[0]
			if len(name) > 0 && name[0] == '/' {
				name = name[1:]
			}
		}

		cid := c.ID
		if len(cid) > 12 {
			cid = cid[:12]
		}

		entry := Container{
			ContainerID: cid,
			Name:        name,
			Image:       c.Image,
			Status:      c.Status,
			State:       c.State,
		}

		if c.State == "running" {
			var stats dockerStats
			if err := dc.get(fmt.Sprintf("/containers/%s/stats?stream=false", c.ID), &stats); err == nil {
				cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage - stats.PrecpuStats.CPUUsage.TotalUsage)
				sysDelta := float64(stats.CPUStats.SystemCPUUsage - stats.PrecpuStats.SystemCPUUsage)
				numCPUs := stats.CPUStats.OnlineCPUs
				if numCPUs == 0 {
					numCPUs = 1
				}
				if sysDelta > 0 && cpuDelta >= 0 {
					entry.CPUPercent = (cpuDelta / sysDelta) * float64(numCPUs) * 100
					// Round to 2 decimal places
					entry.CPUPercent = float64(int(entry.CPUPercent*100)) / 100
				}

				entry.MemUsage = stats.MemoryStats.Usage
				entry.MemLimit = stats.MemoryStats.Limit
				if entry.MemLimit > 0 {
					entry.MemPercent = float64(int(float64(entry.MemUsage)/float64(entry.MemLimit)*10000)) / 100
				}

				for _, iface := range stats.Networks {
					entry.NetRx += iface.RxBytes
					entry.NetTx += iface.TxBytes
				}
			}
		}

		results = append(results, entry)
	}

	return results, nil
}
