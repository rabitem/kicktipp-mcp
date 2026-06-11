# kicktipp-mcp

TypeScript MCP server and CLI for [Kicktipp](https://www.kicktipp.de/): schedules, standings, scoring rules, visible Tippverteilung, explainable tip research, agent councils, odds-based predictions, and dry-run-first tip submission.

## Design Goals

- Direct HTTP core by default; no browser dependency for normal reads/submits.
- Public read tools work without credentials where Kicktipp exposes the page.
- Credentialed operations use environment variables or a saved session cookie file, not tool arguments.
- `submit_tips` is gated twice: `dryRun` defaults to `true`, and real writes require `confirmation="SUBMIT_TIPS"`.
- Form indexes are treated separately from Kicktipp `tippspielId` match IDs.
- Agent councils return evidence, assumptions, and uncertainty with recommendations.

## Setup

```bash
npm install
npm run build
```

Optional `.env` values:

```bash
KICKTIPP_BASE_URL=https://www.kicktipp.de
KICKTIPP_EMAIL=you@example.com
KICKTIPP_PASSWORD=secret
KICKTIPP_LOGIN_COOKIE=
KICKTIPP_DEFAULT_COMMUNITY=bundesliga-tippspiel
KICKTIPP_KEYCHAIN=true
KICKTIPP_KEYCHAIN_SERVICE=kicktipp
KICKTIPP_KEYCHAIN_ACCOUNT=
KICKTIPP_KEYCHAIN_HOST=www.kicktipp.de
```

Use `KICKTIPP_EMAIL`/`KICKTIPP_PASSWORD`, `KICKTIPP_LOGIN_COOKIE`, or macOS Keychain for account-specific tools. Public tools only need a community slug.

If Kicktipp is already logged in through Chrome on macOS, import the encrypted Chrome cookies into the local MCP session file:

```bash
node dist/ktipp.js import-chrome-session
```

Use `--profile "/path/to/Chrome/Profile"` for non-default Chrome profiles. The import reads only Kicktipp cookies and writes the configured session file with `0600` permissions.

## Client Setup

[![Claude Code](https://img.shields.io/badge/Claude%20Code-stdio%20MCP-191919)](#claude-code)
[![Codex](https://img.shields.io/badge/Codex-stdio%20MCP-111827)](#codex)
[![Claude Desktop](https://img.shields.io/badge/Claude%20Desktop-MCPB%20bundle-191919)](#claude-desktop)

### Claude Code

```bash
claude mcp add kicktipp -- npx -y --package github:rabitem/kicktipp-mcp kicktipp-mcp
```

This installs and runs the MCP server from the public GitHub repo. It requires Node.js 22 or newer.

### Codex

```bash
codex mcp add kicktipp -- npx -y --package github:rabitem/kicktipp-mcp kicktipp-mcp
```

This uses the same GitHub-backed package install as Claude Code.

### Claude Desktop

Claude Desktop's quick-install path for local MCP servers is an `.mcpb` Desktop Extension bundle with an install dialog and bundle icon.

Build the bundle locally:

```bash
npm run mcpb:pack
```

Then open `release/kicktipp-mcp-v<version>.mcpb` with Claude Desktop.

Release builds attach the `.mcpb` bundle and SHA-256 checksum to [GitHub Releases](https://github.com/rabitem/kicktipp-mcp/releases). If you prefer manual local config, run:

```bash
node dist/mcp.js
```

```json
{
  "mcpServers": {
    "kicktipp": {
      "command": "node",
      "args": ["/Users/rabitem/Documents/kicktipp-mcp/dist/mcp.js"],
      "env": {
        "KICKTIPP_DEFAULT_COMMUNITY": "bundesliga-tippspiel"
      }
    }
  }
}
```

## MCP Tools

- `get_status`
- `list_communities`
- `get_schedule`
- `get_standings`
- `get_scoring_rules`
- `get_tip_distribution`
- `get_matchday_form`
- `predict_from_odds`
- `build_tip_research`
- `run_tip_council`
- `submit_tips`

## Agent Councils

`run_tip_council` runs these councils:

- `market`: odds-derived expected-points scoreline.
- `crowd`: visible Kicktipp Tippverteilung.
- `table`: standings/rank/points context.
- `rules`: scoring-rule incentives and dynamic point ranges.
- `contrarian`: high-variance value when market probability exceeds crowd share.
- `consensus`: weighted final recommendation.

Risk profiles: `conservative`, `balanced`, `aggressive`, `chasing`, `leading`.

## CLI

```bash
npm run build
node dist/ktipp.js status
node dist/ktipp.js import-chrome-session
node dist/ktipp.js schedule bundesliga-tippspiel --json
node dist/ktipp.js research bundesliga-tippspiel --matchday 1 --json
node dist/ktipp.js council bundesliga-tippspiel --risk balanced --json
```

Dry-run submit:

```bash
node dist/ktipp.js submit my-tipprunde --scores "0=2:1,1=1:1"
```

Real submit after reviewing the diff:

```bash
node dist/ktipp.js submit my-tipprunde --scores "0=2:1,1=1:1" --yes
```

## Development

```bash
npm run typecheck
npm test
npm run build
```
