#!/usr/bin/env python3
"""
Agent Flight Recorder (AFR) - Professional CLI & Interactive Terminal Workbench
High-performance AI Agent Observability & Tracing CLI.
"""

import argparse
import curses
import json
import os
import pty
import re
import select
import shlex
import shutil
import socket
import subprocess
import sys
import termios
import time
import tty
import uuid
import webbrowser
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

# Terminal Color Definitions (Clean Slate & Modern Truecolor / ANSI)
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
ITALIC = "\033[3m"
UNDERLINE = "\033[4m"

# Palette
C_PRIMARY = "\033[38;5;75m"      # Soft Sky Blue
C_MUTED = "\033[38;5;243m"       # Slate Gray
C_TEXT = "\033[38;5;252m"        # Off-White
C_ACCENT = "\033[38;5;141m"      # Subtle Violet (LLM)
C_TOOL = "\033[38;5;215m"        # Warm Amber (Tool)
C_SUCCESS = "\033[38;5;78m"      # Mint Emerald
C_ERROR = "\033[38;5;203m"       # Soft Coral / Red
C_BG_DARK = "\033[48;5;236m"

PACKAGE_ROOT = os.path.dirname(os.path.realpath(__file__))
FRONTEND_DIR = os.path.join(PACKAGE_ROOT, "frontend")
UI_PORT = 3043
UI_URL = f"http://localhost:{UI_PORT}"

def is_ui_running(port: int = UI_PORT) -> bool:
    """Checks whether the web workbench server is active on port."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.3)
            return s.connect_ex(("127.0.0.1", port)) == 0
    except Exception:
        return False

def ensure_ui_running(open_browser: bool = False, verbose: bool = False) -> bool:
    """Ensures Next.js Web Workbench is running in background. Spawns daemon if needed."""
    if is_ui_running(UI_PORT):
        if verbose:
            print(f"\n{C_SUCCESS}✓ Web UI is active at {BOLD}{UI_URL}{RESET}\n")
        if open_browser:
            webbrowser.open(UI_URL)
        return True

    if not os.path.exists(FRONTEND_DIR):
        if verbose:
            print(f"\n{C_ERROR}Frontend directory not found at {FRONTEND_DIR}{RESET}\n")
        return False

    if verbose:
        print(f"\n{C_PRIMARY}● Starting Agent Flight Recorder Web Workbench on {UI_URL}...{RESET}")

    try:
        npm_bin = shutil.which("npm") or "/Users/AndresQO/.local/bin/npm" or "/usr/local/bin/npm" or "npm"

        log_dir = os.path.join(os.path.expanduser("~"), ".afr")
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, "web_server.log")

        with open(log_file, "a") as f_out:
            subprocess.Popen(
                [npm_bin, "run", "dev"],
                cwd=FRONTEND_DIR,
                stdout=f_out,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )

        # Poll until ready (up to 4 seconds)
        for _ in range(40):
            time.sleep(0.1)
            if is_ui_running(UI_PORT):
                if verbose:
                    print(f"{C_SUCCESS}✓ Web UI is live at {BOLD}{UI_URL}{RESET}\n")
                if open_browser:
                    webbrowser.open(UI_URL)
                return True

        if verbose:
            print(f"{C_SUCCESS}✓ Web UI server booting in background at {UI_URL}{RESET}\n")
        if open_browser:
            webbrowser.open(UI_URL)
        return True
    except Exception as e:
        if verbose:
            print(f"\n{C_ERROR}Failed to launch Web UI: {e}{RESET}\n")
        return False

def cmd_ui(args):
    """Starts and opens the Web Workbench in the default browser."""
    print(f"{BOLD}{C_PRIMARY}🛩️  Agent Flight Recorder Web Workbench{RESET}")
    ensure_ui_running(open_browser=True, verbose=True)

def get_storage_path() -> str:
    """Resolves the nearest .afr telemetry store or defaults to current workspace."""
    curr = os.path.abspath(os.getcwd())
    while curr and curr != "/":
        candidate = os.path.join(curr, ".afr", "traces.json")
        if os.path.exists(candidate):
            return candidate
        if os.path.exists(os.path.join(curr, ".git")):
            return os.path.join(curr, ".afr", "traces.json")
        parent = os.path.dirname(curr)
        if parent == curr:
            break
        curr = parent
    return os.path.join(os.getcwd(), ".afr", "traces.json")

def load_traces() -> List[Dict[str, Any]]:
    """Loads all telemetry traces from persistent local store."""
    storage_path = get_storage_path()
    if os.path.exists(storage_path):
        try:
            with open(storage_path, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception:
            pass
    return []

def save_traces(traces: List[Dict[str, Any]]) -> None:
    """Saves telemetry traces to persistent local store."""
    storage_path = get_storage_path()
    os.makedirs(os.path.dirname(storage_path), exist_ok=True)
    with open(storage_path, "w") as f:
        json.dump(traces, f, indent=2)

def find_trace(identifier: str) -> Optional[Dict[str, Any]]:
    """Finds trace by exact ID or prefix match."""
    traces = load_traces()
    if not traces:
        return None
    if not identifier:
        return traces[0]
    identifier = identifier.strip().lower()
    for t in traces:
        if t.get("id", "").lower().startswith(identifier):
            return t
        if identifier in t.get("name", "").lower():
            return t
    return None

def format_latency(ms: float) -> str:
    """Formats millisecond durations with clean readability."""
    if ms is None:
        return "—"
    if ms < 0.001:
        return "<1µs"
    if ms < 1.0:
        return f"{ms * 1000.0:.0f}µs"
    if ms < 10.0:
        return f"{ms:.2f}ms"
    if ms < 100.0:
        return f"{ms:.1f}ms"
    if ms < 1000.0:
        return f"{ms:.0f}ms"
    return f"{ms / 1000.0:.2f}s"

def format_relative_time(iso_str: Optional[str]) -> str:
    """Formats ISO timestamp as relative elapsed time."""
    if not iso_str:
        return "just now"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        diff = (now - dt).total_seconds()
        if diff < 5:
            return "just now"
        if diff < 60:
            return f"{int(diff)}s ago"
        if diff < 3600:
            return f"{int(diff // 60)}m ago"
        if diff < 86400:
            return f"{int(diff // 3600)}h ago"
        return f"{int(diff // 86400)}d ago"
    except Exception:
        return "recently"

def format_type_badge(span_type: str, is_error: bool = False) -> str:
    if is_error:
        return f"{C_ERROR}ERR{RESET}"
    if span_type == "llm":
        return f"{C_ACCENT}LLM{RESET}"
    if span_type == "tool":
        return f"{C_TOOL}TOOL{RESET}"
    if span_type == "retriever":
        return f"{C_SUCCESS}RAG{RESET}"
    if span_type == "agent":
        return f"{C_PRIMARY}AGENT{RESET}"
    return f"{C_MUTED}SPAN{RESET}"

def build_gantt_bar(offset_pct: float, dur_pct: float, width: int = 18, span_type: str = "", is_error: bool = False) -> str:
    """Builds a proportional Gantt timeline bar with clean Unicode characters."""
    left = min(int((offset_pct / 100.0) * width), width - 1)
    bar_len = max(1, min(int((dur_pct / 100.0) * width), width - left))
    right = max(0, width - left - bar_len)

    color = C_ERROR if is_error else (
        C_ACCENT if span_type == "llm" else
        C_TOOL if span_type == "tool" else
        C_SUCCESS if span_type == "retriever" else
        C_PRIMARY if span_type == "agent" else C_MUTED
    )
    bar_char = "━" * max(0, bar_len - 1) + "●"
    return f"{' ' * left}{color}{bar_char}{RESET}{' ' * right}"

# ==========================================
# COMMAND IMPLEMENTATIONS
# ==========================================

def cmd_list(args):
    """Lists recorded execution traces in a clean tabular format."""
    traces = load_traces()
    if not traces:
        print(f"\n{C_MUTED}No traces recorded. Run an agent or use '{BOLD}afr run <cmd>{RESET}{C_MUTED}' to capture telemetry.{RESET}\n")
        return

    term_width = shutil.get_terminal_size((100, 24)).columns
    limit = args.limit or len(traces)
    displayed = traces[:limit]

    print(f"\n{BOLD}{'STATUS':<8} {'ID':<10} {'NAME':<36} {'DURATION':<12} {'TOKENS':<10} {'COST':<10} {'AGE'}{RESET}")
    print(f"{C_MUTED}{'─'*7} {'─'*9} {'─'*35} {'─'*11} {'─'*9} {'─'*9} {'─'*12}{RESET}")

    for t in displayed:
        is_err = t.get("status") == "error" or t.get("error_count", 0) > 0
        status_tag = f"{C_ERROR}FAIL{RESET}" if is_err else f"{C_SUCCESS}PASS{RESET}"
        tid = t.get("id", "")[:8]
        raw_name = t.get("name", "Unnamed")
        name = (raw_name[:33] + "...") if len(raw_name) > 36 else raw_name
        dur = format_latency(t.get("latency_ms", 0.0))
        toks = f"{t.get('total_tokens', 0):,}" if t.get("total_tokens") else "—"
        cost = f"${t.get('total_cost', 0):.4f}" if t.get("total_cost") else "—"
        age = format_relative_time(t.get("start_time") or t.get("created_at"))

        print(f"{status_tag:<17} {C_MUTED}{tid:<9}{RESET} {BOLD}{name:<36}{RESET} {dur:<12} {toks:<10} {cost:<10} {C_MUTED}{age}{RESET}")

    print(f"\n{C_MUTED}Showing {len(displayed)} of {len(traces)} traces. View waterfall: {BOLD}afr view <id>{RESET}\n")

def cmd_view(args):
    """Renders the execution waterfall tree for a specific trace."""
    target = find_trace(args.id)
    if not target:
        print(f"\n{C_ERROR}Error:{RESET} Trace '{args.id}' not found. Run '{BOLD}afr list{RESET}' to inspect available traces.\n")
        return

    spans = target.get("spans", [])
    if not spans:
        print(f"\n{C_MUTED}Trace has no recorded child spans.{RESET}\n")
        return

    is_err = target.get("status") == "error" or target.get("error_count", 0) > 0
    status_badge = f"{C_ERROR}● FAILED{RESET}" if is_err else f"{C_SUCCESS}● SUCCESS{RESET}"
    total_lat = target.get("latency_ms", 0.0)
    toks = target.get("total_tokens", 0)
    cost = target.get("total_cost", 0.0)

    print(f"\n{BOLD}{target.get('name')}{RESET}  {C_MUTED}[{target.get('id')}]{RESET}")
    print(f"Status: {status_badge}  •  Latency: {BOLD}{format_latency(total_lat)}{RESET}  •  Tokens: {toks:,}  •  Spend: ${cost:.4f}\n")

    print(f"{BOLD}{'HIERARCHY / OPERATION':<44} {'TYPE':<8} {'GANTT TIMELINE':<22} {'DURATION'}{RESET}")
    print(f"{C_MUTED}{'─'*43} {'─'*7} {'─'*21} {'─'*10}{RESET}")

    # Calculate offsets
    parent_map: Dict[Optional[str], List[Dict]] = {}
    for s in spans:
        parent_map.setdefault(s.get("parent_span_id"), []).append(s)

    total_dur = max(total_lat, 0.01)

    def print_node(node: Dict, depth: int = 0, is_last: bool = False, prefix: str = "", offset: float = 0.0):
        dur = node.get("latency_ms", 0.0)
        dur_pct = (dur / total_dur) * 100.0 if total_dur > 0 else 100.0
        offset_pct = (offset / total_dur) * 100.0 if total_dur > 0 else 0.0

        is_span_err = node.get("status") == "error"
        badge = format_type_badge(node.get("span_type", ""), is_span_err)
        bar = build_gantt_bar(offset_pct, dur_pct, width=20, span_type=node.get("span_type", ""), is_error=is_span_err)

        branch = "└── " if is_last else "├── "
        node_prefix = prefix + branch if depth > 0 else ""
        raw_name = (node_prefix + node.get("name", "span"))[:42]
        padded_name = f"{raw_name:<44}"
        name_styled = f"{BOLD}{padded_name}{RESET}"

        print(f"{name_styled} {badge:<17} [{bar}] {C_TEXT}{format_latency(dur)}{RESET}")

        children = parent_map.get(node["id"], [])
        next_prefix = prefix + ("    " if is_last else "│   ")
        child_offset = offset
        for i, child in enumerate(children):
            print_node(child, depth + 1, is_last=(i == len(children) - 1), prefix=next_prefix, offset=child_offset)
            child_offset += child.get("latency_ms", 0.0)

    roots = parent_map.get(None, [])
    if not roots and spans:
        roots = [spans[0]]

    for i, root in enumerate(roots):
        print_node(root, is_last=(i == len(roots) - 1), offset=0.0)

    print()

def cmd_inspect(args):
    """Pretty prints the input, output, or metadata JSON for a trace or span."""
    target = find_trace(args.id)
    if not target:
        print(f"\n{C_ERROR}Error:{RESET} Trace '{args.id}' not found.\n")
        return

    spans = target.get("spans", [])
    selected_span = spans[0] if spans else target

    if args.span:
        matched = next((s for s in spans if args.span in s.get("id", "") or args.span in s.get("name", "")), None)
        if matched:
            selected_span = matched

    print(f"\n{BOLD}{C_PRIMARY}Trace:{RESET} {target.get('name')} {C_MUTED}({target.get('id')}){RESET}")
    print(f"{BOLD}Span:{RESET}  {selected_span.get('name')} {C_MUTED}[{selected_span.get('span_type')}, {format_latency(selected_span.get('latency_ms', 0))}]{RESET}\n")

    if args.input or not (args.output or args.error):
        print(f"{BOLD}Input Payload:{RESET}")
        print(f"{C_PRIMARY}{json.dumps(selected_span.get('input', {}), indent=2)}{RESET}\n")

    if args.output or not (args.input or args.error):
        print(f"{BOLD}Output Payload:{RESET}")
        print(f"{C_SUCCESS}{json.dumps(selected_span.get('output', {}), indent=2)}{RESET}\n")

    if selected_span.get("error_details"):
        print(f"{BOLD}{C_ERROR}Error Details & Stack Trace:{RESET}")
        print(f"{C_ERROR}{json.dumps(selected_span.get('error_details'), indent=2)}{RESET}\n")

def cmd_run(args):
    """Executes any command and captures telemetry in real time."""
    if not args.cmd:
        print(f"\n{C_ERROR}Usage:{RESET} afr run <command...>\nExample: afr run python agent.py\n")
        return

    cmd_list_args = args.cmd
    cmd_str = shlex.join(cmd_list_args) if hasattr(shlex, 'join') else " ".join(cmd_list_args)
    print(f"\n{C_PRIMARY}● Flight Recorder{RESET} Instrumenting: {BOLD}{cmd_str}{RESET}")
    
    start_time = time.time()
    try:
        proc = subprocess.Popen(
            cmd_list_args,
            shell=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        stdout, stderr = proc.communicate()
    except Exception as exec_err:
        proc = type('ProcessResult', (), {'returncode': 1})()
        stdout, stderr = "", str(exec_err)
    elapsed_ms = (time.time() - start_time) * 1000.0
    is_error = proc.returncode != 0
    status_str = "error" if is_error else "success"

    if stdout:
        print(f"\n{stdout.rstrip()}")
    if stderr:
        print(f"\n{C_ERROR}{stderr.rstrip()}{RESET}")

    trace_id = str(uuid.uuid4())
    cmd_trace = {
        "id": trace_id,
        "project_id": os.path.basename(os.getcwd()) or "local",
        "session_id": "cli_run",
        "name": cmd_str,
        "status": status_str,
        "start_time": datetime.fromtimestamp(start_time, timezone.utc).isoformat(),
        "end_time": datetime.now(timezone.utc).isoformat(),
        "latency_ms": round(elapsed_ms, 2),
        "total_tokens": max(1, (len(stdout or "") + len(cmd_str)) // 4),
        "total_cost": 0.0,
        "tags": ["cli", cmd_str.split()[0]],
        "metadata": {"command": cmd_str, "exit_code": proc.returncode},
        "error_count": 1 if is_error else 0,
        "spans": [
            {
                "id": str(uuid.uuid4()),
                "trace_id": trace_id,
                "parent_span_id": None,
                "name": cmd_str,
                "span_type": "tool",
                "status": status_str,
                "start_time": datetime.fromtimestamp(start_time, timezone.utc).isoformat(),
                "end_time": datetime.now(timezone.utc).isoformat(),
                "latency_ms": round(elapsed_ms, 2),
                "input": {"command": cmd_str},
                "output": {"stdout": stdout.strip(), "exit_code": proc.returncode},
                "metadata": {"exit_code": proc.returncode},
                "error_details": {
                    "type": "ProcessError",
                    "message": stderr.strip() or f"Process exited with code {proc.returncode}",
                    "stacktrace": stderr.strip(),
                } if is_error else None,
            }
        ],
        "created_at": datetime.fromtimestamp(start_time, timezone.utc).isoformat(),
    }

    traces = load_traces()
    traces.insert(0, cmd_trace)
    save_traces(traces)

    status_tag = f"{C_ERROR}FAILED{RESET}" if is_error else f"{C_SUCCESS}SUCCESS{RESET}"
    print(f"\n{C_PRIMARY}✓ Trace Captured:{RESET} {BOLD}{trace_id[:8]}{RESET}  [{status_tag} • {format_latency(elapsed_ms)}]")
    print(f"{C_MUTED}View tree:{RESET} afr view {trace_id[:8]}\n")

def cmd_stats(args):
    """Prints high-level throughput and observability statistics."""
    traces = load_traces()
    total = len(traces)
    if total == 0:
        print(f"\n{C_MUTED}No traces recorded yet.{RESET}\n")
        return

    errors = sum(1 for t in traces if t.get("status") == "error" or t.get("error_count", 0) > 0)
    tokens = sum(t.get("total_tokens", 0) for t in traces)
    cost = sum(t.get("total_cost", 0.0) for t in traces)
    latencies = [t.get("latency_ms", 0.0) for t in traces if t.get("latency_ms")]
    avg_lat = (sum(latencies) / len(latencies)) if latencies else 0.0

    print(f"\n{BOLD}Telemetry Performance Metrics:{RESET}")
    print(f"  • Total Traces:     {BOLD}{total}{RESET}")
    print(f"  • Error Rate:       {C_ERROR if errors > 0 else C_SUCCESS}{errors / total * 100.0:.1f}%{RESET} ({errors} failed)")
    print(f"  • Average Latency:  {BOLD}{format_latency(avg_lat)}{RESET}")
    print(f"  • Total Tokens:     {BOLD}{tokens:,}{RESET}")
    print(f"  • Total Spend:      {C_SUCCESS}${cost:.4f}{RESET}\n")

def cmd_clean(args):
    """Clears all local traces."""
    save_traces([])
    print(f"\n{C_SUCCESS}✓ Telemetry buffer cleared.{RESET}\n")

# ==========================================
# CLAUDE CODE / OPENCODE INTERACTIVE AGENT REPL
# ==========================================

class InteractiveAgentREPL:
    """
    Claude Code & OpenCode style interactive terminal environment.
    Executes real tasks, calls tools (Bash, File, Search, Python), and streams telemetry live.
    """

    def __init__(self):
        self.workspace = os.path.basename(os.getcwd()) or "workspace"
        self.session_id = f"sess_{int(time.time())}"
        self.session_tokens = 0
        self.session_cost = 0.0
        # Automatically ensure web UI server daemon is running in background
        ensure_ui_running(open_browser=False, verbose=False)

    def print_banner(self):
        ui_status = f"{C_SUCCESS}Live{RESET}" if is_ui_running() else f"{C_MUTED}Active{RESET}"
        print(f"\n{BOLD}{C_PRIMARY}╭── Agent Flight Recorder ───────────────────────────────────────────────────╮{RESET}")
        print(f"{BOLD}{C_PRIMARY}│{RESET}  🛩️  Workspace: {BOLD}{self.workspace}{RESET}  •  Telemetry: {C_SUCCESS}Active{RESET}  •  Web UI: {C_PRIMARY}{UI_URL}{RESET} ({ui_status}) {BOLD}{C_PRIMARY}│{RESET}")
        print(f"{BOLD}{C_PRIMARY}╰────────────────────────────────────────────────────────────────────────────╯{RESET}")
        print(f"{C_MUTED}Type {BOLD}help{RESET}{C_MUTED} for commands ({BOLD}list{RESET}{C_MUTED}, {BOLD}ui{RESET}{C_MUTED}, {BOLD}view <id>{RESET}{C_MUTED}, {BOLD}stats{RESET}{C_MUTED}, {BOLD}run <cmd>{RESET}{C_MUTED}).{RESET}\n")

    def execute_tool_bash(self, cmd: str) -> Tuple[str, bool, float]:
        """Runs a real bash tool command and returns (output, is_error, elapsed_ms)."""
        start = time.time()
        try:
            res = subprocess.run(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=30.0,
            )
            elapsed = (time.time() - start) * 1000.0
            out = res.stdout if res.returncode == 0 else (res.stderr or res.stdout)
            return out.strip(), res.returncode != 0, elapsed
        except Exception as e:
            return str(e), True, (time.time() - start) * 1000.0

    def execute_tool_file_search(self, pattern: str) -> Tuple[List[str], float]:
        """Finds files matching pattern."""
        start = time.time()
        matches = []
        try:
            for root, dirs, files in os.walk("."):
                dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "dist", "build", "__pycache__", ".next")]
                for file in files:
                    if pattern in file or pattern == "*" or file.endswith(pattern.lstrip("*")):
                        rel = os.path.relpath(os.path.join(root, file), ".")
                        matches.append(rel)
                        if len(matches) >= 50:
                            break
        except Exception:
            pass
        elapsed = (time.time() - start) * 1000.0
        return matches, elapsed

    def execute_tool_read_file(self, filepath: str) -> Tuple[str, bool, float]:
        """Reads content of a local file."""
        start = time.time()
        try:
            if os.path.exists(filepath) and os.path.isfile(filepath):
                with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read(6000)
                elapsed = (time.time() - start) * 1000.0
                return content, False, elapsed
            return f"File '{filepath}' does not exist.", True, (time.time() - start) * 1000.0
        except Exception as e:
            return str(e), True, (time.time() - start) * 1000.0

    def handle_tool_execution(self, action_type: str, target: str):
        """Executes a real tool action and logs telemetry."""
        trace_id = str(uuid.uuid4())
        trace_start_time = time.time()
        start_iso = datetime.now(timezone.utc).isoformat()
        spans = []

        if action_type == "search":
            pattern = target or "*"
            files, dur = self.execute_tool_file_search(pattern)
            end_iso = datetime.now(timezone.utc).isoformat()
            spans.append({
                "id": str(uuid.uuid4()),
                "trace_id": trace_id,
                "parent_span_id": "root",
                "name": f"FileSearch ({pattern})",
                "span_type": "retriever",
                "status": "success",
                "start_time": start_iso,
                "end_time": end_iso,
                "latency_ms": round(dur, 2),
                "input": {"pattern": pattern, "scope": self.workspace},
                "output": {"found_count": len(files), "sample": files[:15]},
                "metadata": {"tool": "file_search"},
                "error_details": None,
            })
            total_dur = (time.time() - trace_start_time) * 1000.0
            total_tokens = len(str(files)) // 4

            root_span = {
                "id": "root",
                "trace_id": trace_id,
                "parent_span_id": None,
                "name": f"Search: {pattern}",
                "span_type": "agent",
                "status": "success",
                "start_time": start_iso,
                "end_time": datetime.now(timezone.utc).isoformat(),
                "latency_ms": round(total_dur, 2),
                "input": {"pattern": pattern},
                "output": {"found": len(files)},
                "metadata": {"session_id": self.session_id},
                "error_details": None,
            }
            trace_obj = {
                "id": trace_id,
                "project_id": self.workspace,
                "session_id": self.session_id,
                "name": f"Search: {pattern}",
                "status": "success",
                "start_time": start_iso,
                "end_time": datetime.now(timezone.utc).isoformat(),
                "latency_ms": round(total_dur, 2),
                "total_tokens": total_tokens,
                "total_cost": 0.0,
                "tags": ["tool", "file-search"],
                "metadata": {"pattern": pattern},
                "error_count": 0,
                "spans": [root_span] + spans,
                "created_at": start_iso,
            }
            existing = load_traces()
            existing.insert(0, trace_obj)
            save_traces(existing)

            print(f"\n{C_SUCCESS}▸ Found {len(files)} files matching '{pattern}':{RESET}")
            for f in files[:20]:
                print(f"  • {f}")
            if len(files) > 20:
                print(f"  {C_MUTED}... and {len(files) - 20} more{RESET}")
            print(f"\n{C_PRIMARY}✓ Trace Captured:{RESET} {BOLD}{trace_id[:8]}{RESET}  [{format_latency(total_dur)}]\n")

        elif action_type == "read":
            content, is_err, dur = self.execute_tool_read_file(target)
            end_iso = datetime.now(timezone.utc).isoformat()
            status_str = "error" if is_err else "success"
            spans.append({
                "id": str(uuid.uuid4()),
                "trace_id": trace_id,
                "parent_span_id": "root",
                "name": f"ReadFile ({target})",
                "span_type": "tool",
                "status": status_str,
                "start_time": start_iso,
                "end_time": end_iso,
                "latency_ms": round(dur, 2),
                "input": {"filepath": target},
                "output": {"bytes_read": len(content), "preview": content[:200]},
                "metadata": {"tool": "read_file"},
                "error_details": {"type": "FileNotFoundError", "message": content} if is_err else None,
            })
            total_dur = (time.time() - trace_start_time) * 1000.0
            total_tokens = len(content) // 4

            root_span = {
                "id": "root",
                "trace_id": trace_id,
                "parent_span_id": None,
                "name": f"Read: {target}",
                "span_type": "agent",
                "status": status_str,
                "start_time": start_iso,
                "end_time": datetime.now(timezone.utc).isoformat(),
                "latency_ms": round(total_dur, 2),
                "input": {"filepath": target},
                "output": {"content_length": len(content)},
                "metadata": {"session_id": self.session_id},
                "error_details": {"type": "FileNotFoundError", "message": content} if is_err else None,
            }
            trace_obj = {
                "id": trace_id,
                "project_id": self.workspace,
                "session_id": self.session_id,
                "name": f"Read: {target}",
                "status": status_str,
                "start_time": start_iso,
                "end_time": datetime.now(timezone.utc).isoformat(),
                "latency_ms": round(total_dur, 2),
                "total_tokens": total_tokens,
                "total_cost": 0.0,
                "tags": ["tool", "read-file"],
                "metadata": {"filepath": target},
                "error_count": 1 if is_err else 0,
                "spans": [root_span] + spans,
                "created_at": start_iso,
            }
            existing = load_traces()
            existing.insert(0, trace_obj)
            save_traces(existing)

            if is_err:
                print(f"\n{C_ERROR}✗ Error reading '{target}': {content}{RESET}\n")
            else:
                print(f"\n{BOLD}{target} ({len(content)} bytes):{RESET}\n")
                print(f"{content[:1000]}{'...' if len(content) > 1000 else ''}\n")
            print(f"{C_PRIMARY}✓ Trace Captured:{RESET} {BOLD}{trace_id[:8]}{RESET}  [{format_latency(total_dur)}]\n")

    def run_loop(self):
        """Main REPL command loop."""
        self.print_banner()
        while True:
            try:
                raw_input = input(f"{BOLD}{C_PRIMARY}afr {C_ACCENT}❯{RESET} ").strip()
            except (KeyboardInterrupt, EOFError):
                print(f"\n{C_MUTED}Exiting Agent Flight Recorder. Goodbye! 👋{RESET}\n")
                break

            if not raw_input:
                continue

            # Normalize command (strip leading slash if present)
            clean_input = raw_input.lstrip("/")
            parts = clean_input.split()
            cmd = parts[0].lower() if parts else ""
            arg = " ".join(parts[1:]) if len(parts) > 1 else ""

            # Standard Builtin Commands
            if cmd in ("help", "?"):
                print(f"\n{BOLD}Available Commands:{RESET}")
                print(f"  {BOLD}list{RESET} (or {BOLD}traces{RESET}, {BOLD}ls{RESET})         List recorded execution traces")
                print(f"  {BOLD}ui{RESET} (or {BOLD}web{RESET}, {BOLD}open{RESET})            Launch and open Web Workbench in browser")
                print(f"  {BOLD}view <id>{RESET} (or {BOLD}tree <id>{RESET})       Render ASCII Gantt waterfall chart")
                print(f"  {BOLD}inspect <id>{RESET} (or {BOLD}json <id>{RESET})    Inspect raw JSON input/output payloads")
                print(f"  {BOLD}stats{RESET}                        Show telemetry performance & metrics")
                print(f"  {BOLD}run <command...>{RESET}             Wrap and trace any shell/agent command")
                print(f"  {BOLD}search <pattern>{RESET}             Find workspace files & trace retriever")
                print(f"  {BOLD}read <filepath>{RESET}              Read file content & trace tool span")
                print(f"  {BOLD}clean{RESET}                        Clear local telemetry buffer")
                print(f"  {BOLD}clear{RESET}                        Clear terminal screen")
                print(f"  {BOLD}exit{RESET} (or {BOLD}quit{RESET})                Exit AFR\n")

            elif cmd in ("traces", "list", "ls"):
                cmd_list(type('Args', (), {'limit': 20})())

            elif cmd in ("ui", "web", "dashboard", "open"):
                ensure_ui_running(open_browser=True, verbose=True)

            elif cmd in ("view", "tree", "show"):
                cmd_view(type('Args', (), {'id': arg})())

            elif cmd in ("inspect", "json"):
                cmd_inspect(type('Args', (), {'id': arg, 'span': '', 'input': False, 'output': False, 'error': False})())

            elif cmd == "stats":
                cmd_stats(type('Args', (), {})())

            elif cmd in ("clean", "clear_db"):
                cmd_clean(type('Args', (), {})())

            elif cmd in ("clear", "cls"):
                os.system("clear" if os.name != "nt" else "cls")

            elif cmd in ("exit", "quit", "q"):
                print(f"\n{C_MUTED}Exiting Agent Flight Recorder. Goodbye! 👋{RESET}\n")
                break

            elif cmd == "run":
                if not arg:
                    print(f"{C_ERROR}Usage: run <command...>{RESET}")
                else:
                    cmd_run(type('Args', (), {'cmd': parts[1:]})())

            elif cmd in ("search", "find"):
                self.handle_tool_execution("search", arg or "*")

            elif cmd in ("read", "cat"):
                if not arg:
                    print(f"{C_ERROR}Usage: read <filepath>{RESET}")
                else:
                    self.handle_tool_execution("read", arg)

            # Direct shell command execution (e.g. ls, git, npm, python, cat, etc.)
            elif cmd in ("git", "npm", "python", "python3", "node", "pytest", "curl", "cargo", "docker", "make", "find", "grep"):
                cmd_run(type('Args', (), {'cmd': raw_input.split()})())

            else:
                print(f"{C_ERROR}Unknown command: \"{raw_input}\"{RESET}")
                print(f"{C_MUTED}Type {BOLD}help{RESET}{C_MUTED} for available commands, or use {BOLD}run <command>{RESET}{C_MUTED} to trace an execution.{RESET}\n")

# ==========================================
# CLI ENTRY POINT & DISPATCHER
# ==========================================

def main():
    parser = argparse.ArgumentParser(
        prog="afr",
        description="🛩️ Agent Flight Recorder (AFR) - Claude Code & OpenCode style AI Agent Tracing CLI",
    )
    subparsers = parser.add_subparsers(dest="subcommand", help="Available subcommands")

    # afr list / ls
    p_list = subparsers.add_parser("list", aliases=["ls"], help="List recorded execution traces")
    p_list.add_argument("-n", "--limit", type=int, default=25, help="Maximum number of traces to display")

    # afr ui / web / dashboard
    p_ui = subparsers.add_parser("ui", aliases=["web", "dashboard", "open"], help="Launch and open Web Workbench in browser")

    # afr view / tree
    p_view = subparsers.add_parser("view", aliases=["tree", "show"], help="Render execution waterfall tree")
    p_view.add_argument("id", nargs="?", default="", help="Trace ID or prefix")

    # afr inspect / json
    p_inspect = subparsers.add_parser("inspect", aliases=["json"], help="Inspect prompt/response payloads")
    p_inspect.add_argument("id", nargs="?", default="", help="Trace ID or prefix")
    p_inspect.add_argument("span", nargs="?", default="", help="Span ID or name")
    p_inspect.add_argument("-i", "--input", action="store_true", help="Show input prompt only")
    p_inspect.add_argument("-o", "--output", action="store_true", help="Show output completion only")
    p_inspect.add_argument("-e", "--error", action="store_true", help="Show error stack trace")

    # afr run
    p_run = subparsers.add_parser("run", help="Wrap and trace an AI agent command in real time")
    p_run.add_argument("cmd", nargs=argparse.REMAINDER, help="Command to execute")

    # afr stats
    p_stats = subparsers.add_parser("stats", help="Show telemetry metrics and error rates")

    # afr clean / clear
    p_clean = subparsers.add_parser("clean", aliases=["clear"], help="Clear local flight telemetry buffer")

    args = parser.parse_args()

    if args.subcommand in ("list", "ls"):
        cmd_list(args)
    elif args.subcommand in ("ui", "web", "dashboard", "open"):
        cmd_ui(args)
    elif args.subcommand in ("view", "tree", "show"):
        cmd_view(args)
    elif args.subcommand in ("inspect", "json"):
        cmd_inspect(args)
    elif args.subcommand == "run":
        cmd_run(args)
    elif args.subcommand == "stats":
        cmd_stats(args)
    elif args.subcommand in ("clean", "clear"):
        cmd_clean(args)
    else:
        # Default behavior: Launch Claude Code / OpenCode style interactive Agent Shell
        repl = InteractiveAgentREPL()
        repl.run_loop()

if __name__ == "__main__":
    main()

