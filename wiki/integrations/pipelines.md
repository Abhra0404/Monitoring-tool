# CI/CD Pipelines

Theoria can ingest webhooks from your CI/CD provider, normalise them into a unified `pipelines` table, and surface them on the dashboard alongside metrics, alerts, and incidents.

## Endpoint

```
POST /api/pipelines/webhook
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

The webhook receiver auto-detects the payload format. There is no provider-specific URL — the same endpoint accepts GitHub Actions, GitLab CI, Jenkins, and Bitbucket payloads.

## Supported providers

| Provider | How |
|---|---|
| **GitHub Actions** | `workflow_run` and `workflow_job` webhooks |
| **GitLab CI** | `Pipeline Hook` and `Job Hook` |
| **Jenkins** | Generic Webhook plugin (POST job result JSON) |
| **Bitbucket** | `repo:build_created` and `repo:build_updated` |

## GitHub Actions setup

1. **Repository → Settings → Webhooks → Add webhook**.
2. **Payload URL:** `https://monitor.example.com/api/pipelines/webhook`
3. **Content type:** `application/json`
4. **Secret:** any value — Theoria validates the `X-Hub-Signature-256` header if `THEORIA_GITHUB_WEBHOOK_SECRET` is set.
5. **Events:** select **Workflow runs** and **Workflow jobs**.

To pass the API key in a header, use a workflow-level forwarder instead. The simplest pattern is to add a job step:

```yaml
- name: Notify Theoria
  if: always()
  run: |
    curl -fsS -X POST https://monitor.example.com/api/pipelines/webhook \
      -H "Authorization: Bearer ${{ secrets.THEORIA_API_KEY }}" \
      -H "X-GitHub-Event: workflow_run" \
      -H "Content-Type: application/json" \
      -d @- <<EOF
    {
      "action": "completed",
      "workflow_run": {
        "id": ${{ github.run_id }},
        "name": "${{ github.workflow }}",
        "head_branch": "${{ github.ref_name }}",
        "head_sha": "${{ github.sha }}",
        "status": "completed",
        "conclusion": "${{ job.status }}",
        "html_url": "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}",
        "created_at": "$(date -u +%FT%TZ)"
      },
      "repository": { "full_name": "${{ github.repository }}" }
    }
    EOF
```

## GitLab CI setup

**Project → Settings → Webhooks → Add webhook**.

- **URL:** `https://monitor.example.com/api/pipelines/webhook`
- **Secret token:** the API key (sent as `X-Gitlab-Token`; Theoria forwards it through Bearer matching)
- **Triggers:** Pipeline events, Job events

## Jenkins setup

Install the **Generic Webhook** or **Notification** plugin and point it at:

```
https://monitor.example.com/api/pipelines/webhook?token=<API_KEY>
```

The receiver accepts the API key via the `token` query string in addition to the `Authorization` header — necessary because the Jenkins plugin can't always set custom headers.

## Bitbucket setup

**Repository → Settings → Webhooks → Add webhook**.

- **URL:** `https://monitor.example.com/api/pipelines/webhook`
- **Triggers:** Pipeline status changed
- Use a Bitbucket Repository Variable to inject `THEORIA_API_KEY` into the webhook URL, or place Theoria behind an authenticating proxy that injects the header.

## Querying pipelines

```bash
# All pipelines
curl https://monitor.example.com/api/pipelines \
  -H "Authorization: Bearer <jwt>"

# Filter by source
curl "https://monitor.example.com/api/pipelines?source=github" \
  -H "Authorization: Bearer <jwt>"

# One pipeline
curl https://monitor.example.com/api/pipelines/<id> \
  -H "Authorization: Bearer <jwt>"
```

## Schema

After normalisation, every pipeline row contains:

| Field | Type |
|---|---|
| `source` | `github` · `gitlab` · `jenkins` · `bitbucket` |
| `repo`, `branch`, `pipelineName`, `triggeredBy` | strings |
| `runId`, `runNumber` | provider IDs |
| `commitSha`, `commitMessage`, `url` | links back to the provider UI |
| `status` | `running` · `success` · `failed` · `cancelled` |
| `startedAt`, `finishedAt` | timestamps |
| `durationMs` | bigint |
| `stages` | jsonb array of step results |

## Real-time

Each insert/update emits a `pipeline:update` event over Socket.IO. The dashboard's "Pipelines" page subscribes to this and renders new runs without polling.

## Best practices

- **Send terminal events only.** Theoria normalises status updates fine, but if you only care about pass/fail, send the webhook in the final job.
- **Use a single shared API key per CI provider** rather than per-repo keys; pipeline rows are scoped per-user, not per-repo.
- **Tie pipelines to alerts.** Failed deploys often correlate with metric anomalies; the unified events timeline (`/api/events`) lets you replay them together.
