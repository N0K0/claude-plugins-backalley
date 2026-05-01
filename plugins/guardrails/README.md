# guardrails

Quality-of-life guardrail hooks. Each hook blocks a specific footgun by emitting `{"decision": "block", "reason": "..."}`, steering Claude toward a safer or more idiomatic approach.

## Install
```
/plugin marketplace add N0K0/claude-plugins-backalley
/plugin install guardrails@claude-plugins-backalley
```

## Components

### Hooks

- **PreToolUse:Bash — `bash-sleep-bg.py`** — Blocks `sleep N; cmd` / `sleep N && cmd` chains. Steers toward `run_in_background: true` plus polling, or `ScheduleWakeup` for delayed checks.
- **PreToolUse:Bash — `bash-readonly.py`** — Blocks bare `cat`, `head`, `tail`, `sed`, `awk` invocations on a single file. Steers toward `Read` / `Edit`. Piped and heredoc forms are allowed.
- **PreToolUse:Bash — `bash-destructive.py`** — Blocks the most common foot-cannons: `rm -rf`, `git push --force` to `main`/`master`, `git reset --hard`, `git checkout/restore .`, `git clean -f`, `git commit --no-verify`. Reason text points to the safer alternative.
- **PreToolUse:Write / Edit — `secret-files.py`** — Refuses writes to likely secret files: `.env*`, `credentials.json`, `id_rsa*`, `*.pem`/`.key`/`.p12`/`.pfx`, anything under a `secrets/` directory.
- **Stop — `stop-tasks.py`** — Blocks end-of-turn while any `TaskCreate` task is still `pending` or `in_progress`. Reads the session transcript to reconstruct task state. Bypass by including `[[guardrails:tasks-ok]]` in the final assistant message.

All hooks are fail-open: any internal exception emits `{}` and exits 0 so the harness is never broken by a guardrail bug.

## Requirements

- `python3` available on `PATH` (standard library only)

## License

[LICENSE](LICENSE)
