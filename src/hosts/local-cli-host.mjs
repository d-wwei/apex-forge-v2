import { assertHostAdapter } from "../contracts/host-adapter.mjs";

export function createLocalCliHostAdapter(id, displayName) {
  return assertHostAdapter({
    id,
    describeHost() {
      return {
        id,
        display_name: displayName,
        capabilities: [
          "interactive",
          "artifact_submit",
          "approval",
          "progress",
          "cancellation"
        ]
      };
    },
    openProject(input) {
      return envelope(id, "project_open", "project.open", {
        project_dir: input.projectDir
      });
    },
    claimAction(input) {
      return envelope(id, "action_claim", "host.claim", {
        project_dir: input.projectDir,
        worker_id: input.workerId
      });
    },
    submitArtifact(input) {
      return envelope(id, "artifact_submit", "host.submit", {
        project_dir: input.projectDir,
        worker_id: input.workerId,
        summary: input.summary,
        refs: input.refs || []
      });
    },
    requestApproval(input) {
      return envelope(id, "approval_request", "approval.decide", {
        approval_id: input.approvalId
      });
    },
    reportProgress(input) {
      return envelope(id, "progress_report", "host.progress", {
        message: input.message
      });
    },
    cancelAction(input) {
      return envelope(id, "action_cancel", "host.cancel", {
        worker_id: input.workerId
      });
    }
  });
}

function envelope(hostId, kind, name, args) {
  return {
    host_id: hostId,
    kind,
    command: { name, args }
  };
}
