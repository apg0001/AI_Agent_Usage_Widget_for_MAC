const { createHash } = require("node:crypto");
const { Buffer } = require("node:buffer");
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertCompleteAssetSet(names, version) {
  const unique = new Set(names);
  if (unique.size !== names.length) {
    throw new Error("release asset names must be unique across platforms");
  }

  const requiredFeeds = ["latest.yml", "latest-mac.yml", "latest-linux.yml"];
  for (const feed of requiredFeeds) {
    if (!unique.has(feed)) {
      throw new Error(`release is missing ${feed}`);
    }
  }

  const has = (pattern) => names.some((name) => pattern.test(name));
  const escapedVersion = version.replace(/\./g, "\\.");
  if (
    !has(new RegExp(`-Setup-${escapedVersion}\\.exe$`)) ||
    !has(new RegExp(`^(?!.*-Setup-).*-${escapedVersion}\\.exe$`))
  ) {
    throw new Error("release is missing Windows installer or portable executable");
  }
  if (!has(new RegExp(`-Setup-${escapedVersion}\\.exe\\.blockmap$`))) {
    throw new Error("release is missing the Windows installer blockmap");
  }
  if (!has(new RegExp(`${escapedVersion}.*\\.dmg$`)) || !has(new RegExp(`${escapedVersion}.*-mac\\.zip$`))) {
    throw new Error("release is missing macOS dmg or zip");
  }
  if (!has(new RegExp(`${escapedVersion}.*\\.AppImage$`)) || !has(new RegExp(`${escapedVersion}.*\\.deb$`))) {
    throw new Error("release is missing Linux AppImage or deb");
  }

  for (const name of names.filter((item) => !item.startsWith("latest"))) {
    if (!name.includes(version)) {
      throw new Error(`release asset does not contain version ${version}: ${name}`);
    }
  }
}

function localAssets(directory, version) {
  const rootDirectory = resolve(directory);
  const names = readdirSync(rootDirectory)
    .filter((name) => statSync(join(rootDirectory, name)).isFile())
    .sort();
  assertCompleteAssetSet(names, version);
  return names.map((name) => {
    const filePath = join(rootDirectory, name);
    const data = readFileSync(filePath);
    return { name, filePath, data, size: data.length, digest: sha256(data) };
  });
}

function githubContext(env = process.env) {
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const [owner, repo] = (env.GITHUB_REPOSITORY || "").split("/");
  const token = env.GITHUB_TOKEN;
  const tag = env.GITHUB_REF_NAME;
  if (!owner || !repo || !token || !tag) {
    throw new Error("GITHUB_REPOSITORY, GITHUB_TOKEN, and GITHUB_REF_NAME are required");
  }
  if (tag !== `v${packageJson.version}`) {
    throw new Error(`tag ${tag} does not match package version ${packageJson.version}`);
  }
  return { owner, repo, token, tag, version: packageJson.version };
}

async function request(url, token, options = {}) {
  const response = await globalThis.fetch(url, {
    ...options,
    redirect: "follow",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "GigaCharge-release-publisher",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub request failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function apiUrl(owner, repo, pathname) {
  return `https://api.github.com/repos/${owner}/${repo}${pathname}`;
}

async function releaseForTag(context) {
  const releases = await request(apiUrl(context.owner, context.repo, "/releases?per_page=100"), context.token);
  return releases.find((release) => release.tag_name === context.tag) ?? null;
}

async function remoteDigest(asset, context) {
  if (typeof asset.digest === "string" && asset.digest.startsWith("sha256:")) {
    return asset.digest.slice("sha256:".length);
  }
  const response = await globalThis.fetch(asset.url, {
    redirect: "follow",
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${context.token}`,
      "User-Agent": "GigaCharge-release-publisher",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!response.ok) {
    throw new Error(`could not verify uploaded asset ${asset.name}: HTTP ${response.status}`);
  }
  return sha256(Buffer.from(await response.arrayBuffer()));
}

async function verifyRemoteAssets(release, expected, context) {
  const remote = await request(
    apiUrl(context.owner, context.repo, `/releases/${release.id}/assets?per_page=100`),
    context.token
  );
  const expectedNames = expected.map((asset) => asset.name).sort();
  const remoteNames = remote.map((asset) => asset.name).sort();
  if (JSON.stringify(remoteNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`remote release assets do not match the verified set: ${remoteNames.join(", ")}`);
  }

  for (const expectedAsset of expected) {
    const remoteAsset = remote.find((asset) => asset.name === expectedAsset.name);
    if (!remoteAsset || remoteAsset.size !== expectedAsset.size) {
      throw new Error(`remote release asset size mismatch: ${expectedAsset.name}`);
    }
    if (await remoteDigest(remoteAsset, context) !== expectedAsset.digest) {
      throw new Error(`remote release asset digest mismatch: ${expectedAsset.name}`);
    }
  }
}

async function publishRelease(directory, env = process.env) {
  const context = githubContext(env);
  const assets = localAssets(directory, context.version);
  let release = await releaseForTag(context);

  if (release && !release.draft) {
    await verifyRemoteAssets(release, assets, context);
    console.log(`${context.tag} is already published with the verified asset set.`);
    return release.html_url;
  }
  if (release?.prerelease) {
    throw new Error(`${context.tag} exists as a prerelease and will not be overwritten`);
  }

  if (!release) {
    release = await request(apiUrl(context.owner, context.repo, "/releases"), context.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: context.tag,
        name: context.version,
        draft: true,
        prerelease: false,
        generate_release_notes: true
      })
    });
  }

  const existingAssets = await request(
    apiUrl(context.owner, context.repo, `/releases/${release.id}/assets?per_page=100`),
    context.token
  );
  for (const asset of existingAssets) {
    await request(apiUrl(context.owner, context.repo, `/releases/assets/${asset.id}`), context.token, {
      method: "DELETE"
    });
  }

  const uploadBase = release.upload_url.slice(0, release.upload_url.indexOf("{"));
  for (const asset of assets) {
    await request(`${uploadBase}?name=${encodeURIComponent(asset.name)}`, context.token, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(asset.size)
      },
      body: asset.data
    });
  }

  await verifyRemoteAssets(release, assets, context);
  release = await request(apiUrl(context.owner, context.repo, `/releases/${release.id}`), context.token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft: false, prerelease: false, name: context.version })
  });
  if (release.draft || release.prerelease) {
    throw new Error(`${context.tag} was not published as a stable release`);
  }

  console.log(`Published ${context.tag}: ${release.html_url}`);
  return release.html_url;
}

if (require.main === module) {
  publishRelease(process.argv[2] || "release/assets").catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  assertCompleteAssetSet,
  githubContext,
  localAssets,
  publishRelease,
  sha256
};
