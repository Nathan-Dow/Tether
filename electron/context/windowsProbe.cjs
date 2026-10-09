// Foreground-window probe for Windows.
//
// Spawning powershell.exe per sample costs ~0.5-1s (mostly Add-Type compile),
// so we keep ONE long-lived PowerShell process that answers line-delimited
// requests on stdin with one JSON line each on stdout. A sample then costs a
// few milliseconds. Pure Node — no Electron imports — so scripts/probe.cjs
// can drive it standalone.
const { spawn } = require('node:child_process');

const READY_TIMEOUT_MS = 10_000;

// NOTE: the here-string terminators ('@) must stay at column 0.
const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class TetherFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@

$friendly = @{}
function Get-Friendly($p) {
  if (-not $friendly.ContainsKey($p.ProcessName)) {
    $d = ''
    try { $d = $p.MainModule.FileVersionInfo.FileDescription } catch {}
    $friendly[$p.ProcessName] = "$d"
  }
  return $friendly[$p.ProcessName]
}

function Out-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}

Out-Line @{ id = 'ready' }

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $parts = $line.Split('|')
  $id = $parts[0]
  try {
    $hwnd = [TetherFg]::GetForegroundWindow()
    $len = [TetherFg]::GetWindowTextLength($hwnd)
    $sb = New-Object System.Text.StringBuilder ($len + 1)
    [void][TetherFg]::GetWindowText($hwnd, $sb, $sb.Capacity)
    $procId = [uint32]0
    [void][TetherFg]::GetWindowThreadProcessId($hwnd, [ref]$procId)

    $name = ''; $desc = ''
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($p) { $name = $p.ProcessName; $desc = Get-Friendly $p }

    $res = @{ id = $id; ok = $true; pid = [int]$procId; process = $name; description = $desc; title = $sb.ToString() }

    if ($parts -contains 'apps') {
      $res.windows = @(Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object {
        @{ pid = $_.Id; process = $_.ProcessName; title = $_.MainWindowTitle }
      })
    }
    Out-Line $res
  } catch {
    Out-Line @{ id = $id; ok = $false; error = $_.Exception.Message }
  }
}
`;

class WindowsProbe {
  constructor({ timeoutMs = 2000 } = {}) {
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.ready = null;
    this.buf = '';
    this.seq = 0;
    this.pending = new Map();
  }

  start() {
    if (this.child) return this.ready;

    const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    this.child = child;
    this.buf = '';

    let markReady;
    let failReady;
    this.ready = new Promise((resolve, reject) => {
      markReady = resolve;
      failReady = reject;
    });
    // Avoid unhandled-rejection noise if nobody is awaiting a dead start.
    this.ready.catch(() => {});
    const readyTimer = setTimeout(() => {
      failReady(new Error('probe did not become ready'));
      this.stop();
    }, READY_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      this.buf += chunk;
      let nl;
      while ((nl = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 'ready') {
          clearTimeout(readyTimer);
          markReady();
          continue;
        }
        const req = this.pending.get(String(msg.id));
        if (!req) continue; // a late answer to a request we already timed out
        this.pending.delete(String(msg.id));
        clearTimeout(req.timer);
        req.resolve(msg);
      }
    });
    child.stderr.on('data', () => {}); // PowerShell noise never reaches the UI
    child.stdin.on('error', () => {}); // EPIPE if the process died mid-write

    const onGone = () => {
      clearTimeout(readyTimer);
      failReady(new Error('probe exited'));
      if (this.child === child) this.child = null;
      this.rejectAll(new Error('probe exited'));
    };
    child.on('exit', onGone);
    child.on('error', onGone);

    return this.ready;
  }

  // Resolves with { ok, pid, process, description, title, windows? }.
  // Rejects on timeout or a dead process; the next call respawns it.
  async probe({ apps = false } = {}) {
    await this.start();
    const child = this.child;
    if (!child) throw new Error('probe not running');

    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('probe timed out'));
        this.stop(); // assume it's wedged; respawn on next call
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(apps ? `${id}|apps\n` : `${id}\n`);
    });
  }

  rejectAll(err) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
  }

  stop() {
    const child = this.child;
    this.child = null;
    this.rejectAll(new Error('probe stopped'));
    if (!child) return;
    try {
      child.stdin.end();
    } catch {}
    child.kill();
  }
}

module.exports = { WindowsProbe };
