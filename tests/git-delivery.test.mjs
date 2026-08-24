import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertGitDeliveryGuards,
  claimCheckout,
  discoverGitDelivery,
  readCheckoutClaim,
  releaseCheckout
} from "../src/core/git-delivery.mjs";
import { validateContract } from "../src/core/contracts.mjs";

test("discovers a typed local repository, current branch, and linked worktrees", (t) => {
  const fixture = createRepository(t);
  const linked = join(fixture.parent, "linked checkout");
  git(fixture.repository, ["worktree", "add", "--detach", "-q", linked, "HEAD"]);

  const delivery = discoverGitDelivery(join(fixture.repository, "src"), {
    protectedBranches: ["main", "release/*"],
    components: [{
      component_id: "core",
      root_path: "src/core"
    }],
    pullRequest: {
      provider: "github",
      pr_id: "42",
      base_branch: "main",
      head_branch: "feature/git-delivery",
      status: "open"
    }
  });

  assert.equal(delivery.document_type, "git_delivery");
  assert.equal(delivery.repository.kind, "repository");
  assert.equal(delivery.repository.root_path, realpathSync(fixture.repository));
  assert.match(delivery.repository.repository_id, /^[a-f0-9]{64}$/);
  assert.equal(delivery.current_branch.kind, "branch");
  assert.equal(delivery.current_branch.name, "main");
  assert.equal(delivery.current_branch.ref, "refs/heads/main");
  assert.equal(delivery.current_branch.detached, false);
  assert.equal(delivery.current_branch.protected, true);
  assert.equal(delivery.components[0].kind, "component");
  assert.equal(delivery.pull_request.kind, "pull_request");
  assert.equal(delivery.pull_request.pr_id, "42");
  assert.deepEqual(delivery.staged_files, []);
  assert.equal(delivery.worktrees.length, 2);
  assert.ok(delivery.worktrees.some((worktree) =>
    worktree.checkout_path === realpathSync(linked)
    && worktree.detached === true
  ));
  assert.equal(
    validateContract("git-delivery.schema.json", delivery).valid,
    true
  );
});

test("checkout claims are idempotent for one owner and fail closed for a foreign owner", (t) => {
  const fixture = createRepository(t);
  const owner = {
    owner_id: "agent-a",
    run_id: "run-1",
    worker_id: "worker-1"
  };
  const claim = claimCheckout(fixture.repository, owner);
  const repeated = claimCheckout(join(fixture.repository, "src"), owner);

  assert.equal(claim.status, "active");
  assert.equal(repeated.claim_token, claim.claim_token);
  assert.equal(readCheckoutClaim(fixture.repository).claim_token, claim.claim_token);
  assert.equal(
    validateContract("git-delivery.schema.json", claim).valid,
    true
  );

  assert.throws(
    () => claimCheckout(fixture.repository, {
      owner_id: "agent-b",
      run_id: "run-2",
      worker_id: "worker-2"
    }),
    (error) => error.code === "CHECKOUT_OWNED_BY_FOREIGN_OWNER"
  );
  assert.throws(
    () => releaseCheckout(fixture.repository, {
      owner_id: "agent-b",
      run_id: "run-2",
      worker_id: "worker-2",
      claim_token: claim.claim_token
    }),
    (error) => error.code === "CHECKOUT_OWNED_BY_FOREIGN_OWNER"
  );
  assert.equal(readCheckoutClaim(fixture.repository).owner.owner_id, "agent-a");

  const released = releaseCheckout(fixture.repository, {
    ...owner,
    claim_token: claim.claim_token
  });
  assert.equal(released.status, "released");
  assert.equal(readCheckoutClaim(fixture.repository), null);

  const next = claimCheckout(fixture.repository, {
    owner_id: "agent-b",
    run_id: "run-2",
    worker_id: "worker-2"
  });
  assert.notEqual(next.claim_token, claim.claim_token);
});

test("release requires the exact claim token and preserves ownership on mismatch", (t) => {
  const fixture = createRepository(t);
  const owner = { owner_id: "agent-a", run_id: "run-1" };
  const claim = claimCheckout(fixture.repository, owner);

  assert.throws(
    () => releaseCheckout(fixture.repository, {
      ...owner,
      claim_token: "00000000-0000-4000-8000-000000000000"
    }),
    (error) => error.code === "CHECKOUT_CLAIM_TOKEN_MISMATCH"
  );
  assert.equal(readCheckoutClaim(fixture.repository).claim_token, claim.claim_token);
});

test("guards protected branches, broad staging, and files outside component scope", (t) => {
  const fixture = createRepository(t);
  const protectedDelivery = discoverGitDelivery(fixture.repository, {
    protectedBranches: ["main"],
    components: [{ component_id: "core", root_path: "src/core" }]
  });

  assert.throws(
    () => assertGitDeliveryGuards(protectedDelivery, { componentId: "core" }),
    (error) => error.code === "PROTECTED_BRANCH"
  );
  assert.equal(
    assertGitDeliveryGuards(protectedDelivery, {
      componentId: "core",
      allowProtectedBranch: true
    }).status,
    "PASS"
  );

  git(fixture.repository, ["switch", "-q", "-c", "feature/git-delivery"]);
  writeFileSync(join(fixture.repository, "src", "core", "delivery.mjs"), "export const delivery = true;\n");
  writeFileSync(join(fixture.repository, "docs", "notes.md"), "outside component\n");
  git(fixture.repository, ["add", "src/core/delivery.mjs", "docs/notes.md"]);

  const scopedDelivery = discoverGitDelivery(fixture.repository, {
    protectedBranches: ["main"],
    components: [{ component_id: "core", root_path: "src/core" }]
  });
  assert.throws(
    () => assertGitDeliveryGuards(scopedDelivery, {
      componentId: "core",
      maxStagedFiles: 10
    }),
    (error) =>
      error.code === "COMPONENT_SCOPE_VIOLATION"
      && error.details.out_of_scope_files[0] === "docs/notes.md"
  );

  git(fixture.repository, ["reset", "-q", "HEAD", "--", "docs/notes.md"]);
  const broadDelivery = discoverGitDelivery(fixture.repository, {
    protectedBranches: ["main"],
    components: [{ component_id: "core", root_path: "src/core" }]
  });
  assert.throws(
    () => assertGitDeliveryGuards(broadDelivery, {
      componentId: "core",
      maxStagedFiles: 0
    }),
    (error) => error.code === "BROAD_STAGING"
  );
  const report = assertGitDeliveryGuards(broadDelivery, {
    componentId: "core",
    maxStagedFiles: 1
  });
  assert.equal(report.status, "PASS");
  assert.deepEqual(report.staged_files, ["src/core/delivery.mjs"]);
});

test("component paths and guard inputs reject path escapes", (t) => {
  const fixture = createRepository(t);

  assert.throws(
    () => discoverGitDelivery(fixture.repository, {
      components: [{ component_id: "escape", root_path: "../outside" }]
    }),
    (error) => error.code === "UNSAFE_REPOSITORY_PATH"
  );
  assert.throws(
    () => discoverGitDelivery(fixture.repository, {
      components: [{ component_id: "escape", root_path: "/tmp/outside" }]
    }),
    (error) => error.code === "UNSAFE_REPOSITORY_PATH"
  );

  const delivery = discoverGitDelivery(fixture.repository, {
    protectedBranches: [],
    components: [{ component_id: "core", root_path: "src/core" }]
  });
  delivery.staged_files = ["../outside"];
  assert.throws(
    () => assertGitDeliveryGuards(delivery, { componentId: "core" }),
    (error) => error.code === "UNSAFE_REPOSITORY_PATH"
  );
});

function createRepository(t) {
  const parent = mkdtempSync(join(tmpdir(), "apex-git-delivery-"));
  const repository = join(parent, "repository");
  mkdirSync(join(repository, "src", "core"), { recursive: true });
  mkdirSync(join(repository, "docs"), { recursive: true });
  writeFileSync(join(repository, "src", "core", "index.mjs"), "export const value = 1;\n");
  writeFileSync(join(repository, "docs", "README.md"), "fixture\n");
  git(repository, ["init", "-q", "-b", "main"]);
  git(repository, ["config", "user.name", "Apex Forge Test"]);
  git(repository, ["config", "user.email", "apex-forge@example.invalid"]);
  git(repository, ["add", "."]);
  git(repository, ["commit", "-q", "-m", "fixture"]);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return { parent, repository };
}

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0"
    }
  });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed:\n${result.stderr || ""}`
  );
  return result.stdout.trim();
}
