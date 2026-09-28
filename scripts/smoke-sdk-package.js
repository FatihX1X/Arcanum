const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'arcanum-sdk-smoke-'));
const npmCli = process.env.npm_execpath;
let tarball;

try {
  if (!npmCli) throw new Error('npm_execpath is unavailable; run this smoke test through npm.');
  const packed = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--workspace', 'arcanum-chat-sdk', '--json'], { cwd: root, encoding: 'utf8' }));
  tarball = path.join(root, packed[0].filename);
  fs.writeFileSync(path.join(temporary, 'package.json'), JSON.stringify({ name: 'arcanum-sdk-smoke', private: true, type: 'module' }));
  execFileSync(process.execPath, [npmCli, 'install', '--ignore-scripts', tarball, 'viem@^2.56.7'], { cwd: temporary, stdio: 'inherit' });
  execFileSync(process.execPath, ['--input-type=module', '-e', "import { createArcanumSdk, arcMainnet } from 'arcanum-chat-sdk'; import { arcanumContracts } from 'arcanum-chat-sdk/contracts'; import * as cryptoApi from 'arcanum-chat-sdk/crypto'; if (arcMainnet.id !== 5042 || !arcanumContracts.escrow.address || typeof createArcanumSdk !== 'function' || typeof cryptoApi.encryptMessage !== 'function') process.exit(1);"], { cwd: temporary, stdio: 'inherit' });
  execFileSync(process.execPath, ['-e', "const sdk = require('arcanum-chat-sdk'); const contracts = require('arcanum-chat-sdk/contracts'); const cryptoApi = require('arcanum-chat-sdk/crypto'); if (sdk.arcMainnet.id !== 5042 || !contracts.arcanumContracts.messenger.address || typeof cryptoApi.createMemoryKeyStorage !== 'function') process.exit(1);"], { cwd: temporary, stdio: 'inherit' });
  console.log('Packed SDK installs and loads through ESM and CommonJS.');
} finally {
  if (tarball && fs.existsSync(tarball)) fs.rmSync(tarball);
  fs.rmSync(temporary, { recursive: true, force: true });
}
