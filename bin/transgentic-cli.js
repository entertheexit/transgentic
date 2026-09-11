#!/usr/bin/env node
import http from 'http';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import os from 'os';

// 1. Resolve Auth Token from CLI flag, env, or local config
function resolveAuthToken(flagToken) {
  if (flagToken) return flagToken;
  if (process.env.TRANSGENTIC_TOKEN) return process.env.TRANSGENTIC_TOKEN;

  // Check current working directory
  const localConfig = path.join(process.cwd(), 'client_auth.json');
  try {
    if (fs.existsSync(localConfig)) {
      const data = JSON.parse(fs.readFileSync(localConfig, 'utf-8'));
      if (data && data.masterToken) return data.masterToken;
    }
  } catch {}

  // Check user OS app data directory
  const homeDir = os.homedir();
  const candidates = [
    path.join(homeDir, 'Library', 'Application Support', 'transgentic', 'client_auth.json'),
    path.join(homeDir, 'AppData', 'Roaming', 'transgentic', 'client_auth.json'),
    path.join(homeDir, '.config', 'transgentic', 'client_auth.json'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        const data = JSON.parse(fs.readFileSync(c, 'utf-8'));
        if (data && data.masterToken) return data.masterToken;
      }
    } catch {}
  }
  return '';
}

// 2. Parse Command Line Arguments
const rawArgs = process.argv.slice(2);

let mode = undefined;
let provider = undefined;
let model = undefined;
let workspaceId;
let disallowEditing = false;
let disallowCommands = false;
let port = parseInt(process.env.TRANSGENTIC_PORT || '58420', 10);
let token = '';
let isJson = false;
let subcommand = null;
let promptText = '';

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  } else if (arg === '--mode' || arg === '-m') {
    mode = rawArgs[++i];
  } else if (arg === '--provider' || arg === '-p') {
    provider = rawArgs[++i];
  } else if (arg === '--model') {
    model = rawArgs[++i];
  } else if (arg === '--workspace') {
    workspaceId = rawArgs[++i];
  } else if (arg === '--disallow-editing') {
    disallowEditing = true;
  } else if (arg === '--disallow-commands') {
    disallowCommands = true;
  } else if (arg === '--port') {
    port = parseInt(rawArgs[++i], 10);
  } else if (arg === '--token' || arg === '-t') {
    token = rawArgs[++i];
  } else if (arg === '--json') {
    isJson = true;
  } else if (!subcommand && ['prompt', 'image', 'video', 'audio', 'music', 'status'].includes(arg)) {
    subcommand = arg;
  } else if (!promptText) {
    promptText = arg;
  } else {
    promptText += ' ' + arg;
  }
}

token = resolveAuthToken(token);
const baseUrl = `http://127.0.0.1:${port}`;

function printHelp() {
  process.stdout.write(`
Transgentic CLI & MCP Stdio Bridge

USAGE:
  transgentic-cli [flags]                           Start stdio MCP server bridge (for Cursor, Antigravity, custom apps)
  transgentic-cli prompt "<text>" [flags]           Run direct prompt with auto-routing or specified mode
  transgentic-cli image "<text>" [flags]            Generate image via Grok, ChatGPT, or Gemini
  transgentic-cli video "<text>" [flags]            Generate video via Grok or Gemini
  transgentic-cli audio "<text>" [flags]            Generate audio/music via Gemini
  transgentic-cli status [flags]                    Query system health, rate limits, and model registry

FLAGS:
  -m, --mode <mode>        Task mode: general | writing | coding | image | video | audio
  -p, --provider <name>    Provider: chatgpt | claude | gemini | grok | cli_codex | cli_claude_code | cli_antigravity | cli_grok
      --model <modelId>    Specific model ID (e.g. dall-e-3, o1, claude-3-5-sonnet)
      --workspace <id>     Registered CLI workspace with a local MCP grant
      --disallow-editing   Restrict this request to no project editing
      --disallow-commands  Restrict this request to no commands
      --port <number>      Transgentic local gateway port (default: 58420)
  -t, --token <token>      Client auth bearer token (auto-resolved from client_auth.json if omitted)
      --json               Output raw JSON-RPC response
  -h, --help               Show this help message

EXAMPLES:
  # Launch as stdio MCP bridge pre-configured for Storyboard Image generation:
  transgentic-cli --mode image --provider grok

  # Direct image generation from terminal or custom script:
  transgentic-cli image "Storyboard frame 1: Hero standing on a mountain peak at dusk" --provider grok

  # Direct general prompt in coding mode:
  transgentic-cli prompt "Refactor database query to use parameterized statements" --mode coding
\n`);
}

// 3. Direct Command Execution (One-Shot Execution)
if (subcommand) {
  executeDirectCommand();
} else {
  // Stdio MCP Bridge Mode (for IDEs and custom MCP client applications)
  runStdioBridge();
}

async function executeDirectCommand() {
  if (subcommand !== 'status' && !promptText) {
    process.stderr.write(`[Transgentic CLI Error] Missing prompt text for command "${subcommand}".\nRun "transgentic-cli --help" for usage.\n`);
    process.exit(1);
  }

  let toolName = 'prompt_model';
  const toolArgs = { prompt: promptText };

  if (subcommand === 'image') {
    toolName = 'generate_image';
    if (provider) toolArgs.provider = provider;
    if (model) toolArgs.model = model;
  } else if (subcommand === 'video') {
    toolName = 'generate_video';
    if (provider) toolArgs.provider = provider;
    if (model) toolArgs.model = model;
  } else if (subcommand === 'audio' || subcommand === 'music') {
    toolName = 'generate_audio';
    if (provider) toolArgs.provider = provider;
    if (model) toolArgs.model = model;
  } else if (subcommand === 'status') {
    toolName = 'get_status';
  } else {
    if (mode) toolArgs.mode = mode;
    if (provider) toolArgs.provider = provider;
    if (model) toolArgs.model = model;
  }

  if (workspaceId) toolArgs.workspace_id = workspaceId;
  if (disallowEditing) toolArgs.allow_project_editing = false;
  if (disallowCommands) toolArgs.allow_commands = false;
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: toolArgs,
    },
  });

  const queryParams = new URLSearchParams();
  if (token) queryParams.set('token', token);
  if (mode) queryParams.set('mode', mode);
  if (provider) queryParams.set('provider', provider);

  const url = `${baseUrl}/mcp?${queryParams.toString()}`;
  const req = http.request(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    (res) => {
      let respBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        respBody += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(respBody);
          if (isJson) {
            process.stdout.write(JSON.stringify(parsed, null, 2) + '\n');
            process.exit(0);
          }
          if (parsed.error) {
            process.stderr.write(`[Transgentic Error] ${parsed.error.message || JSON.stringify(parsed.error)}\n`);
            process.exit(1);
          }
          const result = parsed.result;
          if (result && Array.isArray(result.content)) {
            for (const item of result.content) {
              if (item.text) {
                process.stdout.write(item.text + '\n');
              }
            }
          } else {
            process.stdout.write(JSON.stringify(result, null, 2) + '\n');
          }
          process.exit(0);
        } catch (err) {
          process.stderr.write(`[Transgentic CLI] Failed to parse response: ${err.message}\nRaw: ${respBody}\n`);
          process.exit(1);
        }
      });
    }
  );

  req.on('error', (err) => {
    process.stderr.write(`[Transgentic CLI Error] Connection to daemon failed on ${baseUrl}: ${err.message}\nIs Transgentic running?\n`);
    process.exit(1);
  });

  req.write(payload);
  req.end();
}

function runStdioBridge() {
  let sseSessionId = null;
  let isConnected = false;

  const queryParams = new URLSearchParams();
  if (token) queryParams.set('token', token);
  if (mode) queryParams.set('mode', mode);
  if (provider) queryParams.set('provider', provider);

  const sseUrl = `${baseUrl}/sse?${queryParams.toString()}`;

  function connectSse() {
    const req = http.get(sseUrl, (res) => {
      if (res.statusCode !== 200) {
        process.stderr.write(`[Transgentic CLI] Failed to connect to SSE on ${sseUrl} (HTTP ${res.statusCode})\n`);
        return;
      }

      isConnected = true;
      res.setEncoding('utf8');

      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          if (!block.trim()) continue;

          if (block.includes('event: endpoint')) {
            const match = block.match(/sessionId=([a-f0-9-]+)/);
            if (match && match[1]) {
              sseSessionId = match[1];
            }
          } else if (block.includes('event: message')) {
            const dataMatch = block.match(/data: (.+)/s);
            if (dataMatch && dataMatch[1]) {
              process.stdout.write(dataMatch[1] + '\n');
            }
          }
        }
      });

      res.on('end', () => {
        isConnected = false;
        setTimeout(connectSse, 2000);
      });
    });

    req.on('error', (err) => {
      process.stderr.write(`[Transgentic CLI] Connection error (${err.message}). Retrying in 2s...\n`);
      isConnected = false;
      setTimeout(connectSse, 2000);
    });
  }

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on('line', (line) => {
    if (!line.trim()) return;

    const sendPayload = () => {
      if (!sseSessionId) {
        setTimeout(sendPayload, 100);
        return;
      }

      const postData = line;
      const msgQueryParams = new URLSearchParams();
      msgQueryParams.set('sessionId', sseSessionId);
      if (token) msgQueryParams.set('token', token);
      if (mode) msgQueryParams.set('mode', mode);
      if (provider) msgQueryParams.set('provider', provider);

      const postReq = http.request(
        `${baseUrl}/messages?${msgQueryParams.toString()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Length': Buffer.byteLength(postData),
          },
        },
        (res) => {
          // Response handled via SSE stream
        }
      );

      postReq.on('error', (err) => {
        process.stderr.write(`[Transgentic CLI] Send error: ${err.message}\n`);
      });

      postReq.write(postData);
      postReq.end();
    };

    sendPayload();
  });

  connectSse();
}
