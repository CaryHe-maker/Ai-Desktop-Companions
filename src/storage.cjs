const fs = require('node:fs');
const path = require('node:path');
class Storage {
  constructor(directory) { this.dir = directory; fs.mkdirSync(directory, { recursive: true }); }
  read(name, fallback = {}) {
    try { return JSON.parse(fs.readFileSync(path.join(this.dir, name + '.json'), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw new Error('本地数据无法读取：' + name); }
  }
  write(name, value) {
    const dest = path.join(this.dir, name + '.json'); const temp = dest + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 }); fs.renameSync(temp, dest);
  }
}
module.exports = { Storage };
