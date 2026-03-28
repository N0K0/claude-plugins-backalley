# Repo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold claude-plugins-backalley as a private Claude Code plugin marketplace with all config files, docs, and a marketplace generation script.

**Architecture:** Flat repo with `.claude-plugin/marketplace.json` as the registry, `plugins/` as the plugin directory, and `scripts/generate-marketplace.sh` to auto-generate the registry from individual plugin.json files.

**Tech Stack:** Shell (bash + jq), Markdown

**Spec:** `docs/superpowers/specs/2026-03-28-repo-scaffold-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `.claude-plugin/marketplace.json` | Plugin registry for Claude Code discovery |
| `.gitignore` | Ignore .claude/, DS_Store, node_modules, .env |
| `LICENSE` | MIT license |
| `README.md` | Installation and usage guide |
| `CLAUDE.md` | Machine-readable plugin development conventions |
| `scripts/generate-marketplace.sh` | Generates marketplace.json from plugin.json files |
| `plugins/.gitkeep` | Keeps empty plugins dir in git |

---

## Chunk 1: Repository Foundation

### Task 1: Create .gitignore and LICENSE

**Files:**
- Create: `.gitignore`
- Create: `LICENSE`

- [ ] **Step 1: Create .gitignore**

```
*.DS_Store
.claude/
node_modules/
.env
.env.*
```

- [ ] **Step 2: Create LICENSE**

MIT license with current year and author "nikolas".

- [ ] **Step 3: Commit**

```bash
git add .gitignore LICENSE
git commit -m "Add .gitignore and MIT license"
```

---

### Task 2: Create marketplace.json and plugins directory

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `plugins/.gitkeep`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p .claude-plugin plugins
touch plugins/.gitkeep
```

- [ ] **Step 2: Create marketplace.json**

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "claude-plugins-backalley",
  "description": "Private Claude Code plugin marketplace for security tooling and custom integrations",
  "owner": {
    "name": "nikolas"
  },
  "plugins": []
}
```

Note: includes top-level `name`, `description`, and `owner` fields matching the official repo's format.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/marketplace.json plugins/.gitkeep
git commit -m "Add empty marketplace registry and plugins directory"
```

---

### Task 3: Create README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

Content covers:
- What this repo is (private plugin marketplace)
- Structure overview (`.claude-plugin/`, `plugins/`, `scripts/`)
- Installation: add as marketplace source, install via `/plugin` interface
- Plugin listing (empty initially — update as plugins are added)
- How to add a plugin (brief, points to CLAUDE.md)
- How to regenerate marketplace.json
- License

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README with installation and usage instructions"
```

---

### Task 4: Create CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Write CLAUDE.md**

Sections (from spec):
1. **Project Overview** — private plugin marketplace, mirrors `claude-plugins-official`
2. **Plugin Structure Convention** — directory tree with required/optional components
3. **Naming Conventions** — kebab-case everywhere
4. **Adding a New Plugin** — step-by-step including running generate-marketplace.sh
5. **Key Patterns** — `${CLAUDE_PLUGIN_ROOT}`, SKILL.md format, hook I/O, MCP config
6. **Reference** — links to official repo, example-plugin, plugin-dev

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Add CLAUDE.md with plugin development conventions"
```

---

## Chunk 2: Marketplace Generation Script

### Task 5: Create generate-marketplace.sh

**Files:**
- Create: `scripts/generate-marketplace.sh`

- [ ] **Step 1: Write the script**

The script must:
1. Find all `plugins/*/.claude-plugin/plugin.json` files
2. Read existing `.claude-plugin/marketplace.json` to extract current `category` values (keyed by plugin name)
3. For each plugin.json: extract `name`, `description`, `author`; derive `source` as `./plugins/<dir-name>`
4. Merge preserved `category` values into entries
5. Write updated marketplace.json preserving top-level `name`, `description`, `owner` fields
6. Require `jq` — exit with error message if not found

```bash
#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"

# Check for jq
if ! command -v jq &>/dev/null; then
    echo "Error: jq is required but not found. Install it with your package manager." >&2
    exit 1
fi

# Load existing categories (keyed by plugin name)
declare -A CATEGORIES
if [[ -f "$MARKETPLACE" ]]; then
    while IFS='=' read -r key val; do
        CATEGORIES["$key"]="$val"
    done < <(jq -r '.plugins[]? | "\(.name)=\(.category // "")"' "$MARKETPLACE")
fi

# Read top-level fields from existing marketplace.json (or defaults)
TOP_LEVEL=$(jq '{
    "$schema": ."$schema",
    name: .name,
    description: .description,
    owner: .owner
}' "$MARKETPLACE" 2>/dev/null || echo '{}')

# Build plugins array
PLUGINS="[]"
for plugin_json in "$REPO_ROOT"/plugins/*/.claude-plugin/plugin.json; do
    [[ -f "$plugin_json" ]] || continue

    dir_name=$(basename "$(dirname "$(dirname "$plugin_json")")")
    source="./plugins/$dir_name"

    # Extract fields from plugin.json
    entry=$(jq --arg source "$source" '{
        name: .name,
        description: .description,
        author: .author,
        source: $source
    }' "$plugin_json")

    # Merge preserved category if it exists
    plugin_name=$(jq -r '.name' "$plugin_json")
    if [[ -n "${CATEGORIES[$plugin_name]:-}" ]]; then
        entry=$(echo "$entry" | jq --arg cat "${CATEGORIES[$plugin_name]}" '. + {category: $cat}')
    fi

    PLUGINS=$(echo "$PLUGINS" | jq --argjson entry "$entry" '. + [$entry]')
done

# Assemble final marketplace.json
echo "$TOP_LEVEL" | jq --argjson plugins "$PLUGINS" '. + {plugins: $plugins}' > "$MARKETPLACE"

echo "Generated $MARKETPLACE with $(echo "$PLUGINS" | jq 'length') plugin(s)."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/generate-marketplace.sh
```

- [ ] **Step 3: Test with no plugins (empty case)**

```bash
./scripts/generate-marketplace.sh
```

Expected output: `Generated .../marketplace.json with 0 plugin(s).`
Verify marketplace.json still has the schema, name, description, owner, and empty plugins array.

- [ ] **Step 4: Test with a dummy plugin**

```bash
mkdir -p plugins/test-plugin/.claude-plugin
echo '{"name":"test-plugin","description":"Test","author":{"name":"test"}}' > plugins/test-plugin/.claude-plugin/plugin.json
./scripts/generate-marketplace.sh
cat .claude-plugin/marketplace.json
```

Verify: marketplace.json now has one entry with name, description, author, source `./plugins/test-plugin`.

- [ ] **Step 5: Test category preservation**

```bash
# Manually add category to marketplace.json for test-plugin
jq '.plugins[0].category = "testing"' .claude-plugin/marketplace.json > /tmp/mp.json && mv /tmp/mp.json .claude-plugin/marketplace.json
# Regenerate
./scripts/generate-marketplace.sh
cat .claude-plugin/marketplace.json
```

Verify: the `category: "testing"` is preserved after regeneration.

- [ ] **Step 6: Clean up dummy plugin and regenerate**

```bash
rm -rf plugins/test-plugin
./scripts/generate-marketplace.sh
```

Verify: back to 0 plugins.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-marketplace.sh
git commit -m "Add marketplace generation script"
```

---

## Chunk 3: Final Verification

### Task 6: Verify complete scaffold

- [ ] **Step 1: Check all files exist**

```bash
ls -la .claude-plugin/marketplace.json
ls -la plugins/.gitkeep
ls -la scripts/generate-marketplace.sh
ls -la .gitignore LICENSE README.md CLAUDE.md
```

All should exist.

- [ ] **Step 2: Verify marketplace.json is valid JSON**

```bash
jq . .claude-plugin/marketplace.json
```

Should print formatted JSON without errors.

- [ ] **Step 3: Verify directory structure matches spec**

```
claude-plugins-backalley/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   └── .gitkeep
├── scripts/
│   └── generate-marketplace.sh
├── docs/
│   └── superpowers/
│       ├── specs/...
│       └── plans/...
├── CLAUDE.md
├── README.md
├── LICENSE
└── .gitignore
```

- [ ] **Step 4: Final commit (if any uncommitted changes)**

```bash
git status
# If clean, done. If not, commit remaining files.
```
