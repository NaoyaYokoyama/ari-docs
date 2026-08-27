#!/bin/bash

set -e

echo "=== Build React ==="
cd front
npm ci
npm run build

echo "=== Build Rust ==="
cd ../back
cargo build --release

echo "=== Build Complete ==="
