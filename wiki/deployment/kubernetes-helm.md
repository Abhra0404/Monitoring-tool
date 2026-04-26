# Kubernetes (Helm)

Theoria ships an opinionated Helm chart at [`charts/theoria/`](../../charts/theoria) targeting production: 2 replicas by default, anti-affinity, hardened security context, ServiceMonitor for Prometheus Operator, and HPA support.

## Prerequisites

- Kubernetes 1.27+
- A PostgreSQL/TimescaleDB instance reachable from the cluster
- A Redis instance reachable from the cluster (required for multi-replica)
- An ingress controller and TLS certificate provisioner (cert-manager recommended)

## Install

```bash
helm install theoria ./charts/theoria \
  --namespace theoria --create-namespace \
  --set image.tag=v1.0.0 \
  --set ingress.host=monitor.example.com \
  --set database.dsnSecretRef.name=postgres-dsn \
  --set redis.urlSecretRef.name=redis-url \
  --set auth.existingSecret=theoria-auth
```

Where `theoria-auth` contains key `jwtSecret` and `postgres-dsn` contains key `dsn`, etc.

## Values reference

```yaml
image:
  repository: ghcr.io/theoria-monitoring/theoria
  tag: ""                # defaults to chart appVersion
  pullPolicy: IfNotPresent

replicaCount: 2

resources:
  requests: { cpu: 200m, memory: 256Mi }
  limits:   { cpu: "1",  memory: 1Gi   }

autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 6
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

podDisruptionBudget:
  enabled: true
  minAvailable: 1

affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          topologyKey: kubernetes.io/hostname
          labelSelector:
            matchLabels: { app.kubernetes.io/name: theoria }

securityContext:
  runAsUser: 1001
  runAsGroup: 1001
  runAsNonRoot: true
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities: { drop: ["ALL"] }

database:
  # Either set `dsn:` directly (not recommended) or reference a secret:
  dsnSecretRef:
    name: postgres-dsn
    key: dsn

redis:
  urlSecretRef:
    name: redis-url
    key: url

auth:
  existingSecret: theoria-auth     # must contain key `jwtSecret`
  # OR inline (not recommended):
  jwtSecret: ""

cors:
  origins: ["https://monitor.example.com"]

ingress:
  enabled: true
  className: nginx
  host: monitor.example.com
  tls:
    enabled: true
    secretName: theoria-tls

serviceMonitor:
  enabled: false                   # Prometheus Operator integration
  interval: 30s
  metricsToken:                    # bearer for /internal/metrics
    existingSecret: theoria-internal-metrics
    key: token

persistence:
  enabled: true
  storageClass: ""
  size: 5Gi
```

## Secrets

Create the auth secret:

```bash
kubectl create secret generic theoria-auth \
  --namespace theoria \
  --from-literal=jwtSecret="$(openssl rand -hex 32)"
```

Postgres DSN:

```bash
kubectl create secret generic postgres-dsn \
  --namespace theoria \
  --from-literal=dsn='postgres://theoria:****@postgres.db.svc:5432/theoria?sslmode=require'
```

Redis URL:

```bash
kubectl create secret generic redis-url \
  --namespace theoria \
  --from-literal=url='redis://:****@redis.db.svc:6379'
```

## Scaling

Theoria is stateless across replicas — all shared state lives in Postgres and Redis. The Socket.IO Redis adapter pins clients to whichever pod they hit and broadcasts events across pods, so no sticky sessions are required.

To enable autoscaling:

```bash
helm upgrade theoria ./charts/theoria --reuse-values \
  --set autoscaling.enabled=true \
  --set autoscaling.maxReplicas=10
```

## Pod disruption budget

The default PDB keeps at least one pod available during voluntary disruptions (node drains). Combined with `replicaCount: 2`, this gives you safe rolling node maintenance.

## Network policy

A starter NetworkPolicy template is in `charts/theoria/templates/networkpolicy.yaml` (off by default). Enable with `networkPolicy.enabled=true`. It allows:

- Ingress from the ingress controller namespace
- Ingress from the agent namespace (configurable)
- Egress to Postgres and Redis services
- Egress to DNS

## Upgrades

```bash
helm upgrade theoria ./charts/theoria \
  --namespace theoria \
  --set image.tag=v1.1.0
```

The deployment uses a rolling update strategy with `maxSurge=1, maxUnavailable=0`. Drizzle migrations run from the new pod's init phase before it accepts traffic.

For schema changes that aren't backward-compatible across versions (rare; see [Upgrades](../operations/upgrades.md)), scale to one replica during the migration window.
