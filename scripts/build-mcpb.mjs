import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
const buildRoot = path.join(rootDir, ".mcpb-build");
const bundleDir = path.join(buildRoot, "kicktipp-mcp");
const releaseDir = path.join(rootDir, "release");
const outputFile = path.join(releaseDir, `kicktipp-mcp-v${packageJson.version}.mcpb`);
const mcpbPackage = "@anthropic-ai/mcpb@2.1.2";

await rm(buildRoot, { recursive: true, force: true });
await mkdir(path.join(bundleDir, "server"), { recursive: true });
await mkdir(releaseDir, { recursive: true });
await rm(outputFile, { force: true });

await cp(path.join(rootDir, "dist"), path.join(bundleDir, "server"), { recursive: true });
await cp(path.join(rootDir, "README.md"), path.join(bundleDir, "README.md"));
await cp(path.join(rootDir, "LICENSE"), path.join(bundleDir, "LICENSE"));
await cp(path.join(rootDir, "package-lock.json"), path.join(bundleDir, "package-lock.json"));

await writeFile(path.join(bundleDir, "package.json"), `${JSON.stringify(
  {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    type: packageJson.type,
    main: "server/mcp.js",
    license: packageJson.license,
    dependencies: packageJson.dependencies,
    engines: packageJson.engines,
  },
  null,
  2,
)}\n`);

await writeFile(path.join(bundleDir, "manifest.json"), `${JSON.stringify(createManifest(packageJson), null, 2)}\n`);
await writeFile(path.join(bundleDir, "icon.png"), createIconPng(512, 512));

execFileSync("npm", ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: bundleDir,
  stdio: "inherit",
});

execFileSync("npx", ["-y", mcpbPackage, "validate", bundleDir], {
  cwd: rootDir,
  stdio: "inherit",
});

execFileSync("npx", ["-y", mcpbPackage, "pack", bundleDir, outputFile], {
  cwd: rootDir,
  stdio: "inherit",
});

const artifact = await readFile(outputFile);
const checksum = createHash("sha256").update(artifact).digest("hex");
await writeFile(`${outputFile}.sha256`, `${checksum}  ${path.basename(outputFile)}\n`);

console.log(`Created ${path.relative(rootDir, outputFile)}`);
console.log(`SHA256 ${checksum}`);

function createManifest(pkg) {
  return {
    manifest_version: "0.3",
    name: "kicktipp-mcp",
    display_name: "Kicktipp MCP",
    version: pkg.version,
    description: "Kicktipp schedules, standings, tip research, agent councils, and dry-run-first tip submission.",
    long_description:
      "Local MCP server for Kicktipp communities. It supports public schedule and standings reads, credentialed session or Keychain-backed account tools, explainable tip research, agent councils, and guarded tip submission.",
    author: {
      name: "rabitem",
      url: "https://github.com/rabitem",
    },
    repository: {
      type: "git",
      url: "https://github.com/rabitem/kicktipp-mcp",
    },
    homepage: "https://github.com/rabitem/kicktipp-mcp",
    documentation: "https://github.com/rabitem/kicktipp-mcp#readme",
    support: "https://github.com/rabitem/kicktipp-mcp/issues",
    icon: "icon.png",
    server: {
      type: "node",
      entry_point: "server/mcp.js",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/server/mcp.js"],
        env: {
          KICKTIPP_BASE_URL: "${user_config.base_url}",
          KICKTIPP_DEFAULT_COMMUNITY: "${user_config.default_community}",
          KICKTIPP_EMAIL: "${user_config.email}",
          KICKTIPP_PASSWORD: "${user_config.password}",
          KICKTIPP_LOGIN_COOKIE: "${user_config.login_cookie}",
          KICKTIPP_KEYCHAIN: "${user_config.use_keychain}",
          KICKTIPP_KEYCHAIN_SERVICE: "${user_config.keychain_service}",
          KICKTIPP_KEYCHAIN_ACCOUNT: "${user_config.keychain_account}",
          KICKTIPP_KEYCHAIN_HOST: "${user_config.keychain_host}",
        },
      },
    },
    tools: [
      { name: "get_status", description: "Inspect server configuration and authentication state." },
      { name: "list_communities", description: "List available Kicktipp communities from a configured account." },
      { name: "get_schedule", description: "Read Kicktipp match schedules." },
      { name: "get_standings", description: "Read Kicktipp standings." },
      { name: "get_scoring_rules", description: "Read scoring rules for a community." },
      { name: "get_tip_distribution", description: "Read visible Kicktipp tip distribution." },
      { name: "get_matchday_form", description: "Read the matchday tip form." },
      { name: "predict_from_odds", description: "Create odds-derived scoreline recommendations." },
      { name: "build_tip_research", description: "Collect research evidence for tip creation." },
      { name: "run_tip_council", description: "Run specialist councils over available tip evidence." },
      { name: "submit_tips", description: "Dry-run or explicitly confirmed Kicktipp tip submission." },
    ],
    keywords: ["kicktipp", "mcp", "football", "soccer", "tips", "prediction"],
    license: pkg.license,
    privacy_policies: ["https://www.kicktipp.de/info/datenschutz"],
    compatibility: {
      claude_desktop: ">=0.10.0",
      platforms: ["darwin", "win32", "linux"],
      runtimes: {
        node: ">=22.0.0",
      },
    },
    user_config: {
      default_community: {
        type: "string",
        title: "Default Kicktipp Community",
        description: "Community slug used when a tool call does not provide one.",
        default: "bundesliga-tippspiel",
        required: false,
      },
      base_url: {
        type: "string",
        title: "Kicktipp Base URL",
        description: "Kicktipp host to use.",
        default: "https://www.kicktipp.de",
        required: false,
      },
      email: {
        type: "string",
        title: "Kicktipp Email",
        description: "Optional login email for account-specific tools.",
        sensitive: true,
        required: false,
      },
      password: {
        type: "string",
        title: "Kicktipp Password",
        description: "Optional login password for account-specific tools.",
        sensitive: true,
        required: false,
      },
      login_cookie: {
        type: "string",
        title: "Kicktipp Login Cookie",
        description: "Optional pre-authenticated Kicktipp cookie.",
        sensitive: true,
        required: false,
      },
      use_keychain: {
        type: "boolean",
        title: "Use macOS Keychain",
        description: "Read Kicktipp credentials from macOS Keychain when available.",
        default: true,
        required: false,
      },
      keychain_service: {
        type: "string",
        title: "Keychain Service",
        description: "Service name for the Kicktipp password item.",
        default: "kicktipp",
        required: false,
      },
      keychain_account: {
        type: "string",
        title: "Keychain Account",
        description: "Optional account name for the Kicktipp password item.",
        required: false,
      },
      keychain_host: {
        type: "string",
        title: "Keychain Host",
        description: "Internet-password host used when reading from macOS Keychain.",
        default: "www.kicktipp.de",
        required: false,
      },
    },
  };
}

function createIconPng(width, height) {
  const bytesPerPixel = 4;
  const raw = Buffer.alloc((width * bytesPerPixel + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const row = y * (width * bytesPerPixel + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * bytesPerPixel;
      const scale = width / 128;
      const isStripe = Math.floor(x / (16 * scale)) % 2 === 0;
      const grass = isStripe ? [28, 126, 72] : [20, 105, 61];
      const center = (x - width / 2) ** 2 + (y - height / 2) ** 2;
      const pitchLine =
        Math.abs(x - width / 2) <= scale ||
        Math.abs(y - height / 2) <= scale ||
        Math.abs(center - (38 * scale) ** 2) < 130 * scale * scale;
      const kStem = x >= 35 * scale && x <= 45 * scale && y >= 31 * scale && y <= 97 * scale;
      const kUpper =
        Math.abs(y - (-1.2 * x + 104 * scale)) <= 5 * scale &&
        x >= 45 * scale &&
        x <= 84 * scale &&
        y >= 31 * scale &&
        y <= 64 * scale;
      const kLower =
        Math.abs(y - (1.15 * x + 9 * scale)) <= 5 * scale &&
        x >= 45 * scale &&
        x <= 88 * scale &&
        y >= 64 * scale &&
        y <= 99 * scale;

      const color = kStem || kUpper || kLower ? [247, 181, 45] : pitchLine ? [245, 247, 250] : grass;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = 255;
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuffer, data]);
  return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc32(crcInput))]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
