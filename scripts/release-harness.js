const { execFileSync, spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function platformKey(platform = process.platform) {
  const platforms = {
    darwin: "mac",
    win32: "win",
    linux: "linux"
  };
  const key = platforms[platform];
  if (!key) {
    throw new Error(`Unsupported release platform: ${platform}`);
  }
  return key;
}

function isVersion(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value ?? "");
}

function readPackage() {
  return JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
}

function readLock() {
  return JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
}

function run(command, args, extra = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...extra
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function capture(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function succeeds(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "ignore"
  });
  return !result.error && result.status === 0;
}

function loadReleaseEnvironment(base = process.env) {
  const env = { ...base };
  const envPath = resolve(root, "electron-builder.env");
  let contents = "";
  try {
    contents = readFileSync(envPath, "utf8");
  } catch {
    return env;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!env[key]) {
      env[key] = value;
    }
  }
  return env;
}

function repositoryInfo(packageJson = readPackage()) {
  const publish = packageJson.build?.publish;
  if (!publish || publish.provider !== "github" || !publish.owner || !publish.repo) {
    throw new Error("package.json build.publish must point to a GitHub repository");
  }
  return { owner: publish.owner, repo: publish.repo };
}

async function githubRequest(pathname, token) {
  const response = await globalThis.fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "GigaCharge-release-harness",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${pathname} failed with HTTP ${response.status}`);
  }
  return response.json();
}

async function preflight(env = process.env) {
  const packageJson = readPackage();
  const lock = readLock();
  const targetVersion = env.npm_new_version;
  const oldVersion = env.npm_old_version;

  if (!isVersion(targetVersion) || !isVersion(oldVersion)) {
    throw new Error("release preflight must run from npm version");
  }
  if (packageJson.version !== oldVersion || lock.version !== oldVersion || lock.packages?.[""]?.version !== oldVersion) {
    throw new Error("package.json and package-lock.json versions are not aligned with npm_old_version");
  }
  if (capture("git", ["branch", "--show-current"]) !== "develop") {
    throw new Error("automatic releases must run from the develop branch");
  }
  if (capture("git", ["status", "--porcelain"])) {
    throw new Error("automatic releases require a clean working tree");
  }

  run("git", ["fetch", "--quiet", "origin", "develop"]);
  if (!succeeds("git", ["merge-base", "--is-ancestor", "origin/develop", "HEAD"])) {
    throw new Error("origin/develop contains commits that are not in the local branch");
  }

  const tag = `v${targetVersion}`;
  if (succeeds("git", ["show-ref", "--verify", "--quiet", `refs/tags/${tag}`])) {
    throw new Error(`tag ${tag} already exists`);
  }
  if (succeeds("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`])) {
    throw new Error(`remote tag ${tag} already exists`);
  }

  const releaseEnv = loadReleaseEnvironment(env);
  const token = releaseEnv.GH_TOKEN || releaseEnv.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GH_TOKEN is required for release preflight");
  }

  const { owner, repo } = repositoryInfo(packageJson);
  const repository = await githubRequest(`/repos/${owner}/${repo}`, token);
  if (!repository.permissions?.push) {
    throw new Error("the configured GitHub token cannot push to the release repository");
  }
  const releases = await githubRequest(`/repos/${owner}/${repo}/releases?per_page=100`, token);
  if (releases.some((release) => release.tag_name === tag)) {
    throw new Error(`GitHub release ${tag} already exists`);
  }

  console.log(`Release preflight passed for ${tag}.`);
}

function validateTag(env = process.env) {
  const packageJson = readPackage();
  const expectedTag = `v${packageJson.version}`;
  const actualTag = env.GITHUB_REF_NAME || capture("git", ["describe", "--tags", "--exact-match"]);
  if (actualTag !== expectedTag) {
    throw new Error(`release tag ${actualTag} does not match package version ${packageJson.version}`);
  }
  return expectedTag;
}

function pushVersion(env = process.env) {
  const tag = validateTag({ ...env, GITHUB_REF_NAME: undefined });
  if (capture("git", ["status", "--porcelain"])) {
    throw new Error("version commit must leave a clean working tree before push");
  }
  const tagCommit = capture("git", ["rev-list", "-n", "1", tag]);
  const head = capture("git", ["rev-parse", "HEAD"]);
  if (tagCommit !== head) {
    throw new Error(`${tag} does not point to HEAD`);
  }

  run("git", ["fetch", "--quiet", "origin", "develop"]);
  if (!succeeds("git", ["merge-base", "--is-ancestor", "origin/develop", "HEAD"])) {
    throw new Error("origin/develop changed during release; rebase before retrying");
  }
  run("git", ["push", "--atomic", "origin", "HEAD:refs/heads/develop", `refs/tags/${tag}`]);
  console.log(`${tag} pushed. GitHub Actions will build and publish all platform assets.`);
}

function packageCurrentPlatform(platform = process.platform) {
  run(npmCommand, ["run", `package:${platformKey(platform)}`]);
}

function bumpVersion(requested = "patch") {
  if (!["patch", "minor", "major"].includes(requested) && !isVersion(requested)) {
    throw new Error(`invalid release version: ${requested}`);
  }
  run(npmCommand, ["version", requested]);
}

async function main() {
  const mode = process.argv[2];
  if (mode === "bump") {
    bumpVersion(process.argv[3] || "patch");
    return;
  }
  if (mode === "package") {
    packageCurrentPlatform();
    return;
  }
  if (mode === "preflight") {
    await preflight();
    return;
  }
  if (mode === "push") {
    pushVersion();
    return;
  }
  if (mode === "validate-tag") {
    console.log(validateTag());
    return;
  }
  throw new Error(`unknown release harness mode: ${mode || "(missing)"}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  bumpVersion,
  isVersion,
  loadReleaseEnvironment,
  packageCurrentPlatform,
  platformKey,
  repositoryInfo,
  validateTag
};
