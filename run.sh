#!/usr/bin/env bash
set -euo pipefail

# Full pipeline: search → filter → analyze → import
node agent-runner.js
