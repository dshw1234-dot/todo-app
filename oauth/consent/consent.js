// 원격 통로 동의 화면(아이폰_통로_설계.md 2장, 7장 3번). Supabase Auth 의 OAuth 2.1 서버가 Claude 의 로그인 요청을
// 이 페이지로 보낸다(?authorization_id=…). 여기서 할 일 앱 계정으로 로그인 → 요청 내용 보기 → 허용/거절.
// supabase-js 없이 fetch 만 쓴다(앱의 src/data/supa.js 와 같은 방식). 호출 주소는 supabase-js(auth-js 2.118)의
// getAuthorizationDetails·approveAuthorization·denyAuthorization 과 같다.
//
// 세션은 이 페이지 메모리에만 둔다(앱의 저장소와 섞지 않고, 탭을 닫으면 사라짐). 비밀번호·토큰은 어디에도 저장하지 않는다.

// 앱과 같은 서버·publishable 키(src/data/config.js 의 DEFAULT_SERVER. public/ 은 빌드 때 그대로 복사돼 src 를 import 할 수 없어서
// 값을 적어 둔다. 같은지는 tests/agent-remote.test.js 가 본다)
export const SERVER = {
  url: 'https://yzldtywsqlhnunluayyc.supabase.co',
  key: 'sb_publishable_gO1FKK1yvQ2kMqtJO7n_0A_3PQBNKFc',
};

const headers = (token, extra = {}) => ({
  apikey: SERVER.key, 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01',
  ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra,
});
const message = j => j.msg || j.error_description || j.message || j.error || '';

// 이메일·비밀번호 로그인(앱과 같은 /auth/v1/token?grant_type=password). 토큰만 돌려준다
export async function signIn(email, password, f = fetch) {
  const r = await f(`${SERVER.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: headers(null), body: JSON.stringify({ email, password }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const code = j.error_code || j.code || '';
    throw new Error(code === 'invalid_credentials' || /invalid login/i.test(message(j)) ? '이메일이나 비밀번호가 맞지 않습니다.' : message(j) || `로그인하지 못했습니다(${r.status}).`);
  }
  return { token: j.access_token, email: j.user?.email || email };
}

// 요청 내용: { authorization_id, client: { name, … }, redirect_uri, scope, … }
// 이미 허용한 적이 있으면 authorization_id 없이 { redirect_url } 만 온다(바로 돌아가면 된다)
export async function getDetails(id, token, f = fetch) {
  const r = await f(`${SERVER.url}/auth/v1/oauth/authorizations/${encodeURIComponent(id)}`, { headers: headers(token) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(message(j) || `요청을 읽지 못했습니다(${r.status}). 만료됐으면 Claude 에서 연결을 다시 시작해 주세요.`);
  return j;
}

// 허용(approve) / 거절(deny) → { redirect_url }
export async function decide(id, action, token, f = fetch) {
  if (action !== 'approve' && action !== 'deny') throw new Error('approve 또는 deny');
  const r = await f(`${SERVER.url}/auth/v1/oauth/authorizations/${encodeURIComponent(id)}/consent`, { method: 'POST', headers: headers(token), body: JSON.stringify({ action }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.redirect_url) throw new Error(message(j) || `처리하지 못했습니다(${r.status}).`);
  return j;
}

// 돌아갈 곳 설명: 호스트를 크게 보여 주고, claude.ai 가 아니면 경고(MCP 규격: 돌아갈 주소의 호스트를 분명히)
export function describeRedirect(uri) {
  let u;
  try { u = new URL(uri); } catch { return { host: String(uri || '?'), level: 'bad', note: '돌아갈 주소를 읽을 수 없습니다. 거절하세요.' }; }
  if (u.protocol === 'https:' && u.hostname === 'claude.ai') return { host: u.hostname, level: 'ok', note: 'Claude(웹·데스크톱·모바일 앱)의 커넥터 연결입니다.' };
  if (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)) return { host: u.host, level: 'warn', note: '이 컴퓨터 안의 프로그램(예: Claude Code)입니다. 지금 직접 연결을 시작한 게 아니면 거절하세요.' };
  return { host: u.host, level: 'warn', note: 'claude.ai 가 아닌 곳입니다. 직접 연결한 것이 아니면 거절하세요.' };
}

// 돌아가기: http(s) 주소만(다른 스킴으로 튀지 않게)
export const safeRedirect = url => /^https?:\/\//i.test(String(url || '')) ? url : null;

/* ── 화면 ── */
function start() {
  const $ = id => document.getElementById(id);
  const show = name => { for (const s of document.querySelectorAll('[data-step]')) s.hidden = s.dataset.step !== name; };
  const fail = text => { $('error').textContent = text; $('error').hidden = !text; };
  const go = url => { const u = safeRedirect(url); if (u) location.assign(u); else fail('돌아갈 주소가 이상해서 멈췄습니다.'); };
  const id = new URLSearchParams(location.search).get('authorization_id');
  let token = null;

  if (!id) { show('none'); return; }
  show('login');

  async function load() {
    fail('');
    show('wait');
    const d = await getDetails(id, token);
    if (!d.authorization_id && d.redirect_url) { go(d.redirect_url); return; } // 이미 허용함
    const r = describeRedirect(d.redirect_uri);
    $('client').textContent = d.client?.name || d.client?.client_name || '이름 없는 앱';
    $('host').textContent = r.host;
    $('host-note').textContent = r.note;
    $('host-box').dataset.level = r.level;
    $('scope').textContent = d.scope || 'email';
    show('ask');
  }

  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('login-btn');
    btn.disabled = true;
    try {
      const s = await signIn($('email').value.trim(), $('password').value);
      token = s.token;
      $('password').value = '';
      $('who').textContent = s.email;
      await load();
    } catch (err) { show('login'); fail(err.message); } finally { btn.disabled = false; }
  });
  for (const [btnId, action] of [['approve', 'approve'], ['deny', 'deny']]) {
    $(btnId).addEventListener('click', async () => {
      $('approve').disabled = $('deny').disabled = true;
      try { go((await decide(id, action, token)).redirect_url); } catch (err) { fail(err.message); $('approve').disabled = $('deny').disabled = false; }
    });
  }
}

if (typeof document !== 'undefined') start();
