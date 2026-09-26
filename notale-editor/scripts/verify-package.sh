#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-cache.mjs
task_consumer=$(mktemp -d /tmp/notale-editor-consumer-XXXXXX)
task_package=$(npm pack --silent --pack-destination "$task_consumer")
printf '%s\n' "Consumer evidence: $task_consumer"
cat > "$task_consumer/package.json" <<'JSON'
{"name":"notale-editor-consumer-check","private":true,"type":"module"}
JSON
npm install --prefix "$task_consumer" --ignore-scripts --no-audit --no-fund "$task_consumer/$task_package" typescript@5.9.3 @types/node@22.18.6 @types/pg@8.15.5
cat > "$task_consumer/tsconfig.json" <<'JSON'
{"compilerOptions":{"target":"ES2022","module":"NodeNext","moduleResolution":"NodeNext","strict":true,"outDir":"out"},"include":["consumer.ts"]}
JSON
cp tests/fixtures/package-consumer.ts.txt "$task_consumer/consumer.ts"
cp tests/fixtures/scene-correlation.html "$task_consumer/scene-correlation.html"
cp tests/fixtures/scene-bootstrap.html "$task_consumer/scene-bootstrap.html"
cp tests/fixtures/chart-callbacks.html "$task_consumer/chart-callbacks.html"
cp tests/fixtures/chart-learning-rate.html "$task_consumer/chart-learning-rate.html"
"$task_consumer/node_modules/.bin/tsc" -p "$task_consumer/tsconfig.json"
(cd "$task_consumer" && EDITOR_RUNTIME_DIR="$task_consumer/node_modules/@notale/editor/dist" node out/consumer.js)
