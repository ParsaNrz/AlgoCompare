const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '..', 'src', 'sandbox');
const target = path.join(__dirname, '..', 'dist', 'sandbox');

if (fs.existsSync(source)) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}
