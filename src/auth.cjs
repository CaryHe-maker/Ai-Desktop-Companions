const http = require('node:http');
const crypto = require('node:crypto');
const AUTH = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
class ChatGPTAuth {
  constructor(store, openExternal) { this.store = store; this.open = openExternal; this.pending = null; this.refreshing = null; }
  account() { return this.store.secrets().chatgpt || null; }
  async discovery() {
    const r = await fetch(AUTH + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('无法连接 OpenAI 登录服务');
    const d = await r.json();
    if (d.issuer !== AUTH || new URL(d.jwks_uri).origin !== AUTH) throw new Error('登录服务信息校验失败');
    return d;
  }
  async token(params) {
    const r = await fetch(AUTH + '/api/accounts/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) throw new Error(`ChatGPT 授权失败（${r.status}），请重新登录`);
    return r.json();
  }
  signIn() {
    if (this.pending) return this.pending;
    this.pending = this.performSignIn().finally(() => { this.pending = null; });
    return this.pending;
  }
  async performSignIn() {
    const existing = this.account();
    const registration = this.store.read('chatgpt-registration');
    const client = existing?.client_id || registration.client_id || 'dynamic_agent_client';
    const state = crypto.randomBytes(32).toString('base64url'), nonce = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const server = http.createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const redirect = `http://127.0.0.1:${server.address().port}/auth/callback`;
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        let received = false;
        timer = setTimeout(() => reject(new Error('登录超时，请再点一次登录')), 180000);
        server.on('request', async (req, res) => {
          const u = new URL(req.url, redirect);
          if (u.pathname !== '/auth/callback') { res.writeHead(404).end(); return; }
          if (u.searchParams.get('state') !== state) { res.writeHead(400).end('Invalid state'); return; }
          if (received) { res.writeHead(409).end(); return; } received = true;
          try {
            if (u.searchParams.has('error')) throw new Error('你取消了 ChatGPT 授权');
            const issued = u.searchParams.get('client_id') || (client !== 'dynamic_agent_client' ? client : null);
            if (!issued || issued === 'dynamic_agent_client' || (client !== 'dynamic_agent_client' && issued !== client)) throw new Error('ChatGPT 客户端注册不完整');
            this.store.write('chatgpt-registration', { client_id: issued });
            const code = u.searchParams.get('code'); if (!code) throw new Error('未收到授权码');
            const tokens = await this.token({ grant_type: 'authorization_code', client_id: issued, code, code_verifier: verifier, redirect_uri: redirect, resource: RESOURCE });
            const d = await this.discovery(); const jose = await import('jose');
            const { payload } = await jose.jwtVerify(tokens.id_token, jose.createRemoteJWKSet(new URL(d.jwks_uri)), { issuer: AUTH, audience: issued });
            if (payload.nonce !== nonce || !payload.sub || (existing?.subject && payload.sub !== existing.subject)) throw new Error('账号身份校验失败');
            if (!(tokens.scope || '').split(' ').includes('chatgpt.tokens.use.direct')) throw new Error('尚未授权使用 ChatGPT 会员额度，请重新登录并勾选授权');
            const secrets = this.store.secrets();
            secrets.chatgpt = { ...tokens, client_id: issued, subject: payload.sub, email: payload.email || 'ChatGPT account', expires_at: Date.now() + (tokens.expires_in || 3600) * 1000 };
            this.store.saveSecrets(secrets);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end('<!doctype html><meta charset="utf-8"><title>Deskbot</title><body style="font:20px system-ui;padding:60px;background:#f4f1fc;color:#453765"><h1>连接成功 ✦</h1><p>可以关闭此页面，回到桌面上的 GPT 小伙伴了。</p>');
            resolve({ email: secrets.chatgpt.email });
          } catch (error) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('登录未完成，请回到 Deskbot 查看提示。'); reject(error); }
        });
        const u = new URL(AUTH + '/api/accounts/authorize');
        Object.entries({ client_id: client, ext_agent_host_id: this.store.host(), response_type: 'code', redirect_uri: redirect,
          scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource: RESOURCE, state, nonce, code_challenge_method: 'S256', code_challenge: challenge
        }).forEach(([k,v]) => u.searchParams.set(k,v));
        if (client === 'dynamic_agent_client') u.searchParams.set('agent_name_hint', 'Deskbot Companions');
        if (existing?.id_token) u.searchParams.set('id_token_hint', existing.id_token);
        this.open(u.href).catch(reject);
      });
    } finally { clearTimeout(timer); server.close(); server.closeAllConnections(); }
  }
  async accessToken() {
    const a = this.account();
    if (!a?.access_token) throw new Error('请先在设置中点击 Continue with ChatGPT，连接你的 Plus 账号');
    if (a.expires_at > Date.now() + 60000) return a.access_token;
    if (!this.refreshing) this.refreshing = (async () => {
      const t = await this.token({ grant_type: 'refresh_token', client_id: a.client_id, refresh_token: a.refresh_token, resource: RESOURCE });
      if (t.scope && !t.scope.split(' ').includes('chatgpt.tokens.use.direct')) throw new Error('会员额度授权已失效，请重新登录');
      const s = this.store.secrets(); s.chatgpt = { ...a, ...t, expires_at: Date.now() + (t.expires_in || 3600) * 1000 }; this.store.saveSecrets(s);
      return t.access_token;
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async models() {
    const token = await this.accessToken();
    const r = await fetch(RESOURCE + '/models', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`模型列表获取失败（${r.status}）`);
    const data = await r.json();
    return (data.models || data.data || []).filter(m => !m.visibility || m.visibility === 'list').map(m => ({ id: m.slug || m.id, name: m.display_name || m.id || m.slug }));
  }
  async signOut() {
    if (this.pending || this.refreshing) throw new Error('请等待当前登录操作完成');
    const a = this.account(); let revoked = !a?.refresh_token;
    try {
      if (a?.refresh_token) {
        const d = await this.discovery();
        if (new URL(d.revocation_endpoint).origin !== AUTH) throw new Error('无效注销地址');
        const r = await fetch(d.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: a.refresh_token, token_type_hint: 'refresh_token', client_id: a.client_id }), signal: AbortSignal.timeout(15000) }); revoked = r.ok;
      }
    } catch {}
    const s = this.store.secrets(); delete s.chatgpt; this.store.saveSecrets(s);
    return { revoked };
  }
}
module.exports = { ChatGPTAuth };
