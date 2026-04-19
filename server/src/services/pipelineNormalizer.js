/**
 * Normalizes CI/CD webhook payloads from different platforms
 * into a common pipeline run schema.
 */

function detectSource(headers) {
  if (headers["x-github-event"]) return "github";
  if (headers["x-gitlab-event"]) return "gitlab";
  if (headers["x-event-key"]) return "bitbucket";
  // Jenkins: check for known body shape or custom header
  if (headers["x-jenkins-event"] || headers["x-jenkins-url"]) return "jenkins";
  return null;
}

function mapStatus(raw) {
  const s = String(raw).toLowerCase();
  if (["success", "completed", "passed", "fixed"].includes(s)) return "success";
  if (["failure", "failed", "broken", "error"].includes(s)) return "failure";
  if (["cancelled", "canceled", "aborted", "skipped"].includes(s)) return "cancelled";
  if (["running", "in_progress", "building", "pending", "created", "waiting_for_resource", "preparing", "scheduled"].includes(s)) return "running";
  return "pending";
}

function normalizeGitHub(headers, body) {
  const event = headers["x-github-event"];

  // workflow_run event (most common for GitHub Actions)
  if (event === "workflow_run" && body.workflow_run) {
    const wr = body.workflow_run;
    const conclusion = wr.conclusion; // success, failure, cancelled, etc.
    const status = conclusion ? mapStatus(conclusion) : mapStatus(wr.status);
    return {
      source: "github",
      repo: wr.repository?.full_name || body.repository?.full_name || "",
      branch: wr.head_branch || "",
      pipelineName: wr.name || "",
      runId: String(wr.id),
      runNumber: wr.run_number || 0,
      status,
      triggeredBy: wr.actor?.login || wr.triggering_actor?.login || "",
      commitSha: wr.head_sha || "",
      commitMessage: wr.head_commit?.message || "",
      url: wr.html_url || "",
      startedAt: wr.created_at || wr.run_started_at || null,
      finishedAt: wr.updated_at || null,
      stages: [],
    };
  }

  // check_suite event
  if (event === "check_suite" && body.check_suite) {
    const cs = body.check_suite;
    const status = cs.conclusion ? mapStatus(cs.conclusion) : mapStatus(cs.status);
    return {
      source: "github",
      repo: body.repository?.full_name || "",
      branch: cs.head_branch || "",
      pipelineName: "Check Suite",
      runId: String(cs.id),
      runNumber: 0,
      status,
      triggeredBy: cs.app?.name || "",
      commitSha: cs.head_sha || "",
      commitMessage: "",
      url: cs.url || "",
      startedAt: cs.created_at || null,
      finishedAt: cs.updated_at || null,
      stages: [],
    };
  }

  return null;
}

function normalizeGitLab(headers, body) {
  const attrs = body.object_attributes || {};
  const status = mapStatus(attrs.status || attrs.detailed_status || "");
  const project = body.project || {};
  const commit = body.commit || {};

  return {
    source: "gitlab",
    repo: project.path_with_namespace || project.name || "",
    branch: attrs.ref || "",
    pipelineName: attrs.name || `Pipeline #${attrs.id || ""}`,
    runId: String(attrs.id || body.object_attributes?.id || ""),
    runNumber: attrs.iid || 0,
    status,
    triggeredBy: body.user?.username || body.user?.name || "",
    commitSha: commit.sha || attrs.sha || "",
    commitMessage: commit.message || "",
    url: project.web_url ? `${project.web_url}/-/pipelines/${attrs.id}` : "",
    startedAt: attrs.created_at || null,
    finishedAt: attrs.finished_at || null,
    stages: (Array.isArray(attrs.stages) ? attrs.stages : Array.isArray(body.builds) ? body.builds : []).map((s) =>
      typeof s === "string" ? s : s.stage || s.name || ""
    ),
  };
}

function normalizeJenkins(headers, body) {
  const build = body.build || body;
  const status = mapStatus(build.status || build.result || build.phase || "");
  const scm = build.scm || {};

  return {
    source: "jenkins",
    repo: body.name || build.projectName || build.job_name || "",
    branch: scm.branch || build.branch || "",
    pipelineName: body.name || build.projectName || build.job_name || "",
    runId: String(build.number || build.id || ""),
    runNumber: Number(build.number) || 0,
    status,
    triggeredBy: build.userId || build.userName || "",
    commitSha: scm.commit || build.commit || "",
    commitMessage: scm.message || "",
    url: build.full_url || build.url || body.build_url || "",
    startedAt: build.timestamp ? new Date(build.timestamp).toISOString() : null,
    finishedAt: build.duration ? new Date(build.timestamp + build.duration).toISOString() : null,
    stages: [],
  };
}

function normalizeBitbucket(headers, body) {
  const eventKey = headers["x-event-key"];
  const pr = body.pullrequest || {};
  const repo = body.repository || {};
  const commitStatus = body.commit_status || {};

  // repo:commit_status_updated or repo:commit_status_created
  if (eventKey && eventKey.startsWith("repo:commit_status")) {
    return {
      source: "bitbucket",
      repo: repo.full_name || "",
      branch: "",
      pipelineName: commitStatus.name || commitStatus.key || "Pipeline",
      runId: String(commitStatus.key || commitStatus.name || ""),
      runNumber: 0,
      status: mapStatus(commitStatus.state || ""),
      triggeredBy: commitStatus.refname || "",
      commitSha: commitStatus.commit?.hash || "",
      commitMessage: "",
      url: commitStatus.url || "",
      startedAt: commitStatus.created_on || null,
      finishedAt: commitStatus.updated_on || null,
      stages: [],
    };
  }

  // pipelines:step_completed or pipeline_state_change
  const pipeline = body.pipeline || {};
  const step = body.step || {};
  return {
    source: "bitbucket",
    repo: repo.full_name || "",
    branch: pipeline.target?.ref_name || "",
    pipelineName: pipeline.target?.selector?.pattern || step.name || "Pipeline",
    runId: String(pipeline.uuid || step.uuid || ""),
    runNumber: pipeline.build_number || 0,
    status: mapStatus(pipeline.state?.name || step.state?.name || ""),
    triggeredBy: pipeline.creator?.display_name || "",
    commitSha: pipeline.target?.commit?.hash || "",
    commitMessage: pipeline.target?.commit?.message || "",
    url: pipeline.links?.html?.href || "",
    startedAt: pipeline.created_on || null,
    finishedAt: pipeline.completed_on || null,
    stages: [],
  };
}

function normalize(headers, body) {
  const source = detectSource(headers);
  if (!source) return null;

  switch (source) {
    case "github": return normalizeGitHub(headers, body);
    case "gitlab": return normalizeGitLab(headers, body);
    case "jenkins": return normalizeJenkins(headers, body);
    case "bitbucket": return normalizeBitbucket(headers, body);
    default: return null;
  }
}

module.exports = { normalize, detectSource, mapStatus };
