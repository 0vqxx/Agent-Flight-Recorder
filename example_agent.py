#!/usr/bin/env python3
"""
Example AI Agent instrumented with Agent Flight Recorder (AFR).
Runs a real multi-step agent pipeline (planning, file search, code reading, synthesis).
"""
import os
import sys
import glob
import time
import flight_recorder

# 1. Initialize AFR Telemetry Client
flight_recorder.init(
    api_key="local-dev",
    project_id="jolly-davinci",
    flush_interval_seconds=0.5
)

@flight_recorder.trace_span(name="CodebaseAuditAgent", span_type="agent", tags=["audit", "v1"])
def run_codebase_agent(query: str):
    print(f"🤖 Starting Agent Task: '{query}'\n")

    # Step 1: Planning / LLM Step
    with flight_recorder.trace_span(name="Plan_Execution_Strategy", span_type="llm") as span:
        span.set_input({"user_query": query, "model": "claude-3-5-sonnet"})
        # Simulate planning logic
        time.sleep(0.04)
        plan = ["Scan workspace for configuration files", "Analyze package dependencies"]
        span.set_output({"plan": plan, "confidence": 0.98})
        print(f"  [1/3] Generated plan: {len(plan)} execution steps")

    # Step 2: Tool Execution - File Search Retriever
    with flight_recorder.trace_span(name="Search_ConfigFiles", span_type="retriever") as span:
        span.set_input({"patterns": ["*.json", "*.toml", "*.sql"]})
        found_files = []
        for ext in ("*.json", "*.toml", "*.sql", "*.md"):
            found_files.extend(glob.glob(f"**/{ext}", recursive=True))
        found_files = [f for f in found_files if "node_modules" not in f and ".next" not in f][:15]
        span.set_output({"matched_files": found_files, "total_found": len(found_files)})
        print(f"  [2/3] Retrieved {len(found_files)} configuration files")

    # Step 3: Tool Execution - Read and Analyze
    with flight_recorder.trace_span(name="Analyze_Package_JSON", span_type="tool") as span:
        target = "frontend/package.json"
        span.set_input({"filepath": target})
        if os.path.exists(target):
            with open(target, "r") as f:
                content = f.read()
            span.set_output({"bytes_read": len(content), "status": "ok"})
            print(f"  [3/3] Analyzed {target} ({len(content)} bytes)")
        else:
            span.set_output({"status": "not_found"})

    print("\n✓ Agent workflow completed successfully! Telemetry flushed to flight recorder.\n")
    return {"status": "completed", "files_analyzed": len(found_files)}

if __name__ == "__main__":
    query = "Audit repository dependencies and configuration structure"
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
    run_codebase_agent(query)
