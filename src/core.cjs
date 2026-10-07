const CLAUDE_REPLY = 'emmm你是不是在东八区';
const PETS = ['gpt', 'claude', 'deepseek'];
function validPet(id) { if (!PETS.includes(id)) throw new Error('未知角色'); return id; }
function validateMessage(value) {
  if (!value || typeof value.text !== 'string' || value.text.length > 16000) throw new Error('消息过长（最多 16000 字）');
  const images = value.images || [];
  if (!Array.isArray(images) || images.length > 4) throw new Error('每次最多发送 4 张图片');
  let size = 0;
  for (const image of images) {
    if (typeof image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) throw new Error('图片格式不支持');
    size += image.length;
  }
  if (size > 16 * 1024 * 1024) throw new Error('图片合计过大，请压缩后重试');
  if (!value.text.trim() && !images.length) throw new Error('请先输入问题或添加图片');
  return { role: 'user', text: value.text.trim(), images, web: Boolean(value.web) };
}
function responseInput(messages) {
  return messages.map(m => m.role === 'assistant' ? { role: 'assistant', content: m.text } : {
    role: 'user', content: [ ...(m.text ? [{ type: 'input_text', text: m.text }] : []), ...(m.images || []).map(url => ({ type: 'input_image', image_url: url })) ]
  });
}
function deepseekInput(messages) {
  return messages.map(m => ({ role: m.role, content: m.images?.length ? [
    { type: 'text', text: m.text || '请描述这张图片。' }, ...m.images.map(url => ({ type: 'image_url', image_url: { url } }))
  ] : m.text }));
}
async function* sse(response) {
  if (!response.body) throw new Error('服务器未返回数据流');
  let buffer = ''; const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, ''); buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      try { yield JSON.parse(raw); } catch { throw new Error('服务器数据流格式异常'); }
    }
  }
  buffer += decoder.decode();
  if (buffer.startsWith('data:') && buffer.slice(5).trim() !== '[DONE]') {
    try { yield JSON.parse(buffer.slice(5)); } catch { throw new Error('回答传输中断，请重试'); }
  }
}
function safeURL(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function trimHistory(history) {
  // Keep whole exchanges and bound disk / subsequent prompt size.
  let out = history.slice(-40);
  while (out.length > 2 && JSON.stringify(out).length > 24 * 1024 * 1024) out = out.slice(2);
  if (out[0]?.role === 'assistant') out.shift();
  return out;
}
module.exports = { CLAUDE_REPLY, PETS, validPet, validateMessage, responseInput, deepseekInput, sse, safeURL, trimHistory };
