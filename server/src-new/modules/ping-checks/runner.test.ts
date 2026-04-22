import { describe, expect, it } from "vitest";
import { parsePingOutput } from "./runner.js";

describe("parsePingOutput", () => {
  it("parses Linux ping output", () => {
    const out = `PING example.com (93.184.216.34) 56(84) bytes of data.
64 bytes from 93.184.216.34: icmp_seq=1 ttl=56 time=11.2 ms
64 bytes from 93.184.216.34: icmp_seq=2 ttl=56 time=11.0 ms
64 bytes from 93.184.216.34: icmp_seq=3 ttl=56 time=10.8 ms

--- example.com ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2003ms
rtt min/avg/max/mdev = 10.812/11.015/11.241/0.175 ms`;
    const res = parsePingOutput(out);
    expect(res).not.toBeNull();
    expect(res!.avgMs).toBeCloseTo(11.015, 2);
    expect(res!.packetLoss).toBe(0);
  });

  it("parses macOS ping output", () => {
    const out = `PING example.com (93.184.216.34): 56 data bytes
64 bytes from 93.184.216.34: icmp_seq=0 ttl=56 time=11.239 ms

--- example.com ping statistics ---
3 packets transmitted, 3 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 10.812/11.015/11.241/0.175 ms`;
    const res = parsePingOutput(out);
    expect(res).not.toBeNull();
    expect(res!.avgMs).toBeCloseTo(11.015, 2);
    expect(res!.packetLoss).toBe(0);
  });

  it("parses Windows ping output", () => {
    const out = `Pinging example.com [93.184.216.34] with 32 bytes of data:
Reply from 93.184.216.34: bytes=32 time=12ms TTL=56

Ping statistics for 93.184.216.34:
    Packets: Sent = 3, Received = 3, Lost = 0 (0% loss),
Approximate round trip times in milli-seconds:
    Minimum = 11ms, Maximum = 14ms, Average = 12ms`;
    const res = parsePingOutput(out);
    expect(res).not.toBeNull();
    expect(res!.avgMs).toBe(12);
    expect(res!.packetLoss).toBe(0);
  });

  it("reports 100% loss when host unreachable", () => {
    const out = `--- 192.0.2.1 ping statistics ---
3 packets transmitted, 0 received, 100% packet loss, time 2050ms`;
    // Without avg line (no replies), should not parse as success.
    expect(parsePingOutput(out)).toBeNull();
  });

  it("returns null on garbage input", () => {
    expect(parsePingOutput("not a ping")).toBeNull();
  });
});
