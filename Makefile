MAKEFLAGS += --no-print-directory
.SILENT:
DENO_TASK = deno task -q

.PHONY: help setup format check test security publish build benchmark docs clean update version

help: ## ❓ List available make targets
	@deno eval 'const files=Deno.args; const entries=[]; const pattern=/^([A-Za-z0-9_.:-]+):.*?##\s*(.+)\s*$$/; for (const file of files) { const text=await Deno.readTextFile(file); for (const line of text.split(/\r?\n/)) { const m=line.match(pattern); if (m) entries.push([m[1], m[2]]); } } entries.sort((a,b)=>a[0].localeCompare(b[0])); const pad=Math.max(8,...entries.map(([n])=>n.length))+2; for (const [name, desc] of entries) console.log(name.padEnd(pad)+desc);' $(MAKEFILE_LIST)

setup: ## ⚙️ Setup repository
	@$(DENO_TASK) setup

format: ## 🎨 Format code
	@deno fmt

check: ## ✅ Run quality checks
	@$(DENO_TASK) check

test: ## 🧪 Run tests
	@$(DENO_TASK) test

security: ## 🔒 Run security checks
	@$(DENO_TASK) security

publish: ## 🚀 Publish to JSR and npm
	@$(DENO_TASK) publish

build: ## 🧱 Run available build tasks
	@$(DENO_TASK) build:bundle:browser
	@$(DENO_TASK) build:bundle:node
	@$(DENO_TASK) build:npm
	@$(DENO_TASK) build:binary

benchmark: ## ⏱️ Run benchmarks
	@$(DENO_TASK) benchmark

docs: ## 📚 Generate docs
	@$(DENO_TASK) docs

update: ## 🔄 Update dependencies
	@$(DENO_TASK) update

clean: ## 🧹 Clean generated artifacts
	@$(DENO_TASK) clean

version: ## 📦 Print package metadata
	@$(DENO_TASK) version
