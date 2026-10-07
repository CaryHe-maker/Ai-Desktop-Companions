const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
class Storage {
  constructor(directory, safeStorage) { this.dir = directory; this.safe = safeStorage; fs.mkdirSync(directory, { recursive: true }); }
  read(name, fallback = {}) {
    try { return JSON.parse(fs.readFileSync(path.join(this.dir, name + '.json'), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw new Error('本地数据无法读取：' + name); }
  }
  write(name, value) {
    const dest = path.join(this.dir, name + '.json'); const temp = dest + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 }); fs.renameSync(temp, dest);
  }
  secrets() {
    const value = this.read('credentials', null);
    if (!value) return {};
    return JSON.parse(this.safe.decryptString(Buffer.from(value.encrypted, 'base64')));
  }
  saveSecrets(value) {
    if (!this.safe.isEncryptionAvailable()) throw new Error('Windows 凭据加密暂不可用，未保存密钥');
    this.write('credentials', { encrypted: this.safe.encryptString(JSON.stringify(value)).toString('base64') });
  }
  host() { const c = this.read('host'); if (!c.id) { c.id = 'urn:uuid:' + crypto.randomUUID(); this.write('host', c); } return c.id; }
}
module.exports = { Storage };
