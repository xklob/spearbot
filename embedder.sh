#!/bin/sh
SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
PATH="$SCRIPT_DIR/spearbot-node/node_modules/.bin:$PATH"
exec tsx "$SCRIPT_DIR/spearbot-node/src/scripts/embedder.ts" "$@"
