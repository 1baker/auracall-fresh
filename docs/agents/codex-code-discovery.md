# Codex code discovery

Prefer the advertised CodeGraph or codebase-memory MCP for structural definitions, signatures, callers, callees, traces and impact analysis. Follow AGENTS.md routing and graph freshness rules; use focused context/explore or trace calls instead of rebuilding flows through broad file searches.

Use `rg` and direct reads for literal strings, configuration, docs, logs and scripts. Use local file search inside this repository and file-searcher for unknown or external locations. If graph tools are unavailable or insufficient, use direct inspection and report the fallback when it limits confidence. Read files named in a graph staleness banner directly.
