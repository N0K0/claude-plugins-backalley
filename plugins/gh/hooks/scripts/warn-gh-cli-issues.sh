#!/bin/bash
# PreToolUse hook: warn when Bash uses gh CLI for issue/PR operations
# instead of the local .issues/ files and MCP tools.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

if echo "$COMMAND" | grep -qE 'gh (issue|label|search issues|api.*/issues)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Use local .issues/ files and gh plugin MCP tools (issue_pull, issue_push, issue_search) instead of gh CLI commands. Issues are synced locally — pull with issue_pull, search with issue_search, read with the Read tool."
    }
  }'
elif echo "$COMMAND" | grep -qE 'gh pr (edit|create)'; then
  echo "NOTE: gh pr CLI commands are allowed for now, but MCP equivalents (pr_create, pr_merge) are planned. When available, prefer the MCP tools." >&2
fi
