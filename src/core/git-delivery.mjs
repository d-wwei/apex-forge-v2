import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { assertContract } from "./contracts.mjs";
import { SCHEMA_VERSION } from "./schema-version.mjs";

export const DEFAULT_PROTECTED_BRANCHES = Object.freeze([
  "main",
  "master",
  "trunk",
  "release/*"
]);
export const DEFAULT_MAX_STAGED_FILES = 25;

export class GitDeliveryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GitDeliveryError";
    this.code = code;
    this.details = details;
  }
}

export function discoverGitDelivery(repositoryPath, options = {}) {
  const repository = discoverRepository(repositoryPath);
  const protectedBranches = normalizeProtectedBranches(
    options.protectedBranches ?? DEFAULT_PROTECTED_BRANCHES
  );
  const branch = discoverCurrentBranch(repository.root_path);
  const components = normalizeComponents(options.components ?? []);
  const delivery = {
    schema_version: SCHEMA_VERSION,
    document_type: "git_delivery",
    discovered_at: new Date().toISOString(),
    repository,
    current_branch: {
      ...branch,
      protected: branch.name != null
        && protectedBranches.some((pattern) => branchMatches(branch.name, pattern))
    },
    worktrees: discoverWorktrees(repository.root_path),
    components,
    pull_request: normalizePullRequest(options.pullRequest ?? null),
    protected_branches: protectedBranches,
    staged_files: discoverStagedFiles(repository.root_path)
  };
  assertContract("git-delivery.schema.json", delivery, repository.root_path);
  return delivery;
}

export function claimCheckout(repositoryPath, ownerInput) {
  const repository = discoverRepository(repositoryPath);
  const owner = normalizeOwner(ownerInput);
  const paths = checkoutClaimPaths(repository);
  mkdirSync(paths.parent, { recursive: true, mode: 0o700 });

  try {
    mkdirSync(paths.claim_dir, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = readClaimRecord(paths.claim_dir, repository);
    assertSameOwner(existing.owner, owner);
    return existing;
  }

  const claim = {
    schema_version: SCHEMA_VERSION,
    document_type: "checkout_claim",
    kind: "checkout_claim",
    claim_token: randomUUID(),
    repository_id: repository.repository_id,
    checkout_path: repository.root_path,
    owner,
    status: "active",
    claimed_at: new Date().toISOString(),
    released_at: null
  };
  assertContract("git-delivery.schema.json", claim, paths.owner_path);

  try {
    writeExclusiveJson(paths.owner_path, claim);
    fsyncDirectory(paths.claim_dir);
    fsyncDirectory(paths.parent);
  } catch (error) {
    rmSync(paths.claim_dir, { recursive: true, force: true });
    throw error;
  }
  return claim;
}

export function readCheckoutClaim(repositoryPath) {
  const repository = discoverRepository(repositoryPath);
  const paths = checkoutClaimPaths(repository);
  if (!existsSync(paths.claim_dir)) return null;
  return readClaimRecord(paths.claim_dir, repository);
}

export function releaseCheckout(repositoryPath, releaseInput) {
  const repository = discoverRepository(repositoryPath);
  const owner = normalizeOwner(releaseInput);
  const claimToken = requiredString(releaseInput?.claim_token, "claim_token");
  const paths = checkoutClaimPaths(repository);
  if (!existsSync(paths.claim_dir)) {
    throw new GitDeliveryError(
      "CHECKOUT_CLAIM_NOT_FOUND",
      `checkout 没有 active claim：${repository.root_path}`,
      { checkout_path: repository.root_path }
    );
  }

  const existing = readClaimRecord(paths.claim_dir, repository);
  assertSameOwner(existing.owner, owner);
  if (existing.claim_token !== claimToken) {
    throw new GitDeliveryError(
      "CHECKOUT_CLAIM_TOKEN_MISMATCH",
      `checkout claim token 不匹配：${repository.root_path}`,
      { checkout_path: repository.root_path }
    );
  }

  const releaseDir = `${paths.claim_dir}.releasing-${process.pid}-${randomUUID()}`;
  try {
    renameSync(paths.claim_dir, releaseDir);
  } catch (error) {
    throw new GitDeliveryError(
      "CHECKOUT_CLAIM_RELEASE_RACE",
      `checkout claim 在释放时发生并发变化：${repository.root_path}`,
      { checkout_path: repository.root_path, cause: error.message }
    );
  }

  try {
    const moved = readClaimRecord(releaseDir, repository);
    assertSameOwner(moved.owner, owner);
    if (moved.claim_token !== claimToken) {
      throw new GitDeliveryError(
        "CHECKOUT_CLAIM_TOKEN_MISMATCH",
        `checkout claim token 在释放时发生变化：${repository.root_path}`,
        { checkout_path: repository.root_path }
      );
    }
    rmSync(releaseDir, { recursive: true, force: true });
    fsyncDirectory(paths.parent);
  } catch (error) {
    if (existsSync(releaseDir) && !existsSync(paths.claim_dir)) {
      renameSync(releaseDir, paths.claim_dir);
    }
    throw error;
  }

  const released = {
    ...existing,
    status: "released",
    released_at: new Date().toISOString()
  };
  assertContract("git-delivery.schema.json", released, repository.root_path);
  return released;
}

export function assertGitDeliveryGuards(delivery, options = {}) {
  if (!delivery || delivery.document_type !== "git_delivery") {
    throw new GitDeliveryError(
      "INVALID_GIT_DELIVERY",
      "Git Delivery context 无效"
    );
  }
  assertContract(
    "git-delivery.schema.json",
    delivery,
    delivery.repository?.root_path || "git delivery"
  );
  const stagedFiles = delivery.staged_files.map((path) =>
    normalizeRepositoryPath(path, "staged file")
  );
  const protectedBranches = normalizeProtectedBranches(delivery.protected_branches);
  const branchName = delivery.current_branch?.name;
  const protectedBranch = branchName != null
    && protectedBranches.some((pattern) => branchMatches(branchName, pattern));
  if (protectedBranch && options.allowProtectedBranch !== true) {
    throw new GitDeliveryError(
      "PROTECTED_BRANCH",
      `拒绝在 protected branch 上交付：${branchName}`,
      { branch: branchName }
    );
  }

  const maxStagedFiles = options.maxStagedFiles ?? DEFAULT_MAX_STAGED_FILES;
  if (!Number.isSafeInteger(maxStagedFiles) || maxStagedFiles < 0) {
    throw new GitDeliveryError(
      "INVALID_GUARD_CONFIGURATION",
      "maxStagedFiles 必须是非负整数",
      { max_staged_files: maxStagedFiles }
    );
  }
  if (stagedFiles.length > maxStagedFiles) {
    throw new GitDeliveryError(
      "BROAD_STAGING",
      `staged files 超出上限：${stagedFiles.length} > ${maxStagedFiles}`,
      {
        staged_file_count: stagedFiles.length,
        max_staged_files: maxStagedFiles,
        staged_files: stagedFiles
      }
    );
  }

  let component = null;
  if (options.componentId != null) {
    const componentId = requiredIdentifier(options.componentId, "componentId");
    component = delivery.components.find((item) => item.component_id === componentId);
    if (!component) {
      throw new GitDeliveryError(
        "COMPONENT_NOT_FOUND",
        `Git Delivery component 不存在：${componentId}`,
        { component_id: componentId }
      );
    }
    const componentRoot = normalizeRepositoryPath(
      component.root_path,
      `component ${componentId}`
    );
    const outOfScopeFiles = stagedFiles.filter((path) =>
      !pathInsideComponent(path, componentRoot)
    );
    if (outOfScopeFiles.length > 0) {
      throw new GitDeliveryError(
        "COMPONENT_SCOPE_VIOLATION",
        `存在越出 component scope 的 staged files：${componentId}`,
        {
          component_id: componentId,
          component_root: componentRoot,
          out_of_scope_files: outOfScopeFiles
        }
      );
    }
  }

  return {
    status: "PASS",
    repository_id: delivery.repository.repository_id,
    branch: branchName,
    component_id: component?.component_id ?? null,
    staged_files: stagedFiles
  };
}

function discoverRepository(repositoryPath) {
  const requestedPath = canonicalDirectory(repositoryPath);
  const bare = runGit(requestedPath, ["rev-parse", "--is-bare-repository"]).trim() === "true";
  if (bare) {
    throw new GitDeliveryError(
      "BARE_REPOSITORY_UNSUPPORTED",
      `Git Delivery 需要 non-bare checkout：${requestedPath}`
    );
  }
  const rootPath = canonicalDirectory(
    runGit(requestedPath, ["rev-parse", "--show-toplevel"]).trim()
  );
  const gitDir = canonicalDirectory(
    runGit(rootPath, ["rev-parse", "--absolute-git-dir"]).trim()
  );
  const commonDir = canonicalDirectory(
    runGit(rootPath, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir"
    ]).trim()
  );
  const headOid = tryGit(rootPath, ["rev-parse", "--verify", "HEAD"]);
  return {
    kind: "repository",
    repository_id: createHash("sha256").update(commonDir).digest("hex"),
    name: basename(rootPath),
    root_path: rootPath,
    git_dir: gitDir,
    common_dir: commonDir,
    head_oid: headOid?.trim() || null,
    bare: false
  };
}

function discoverCurrentBranch(repositoryRoot) {
  const ref = tryGit(repositoryRoot, ["symbolic-ref", "--quiet", "HEAD"])?.trim() || null;
  const name = tryGit(repositoryRoot, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD"
  ])?.trim() || null;
  const headOid = tryGit(repositoryRoot, ["rev-parse", "--verify", "HEAD"])?.trim() || null;
  return {
    kind: "branch",
    name,
    ref,
    head_oid: headOid,
    detached: ref == null,
    protected: false
  };
}

function discoverWorktrees(repositoryRoot) {
  const output = runGitBuffer(repositoryRoot, [
    "worktree",
    "list",
    "--porcelain",
    "-z"
  ]).toString("utf8");
  const records = [];
  let current = {};
  for (const token of output.split("\0")) {
    if (token === "") {
      if (current.worktree) records.push(current);
      current = {};
      continue;
    }
    const separator = token.indexOf(" ");
    const key = separator === -1 ? token : token.slice(0, separator);
    const value = separator === -1 ? "" : token.slice(separator + 1);
    current[key] = value;
  }
  if (current.worktree) records.push(current);

  return records.map((record) => {
    const checkoutPath = existsSync(record.worktree)
      ? realpathSync(record.worktree)
      : resolve(record.worktree);
    return {
      kind: "checkout",
      checkout_path: checkoutPath,
      head_oid: record.HEAD || null,
      branch: record.branch?.startsWith("refs/heads/")
        ? record.branch.slice("refs/heads/".length)
        : record.branch || null,
      detached: Object.hasOwn(record, "detached"),
      bare: Object.hasOwn(record, "bare"),
      locked: Object.hasOwn(record, "locked"),
      prunable: Object.hasOwn(record, "prunable"),
      is_current: checkoutPath === repositoryRoot
    };
  });
}

function discoverStagedFiles(repositoryRoot) {
  const output = runGitBuffer(repositoryRoot, [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMRDTUXB",
    "--no-ext-diff",
    "--no-textconv",
    "-z"
  ]).toString("utf8");
  return [...new Set(
    output.split("\0")
      .filter(Boolean)
      .map((path) => normalizeRepositoryPath(path, "staged file"))
  )].sort();
}

function normalizeComponents(components) {
  if (!Array.isArray(components)) {
    throw new GitDeliveryError(
      "INVALID_COMPONENT",
      "components 必须是数组"
    );
  }
  const seen = new Set();
  return components.map((component) => {
    if (!component || typeof component !== "object" || Array.isArray(component)) {
      throw new GitDeliveryError("INVALID_COMPONENT", "component 必须是对象");
    }
    const componentId = requiredIdentifier(component.component_id, "component_id");
    if (seen.has(componentId)) {
      throw new GitDeliveryError(
        "DUPLICATE_COMPONENT",
        `component_id 重复：${componentId}`
      );
    }
    seen.add(componentId);
    return {
      kind: "component",
      component_id: componentId,
      root_path: normalizeRepositoryPath(component.root_path, `component ${componentId}`)
    };
  });
}

function normalizePullRequest(pullRequest) {
  if (pullRequest == null) return null;
  if (typeof pullRequest !== "object" || Array.isArray(pullRequest)) {
    throw new GitDeliveryError("INVALID_PULL_REQUEST", "pullRequest 必须是对象或 null");
  }
  const provider = requiredString(pullRequest.provider, "pullRequest.provider");
  const allowedProviders = new Set([
    "github",
    "gitlab",
    "bitbucket",
    "azure_devops",
    "gitea",
    "other"
  ]);
  if (!allowedProviders.has(provider)) {
    throw new GitDeliveryError(
      "INVALID_PULL_REQUEST",
      `不支持的 pull request provider：${provider}`
    );
  }
  const status = pullRequest.status == null
    ? "unknown"
    : requiredString(pullRequest.status, "pullRequest.status");
  if (!["open", "draft", "closed", "merged", "unknown"].includes(status)) {
    throw new GitDeliveryError(
      "INVALID_PULL_REQUEST",
      `不支持的 pull request status：${status}`
    );
  }
  const normalized = {
    kind: "pull_request",
    provider,
    pr_id: requiredString(pullRequest.pr_id, "pullRequest.pr_id"),
    base_branch: requiredString(pullRequest.base_branch, "pullRequest.base_branch"),
    head_branch: requiredString(pullRequest.head_branch, "pullRequest.head_branch"),
    status
  };
  if (pullRequest.url != null) {
    normalized.url = requiredString(pullRequest.url, "pullRequest.url");
  }
  return normalized;
}

function normalizeProtectedBranches(patterns) {
  if (!Array.isArray(patterns)) {
    throw new GitDeliveryError(
      "INVALID_PROTECTED_BRANCHES",
      "protectedBranches 必须是数组"
    );
  }
  return [...new Set(patterns.map((pattern) => {
    const value = requiredString(pattern, "protected branch pattern");
    if (value.includes("\0") || value.includes("..") || /\s/.test(value)) {
      throw new GitDeliveryError(
        "INVALID_PROTECTED_BRANCHES",
        `protected branch pattern 不安全：${value}`
      );
    }
    return value;
  }))];
}

function normalizeOwner(owner) {
  if (!owner || typeof owner !== "object" || Array.isArray(owner)) {
    throw new GitDeliveryError("INVALID_CHECKOUT_OWNER", "checkout owner 必须是对象");
  }
  const normalized = {
    owner_id: requiredString(owner.owner_id, "owner_id")
  };
  if (owner.run_id != null) normalized.run_id = requiredString(owner.run_id, "run_id");
  if (owner.worker_id != null) {
    normalized.worker_id = requiredString(owner.worker_id, "worker_id");
  }
  return normalized;
}

function assertSameOwner(existingOwner, requestedOwner) {
  if (
    existingOwner.owner_id !== requestedOwner.owner_id
    || (existingOwner.run_id ?? null) !== (requestedOwner.run_id ?? null)
    || (existingOwner.worker_id ?? null) !== (requestedOwner.worker_id ?? null)
  ) {
    throw new GitDeliveryError(
      "CHECKOUT_OWNED_BY_FOREIGN_OWNER",
      `checkout 已由其他 owner 持有：${existingOwner.owner_id}`,
      { current_owner: existingOwner, requested_owner: requestedOwner }
    );
  }
}

function checkoutClaimPaths(repository) {
  const key = createHash("sha256").update(repository.root_path).digest("hex");
  const parent = join(repository.common_dir, "apex-forge", "checkout-claims");
  const claimDir = join(parent, `${key}.claim`);
  return {
    parent,
    claim_dir: claimDir,
    owner_path: join(claimDir, "owner.json")
  };
}

function readClaimRecord(claimDir, repository) {
  const ownerPath = join(claimDir, "owner.json");
  let claim;
  try {
    claim = JSON.parse(readFileSync(ownerPath, "utf8"));
    assertContract("git-delivery.schema.json", claim, ownerPath);
  } catch (error) {
    throw new GitDeliveryError(
      "CHECKOUT_CLAIM_CORRUPT",
      `checkout claim 无法安全读取，拒绝接管：${repository.root_path}`,
      { checkout_path: repository.root_path, cause: error.message }
    );
  }
  if (
    claim.status !== "active"
    || claim.repository_id !== repository.repository_id
    || claim.checkout_path !== repository.root_path
  ) {
    throw new GitDeliveryError(
      "CHECKOUT_CLAIM_CORRUPT",
      `checkout claim identity 不匹配，拒绝接管：${repository.root_path}`,
      { checkout_path: repository.root_path }
    );
  }
  return claim;
}

function normalizeRepositoryPath(path, label) {
  const value = requiredString(path, label);
  if (
    value.includes("\0")
    || isAbsolute(value)
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.includes("\\")
  ) {
    throw new GitDeliveryError(
      "UNSAFE_REPOSITORY_PATH",
      `${label} 不是安全的 repository-relative path：${value}`,
      { path: value }
    );
  }
  const parts = value.split("/");
  if (parts.some((part) => part === "..")) {
    throw new GitDeliveryError(
      "UNSAFE_REPOSITORY_PATH",
      `${label} 试图越出 repository：${value}`,
      { path: value }
    );
  }
  const normalized = parts.filter((part) => part !== "" && part !== ".").join("/");
  if (value === "." || normalized === "") return ".";
  return normalized;
}

function pathInsideComponent(path, componentRoot) {
  if (componentRoot === ".") return true;
  return path === componentRoot || path.startsWith(`${componentRoot}/`);
}

function branchMatches(branch, pattern) {
  const expression = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${expression}$`).test(branch);
}

function requiredIdentifier(value, label) {
  const normalized = requiredString(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new GitDeliveryError(
      "INVALID_IDENTIFIER",
      `${label} 不是安全标识符：${normalized}`
    );
  }
  return normalized;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GitDeliveryError(
      "INVALID_GIT_DELIVERY_INPUT",
      `${label} 必须是非空字符串`
    );
  }
  if (value.includes("\0")) {
    throw new GitDeliveryError(
      "INVALID_GIT_DELIVERY_INPUT",
      `${label} 包含 NUL`
    );
  }
  return value;
}

function canonicalDirectory(path) {
  const value = requiredString(String(path ?? ""), "repository path");
  let canonical;
  try {
    canonical = realpathSync(value);
  } catch (error) {
    throw new GitDeliveryError(
      "REPOSITORY_PATH_NOT_FOUND",
      `repository path 不存在：${value}`,
      { path: value, cause: error.message }
    );
  }
  if (!statSync(canonical).isDirectory()) {
    throw new GitDeliveryError(
      "REPOSITORY_PATH_NOT_DIRECTORY",
      `repository path 不是目录：${canonical}`,
      { path: canonical }
    );
  }
  return canonical;
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: gitEnvironment()
  });
  if (result.status !== 0) throw gitCommandError(cwd, args, result);
  return result.stdout;
}

function runGitBuffer(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "buffer",
    env: gitEnvironment()
  });
  if (result.status !== 0) throw gitCommandError(cwd, args, result);
  return result.stdout;
}

function tryGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: gitEnvironment()
  });
  if (result.status === 0) return result.stdout;
  if (result.status === 1) return null;
  throw gitCommandError(cwd, args, result);
}

function gitEnvironment() {
  return {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0"
  };
}

function gitCommandError(cwd, args, result) {
  const stderr = Buffer.isBuffer(result.stderr)
    ? result.stderr.toString("utf8")
    : result.stderr;
  return new GitDeliveryError(
    "GIT_DISCOVERY_FAILED",
    `本地 git 发现失败：git ${args.join(" ")}`,
    {
      cwd,
      status: result.status,
      stderr: String(stderr || "").trim()
    }
  );
}

function writeExclusiveJson(path, value) {
  let descriptor = null;
  try {
    descriptor = openSync(path, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
  } finally {
    if (descriptor != null) closeSync(descriptor);
  }
}

function fsyncDirectory(path) {
  let descriptor = null;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR"].includes(error.code)) throw error;
  } finally {
    if (descriptor != null) closeSync(descriptor);
  }
}
