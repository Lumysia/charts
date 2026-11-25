#!/usr/bin/env bash
# Healthy only while dsh web listens on its port.
set -euo pipefail
ss -Hltn "sport = :${DSH_PORT:-3080}" | grep -q .
