const { createHash } = require("node:crypto");
const { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } = require("node:fs");
const { basename, isAbsolute, join, relative, resolve, sep } = require("node:path");

const root = resolve(__dirname, "..");

function safeAssetName(name) {
  return name.replace(/\s+/g, "-");
}

function stripYamlValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseUpdateFeed(contents) {
  const version = contents.match(/^version:\s*(.+)$/m)?.[1];
  const files = [];
  let current = null;

  for (const line of contents.split(/\r?\n/)) {
    const url = line.match(/^\s*-\s+url:\s*(.+)$/);
    if (url) {
      if (current) {
        files.push(current);
      }
      current = { url: stripYamlValue(url[1]) };
      continue;
    }
    if (!current) {
      continue;
    }
    const sha512 = line.match(/^\s+sha512:\s*(.+)$/);
    if (sha512) {
      current.sha512 = stripYamlValue(sha512[1]);
      continue;
    }
    const size = line.match(/^\s+size:\s*(\d+)$/);
    if (size) {
      current.size = Number(size[1]);
    }
  }
  if (current) {
    files.push(current);
  }

  return {
    version: stripYamlValue(version ?? ""),
    files
  };
}

function sha512Base64(filePath) {
  return createHash("sha512").update(readFileSync(filePath)).digest("base64");
}

function assetSelection(platform, names, version, productName) {
  if (platform === "win") {
    return [
      `${productName} Setup ${version}.exe`,
      `${productName} Setup ${version}.exe.blockmap`,
      `${productName} ${version}.exe`,
      "latest.yml"
    ];
  }

  const versionFiles = names.filter((name) => name.includes(version));
  if (platform === "mac") {
    const selected = versionFiles.filter((name) => /(?:\.dmg(?:\.blockmap)?|-mac\.zip(?:\.blockmap)?)$/.test(name));
    return [...selected, "latest-mac.yml"];
  }
  if (platform === "linux") {
    const selected = versionFiles.filter((name) => /\.(?:AppImage|deb|rpm|blockmap)$/.test(name));
    return [...selected, "latest-linux.yml"];
  }
  throw new Error(`unsupported asset platform: ${platform}`);
}

function assertPlatformAssets(platform, names) {
  const has = (pattern) => names.some((name) => pattern.test(name));
  const hasWindowsPortable = names.some((name) => name.endsWith(".exe") && !/-Setup-.*\.exe$/.test(name));
  if (
    platform === "win" &&
    (!has(/-Setup-.*\.exe$/) || !hasWindowsPortable || !has(/-Setup-.*\.exe\.blockmap$/) || !has(/latest\.yml$/))
  ) {
    throw new Error("Windows release requires installer, blockmap, portable executable, and latest.yml");
  }
  if (platform === "mac" && (!has(/\.dmg$/) || !has(/-mac\.zip$/) || !has(/latest-mac\.yml$/))) {
    throw new Error("macOS release requires dmg, zip, and latest-mac.yml");
  }
  if (platform === "linux" && (!has(/\.AppImage$/) || !has(/\.deb$/) || !has(/latest-linux\.yml$/))) {
    throw new Error("Linux release requires AppImage, deb, and latest-linux.yml");
  }
}

function isPathWithin(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return Boolean(pathFromParent) && !isAbsolute(pathFromParent) && pathFromParent !== ".." && !pathFromParent.startsWith(`..${sep}`);
}

function assertSafeStagingPath(outputDirectory, stagingDirectory, releaseDirectory = resolve(root, "release")) {
  const output = resolve(outputDirectory);
  const staging = resolve(stagingDirectory);
  const releaseRoot = resolve(releaseDirectory);
  if (!isPathWithin(releaseRoot, staging)) {
    throw new Error(`staging directory must be a child of ${releaseRoot}`);
  }
  if (staging === output || isPathWithin(staging, output)) {
    throw new Error("staging directory must not equal or contain the build output directory");
  }
  return staging;
}

function stageAssets(platform, outputDirectory, stagingDirectory) {
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const version = packageJson.version;
  const productName = packageJson.build.productName;
  const output = resolve(outputDirectory);
  const staging = resolve(stagingDirectory);
  assertSafeStagingPath(output, staging);
  const names = readdirSync(output).filter((name) => statSync(join(output, name)).isFile());
  const selected = [...new Set(assetSelection(platform, names, version, productName))];

  for (const name of selected) {
    if (!names.includes(name)) {
      throw new Error(`missing ${platform} release asset: ${name}`);
    }
  }

  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  for (const name of selected) {
    copyFileSync(join(output, name), join(staging, safeAssetName(name)));
  }

  const stagedNames = readdirSync(staging);
  assertPlatformAssets(platform, stagedNames);
  const feedName = platform === "win" ? "latest.yml" : `latest-${platform}.yml`;
  const feed = parseUpdateFeed(readFileSync(join(staging, feedName), "utf8"));
  if (feed.version !== version || feed.files.length === 0) {
    throw new Error(`${feedName} does not describe version ${version}`);
  }
  for (const entry of feed.files) {
    const assetPath = join(staging, basename(entry.url));
    if (!stagedNames.includes(basename(entry.url))) {
      throw new Error(`${feedName} references missing asset ${entry.url}`);
    }
    if (entry.size !== statSync(assetPath).size || entry.sha512 !== sha512Base64(assetPath)) {
      throw new Error(`${feedName} metadata does not match ${entry.url}`);
    }
  }

  console.log(`Staged ${stagedNames.length} verified ${platform} assets for v${version}.`);
  return stagedNames;
}

if (require.main === module) {
  try {
    const [, , platform, outputDirectory, stagingDirectory] = process.argv;
    if (!platform || !outputDirectory || !stagingDirectory) {
      throw new Error("usage: stage-release-assets <win|mac|linux> <output-directory> <staging-directory>");
    }
    stageAssets(platform, outputDirectory, stagingDirectory);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  assertPlatformAssets,
  assertSafeStagingPath,
  assetSelection,
  parseUpdateFeed,
  safeAssetName,
  stageAssets
};
