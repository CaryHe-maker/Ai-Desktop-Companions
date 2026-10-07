const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
// Local conversations for companions that talk through an API. Each pet keeps an
// index (sessions-<pet>.json) and one file of messages per conversation.
const LIMIT = 24 * 1024 * 1024;
function titleOf(messages) {
  const first = messages.find(m => m.role === 'user');
  if (!first) return '新的对话';
  const text = (first.text || '').replace(/\s+/g, ' ').trim();
  return text ? (text.length > 28 ? text.slice(0, 28) + '…' : text) : '图片对话';
}
class Sessions {
  constructor(store) { this.store = store; }
  file(pet, id) { return `session-${pet}-${id}`; }
  index(pet) {
    const index = this.store.read('sessions-' + pet, null);
    if (index) return index;
    // First run after the upgrade: the single old history becomes the first conversation.
    const old = this.store.read('history-' + pet, []), fresh = { current: null, list: [] };
    if (old.length) { const item = this.entry(old); item.title = titleOf(old); this.store.write(this.file(pet, item.id), old); fresh.list.push(item); fresh.current = item.id; }
    this.store.write('sessions-' + pet, fresh); return fresh;
  }
  entry(messages = []) {
    const now = Date.now(), last = messages.at(-1);
    return { id: crypto.randomUUID(), title: '新的对话', custom: false, created: now, updated: now, count: messages.length, preview: (last?.text || '').replace(/\s+/g, ' ').slice(0, 60) };
  }
  overview(pet) { const index = this.index(pet); return { current: index.current, list: [...index.list].sort((a, b) => b.updated - a.updated) }; }
  find(index, id) {
    const item = typeof id === 'string' && index.list.find(s => s.id === id);
    if (!item) throw new Error('找不到这段对话');
    return item;
  }
  // The conversation new messages belong to; created lazily so empty ones never pile up.
  current(pet) {
    const index = this.index(pet);
    if (index.current && index.list.some(s => s.id === index.current)) return index.current;
    return this.create(pet);
  }
  create(pet) {
    const index = this.index(pet), empty = index.list.find(s => !s.count);
    const item = empty || this.entry();
    if (!empty) index.list.push(item);
    item.updated = Date.now(); index.current = item.id; this.store.write('sessions-' + pet, index); return item.id;
  }
  open(pet, id) { const index = this.index(pet); index.current = this.find(index, id).id; this.store.write('sessions-' + pet, index); }
  messages(pet, id) {
    const index = this.index(pet); id = id || index.current;
    return id && index.list.some(s => s.id === id) ? this.store.read(this.file(pet, id), []) : [];
  }
  save(pet, id, messages) {
    const index = this.index(pet), item = this.find(index, id);
    while (messages.length > 2 && JSON.stringify(messages).length > LIMIT) messages = messages.slice(2);
    this.store.write(this.file(pet, id), messages);
    const last = messages.at(-1);
    Object.assign(item, { updated: Date.now(), count: messages.length, preview: (last?.text || '').replace(/\s+/g, ' ').slice(0, 60) });
    if (!item.custom) item.title = titleOf(messages);
    this.store.write('sessions-' + pet, index);
  }
  rename(pet, id, title) {
    if (typeof title !== 'string' || !title.trim() || title.length > 60) throw new Error('标题需为 1～60 个字');
    const index = this.index(pet), item = this.find(index, id);
    item.title = title.trim(); item.custom = true; this.store.write('sessions-' + pet, index);
  }
  remove(pet, id) {
    const index = this.index(pet), item = this.find(index, id);
    index.list = index.list.filter(s => s !== item);
    if (index.current === id) index.current = [...index.list].sort((a, b) => b.updated - a.updated)[0]?.id || null;
    this.store.write('sessions-' + pet, index);
    fs.rmSync(path.join(this.store.dir, this.file(pet, id) + '.json'), { force: true });
  }
}
module.exports = { Sessions, titleOf };
