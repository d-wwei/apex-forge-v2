import { join } from "node:path";
import {
  assertGitDeliveryGuards,
  claimCheckout,
  discoverGitDelivery,
  readCheckoutClaim,
  releaseCheckout
} from "../core/git-delivery.mjs";
import { appendEvent, projectRoot, requireStore, updateProject } from "../core/store.mjs";
import { ensureDir, readJson, required, splitList, writeJson } from "../lib/common.mjs";

export function handleGitDeliveryCommand(action, args) {
  const projectDir = projectRoot(args);
  const root = requireStore(projectDir);
  if (action === "discover") {
    const delivery = discoverGitDelivery(projectDir, discoveryOptions(args));
    if (args.record) {
      ensureDir(join(root, "delivery"));
      writeJson(join(root, "delivery", "git.json"), delivery);
      recordEvent(root, "git.delivery.discovered", {
        repository_id: delivery.repository.repository_id,
        branch: delivery.current_branch.name,
        worktree_count: delivery.worktrees.length
      });
    }
    console.log(JSON.stringify(delivery, null, 2));
    return;
  }
  if (action === "guard") {
    const delivery = args.recorded
      ? readJson(join(root, "delivery", "git.json"), null)
      : discoverGitDelivery(projectDir, discoveryOptions(args));
    if (!delivery) throw new Error("找不到 recorded Git Delivery context");
    console.log(JSON.stringify(assertGitDeliveryGuards(delivery, {
      allowProtectedBranch: Boolean(args["allow-protected-branch"]),
      componentId: args["component-id"] ? String(args["component-id"]) : undefined,
      maxStagedFiles: args["max-staged-files"] == null
        ? undefined
        : Number(args["max-staged-files"])
    }), null, 2));
    return;
  }
  if (action === "claim") {
    const owner = ownerInput(args);
    const claim = claimCheckout(projectDir, owner);
    recordEvent(root, "git.checkout.claimed", {
      repository_id: claim.repository_id,
      checkout_path: claim.checkout_path,
      owner: claim.owner,
      claim_token: claim.claim_token
    });
    console.log(JSON.stringify(claim, null, 2));
    return;
  }
  if (action === "release") {
    const released = releaseCheckout(projectDir, {
      ...ownerInput(args),
      claim_token: required(args, "claim-token")
    });
    recordEvent(root, "git.checkout.released", {
      repository_id: released.repository_id,
      checkout_path: released.checkout_path,
      owner: released.owner,
      claim_token: released.claim_token
    });
    console.log(JSON.stringify(released, null, 2));
    return;
  }
  if (action === "claim-status") {
    console.log(JSON.stringify(readCheckoutClaim(projectDir), null, 2));
    return;
  }
  throw new Error(`未知 project git 动作：${action || "(空)"}`);
}

function discoveryOptions(args) {
  return {
    protectedBranches: args["protected-branches"]
      ? splitList(args["protected-branches"])
      : undefined,
    components: parseJsonArray(args["components-json"], "components-json"),
    pullRequest: parseJsonObject(args["pr-json"], "pr-json")
  };
}

function parseJsonArray(value, name) {
  if (value == null) return undefined;
  const parsed = parseJson(value, name);
  if (!Array.isArray(parsed)) throw new Error(`--${name} 必须是 JSON 数组`);
  return parsed;
}

function parseJsonObject(value, name) {
  if (value == null) return undefined;
  const parsed = parseJson(value, name);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`--${name} 必须是 JSON 对象`);
  }
  return parsed;
}

function parseJson(value, name) {
  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(`--${name} 不是有效 JSON：${error.message}`);
  }
}

function ownerInput(args) {
  return {
    owner_id: required(args, "owner-id"),
    run_id: args["run-id"] ? String(args["run-id"]) : undefined,
    worker_id: args["worker-id"] ? String(args["worker-id"]) : undefined
  };
}

function recordEvent(root, type, payload) {
  const event = appendEvent(root, type, "apex-v2", payload);
  updateProject(root, {
    last_event_id: event.event_id,
    updated_at: event.timestamp
  });
}
