import { readdirSync, readFileSync } from 'fs';
import { join, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import protobuf from 'protobufjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gameDir = join(__dirname, '../resources/proto/game');

const files = readdirSync(gameDir)
  .filter(f => f.endsWith('.proto'))
  .map(f => join(gameDir, f));

console.log(`Loading ${files.length} game proto files from: ${gameDir}`);

const GOOGLE_ANY_PROTO = `
syntax="proto3";
package google.protobuf;
message Any { string type_url = 1; bytes value = 2; }
`;

const root = new protobuf.Root();
const loaded = new Set();

// Pre-register google.protobuf.Any so files importing "google/protobuf/any.proto" resolve
protobuf.parse(GOOGLE_ANY_PROTO, root, { keepCase: true });
loaded.add('google/protobuf/any.proto');

function loadFile(filePath) {
  // Skip google well-known types (already pre-registered inline)
  if (!isAbsolute(filePath) && filePath.startsWith('google/')) return;
  const resolved = isAbsolute(filePath) ? filePath : join(gameDir, filePath);
  if (loaded.has(resolved)) return;
  loaded.add(resolved);
  const text = readFileSync(resolved, 'utf-8');
  const parsed = protobuf.parse(text, root, { keepCase: true });
  for (const imp of parsed.imports ?? []) {
    loadFile(imp);
  }
}

try {
  for (const f of files) loadFile(f);
  root.resolveAll();
  console.log(`\n✓ Loaded ${loaded.size} proto files\n`);

  const testTypes = [
    'com.ankama.dofus.server.game.protocol.gamemap.MapCurrentEvent',
    'com.ankama.dofus.server.game.protocol.quest.QuestValidatedEvent',
    'com.ankama.dofus.server.game.protocol.interactive.element.InteractiveUsedEvent',
    'com.ankama.dofus.server.game.protocol.interactive.element.InteractiveUseEndedEvent',
  ];

  for (const name of testTypes) {
    const t = root.lookupType(name);
    console.log(`  ✓ ${name.split('.').pop()}: [${Object.keys(t.fields).join(', ')}]`);
  }

  console.log('\nAll checks passed.');
} catch (e) {
  console.error('\n✗ Failed:', e.message);
  process.exit(1);
}
