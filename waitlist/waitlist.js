// 대기 명단 한 장(이슈 74): 앱 화면과 따로 도는 정적 페이지의 스크립트. 한국어(ko/)·영어(이 폴더) 두 쪽이 같이 쓴다.
// 하는 일: 방문 세기(날짜·언어·출처 합계만), 이메일 등록, 등록 뒤 선택 답, 명단에서 빼기, 시연 그림 돌리기.
// 서버는 supabase/waitlist.sql 의 함수만 부른다(공개 키, 로그인 없음). 글은 모두 HTML 에 있고 여기엔 문구가 없다.

// 서버 주소·키는 src/data/config.js 와 같아야 한다(tests/waitlist.test.js 가 본다). publishable 키는 공개해도 되는 값이다
export const SERVER = {
  url: 'https://yzldtywsqlhnunluayyc.supabase.co',
  key: 'sb_publishable_gO1FKK1yvQ2kMqtJO7n_0A_3PQBNKFc',
};
// 문의·삭제 요청을 받을 주소. 비어 있으면 그 줄을 그리지 않는다(공개할 주소는 운영자가 정한다)
export const CONTACT = '';

export const cleanSrc = s => (/^[a-z0-9_-]{1,16}$/.test(String(s || '').toLowerCase()) ? String(s).toLowerCase() : '');
export const validEmail = s => s.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

// 선택 답: 고른 것만 담는다. 아무것도 안 골랐으면 null(보내지 않는다)
export function readAnswers(form) {
  const fd = new FormData(form);
  const a = {};
  const ai = fd.getAll('ai');
  if (ai.length) a.ai = ai;
  if (fd.get('pain')) a.pain = fd.get('pain');
  if (fd.get('dev')) a.dev = fd.get('dev') === 'yes';
  const task = String(fd.get('task') || '').trim().slice(0, 200);
  if (task) a.task = task;
  return Object.keys(a).length ? a : null;
}

async function rpc(fn, body) {
  // 개발 서버(localhost)에서는 실제 서버에 보내지 않는다(방문·등록 수가 흐려지지 않게). 화면 검사는 cb-wl-live 로 켜고 요청을 가로챈다
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !store('cb-wl-live')) {
    await new Promise(r => setTimeout(r, 300));
    return fn === 'waitlist_join' ? '00000000-0000-4000-8000-000000000000' : true;
  }
  const r = await fetch(`${SERVER.url}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: SERVER.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${fn} ${r.status}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

// 사생활 보호 모드처럼 저장소가 막힌 브라우저에서도 죽지 않게
function store(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* 막힘 */ }
  return null;
}

function init() {
  const lang = document.documentElement.lang === 'ko' ? 'ko' : 'en';
  const src = cleanSrc(new URLSearchParams(location.search).get('s'));
  // 언어를 바꿔도 출처 꼬리표가 따라가게
  if (src) for (const a of document.querySelectorAll('a[data-keep-src]')) a.setAttribute('href', `${a.getAttribute('href')}?s=${src}`);

  // 방문 세기: 검색 로봇·미리보기 로봇은 뺀다. 브라우저에는 '와 본 적 있음' 표시 하나만 남긴다(쿠키·추적 도구 없음)
  if (!/bot|crawl|spider|preview|headless/i.test(navigator.userAgent)) {
    const first = !store('cb-wl-seen');
    store('cb-wl-seen', '1');
    rpc('waitlist_hit', { p_lang: lang, p_src: src, p_new: first }).catch(() => {});
  }

  const $ = s => document.querySelector(s);
  const show = (el, on) => { el.hidden = !on; };
  const say = (form, key) => {
    const out = form.querySelector('[role=status]');
    out.textContent = key ? form.dataset[key] : '';
    out.classList.toggle('bad', !!key);
  };
  const busy = (form, on) => { for (const b of form.querySelectorAll('button')) b.disabled = on; };

  let token = null;
  const join = $('#join'), thanks = $('#thanks'), survey = $('#survey'), done = $('#survey-done');
  join.addEventListener('submit', async e => {
    e.preventDefault();
    const email = join.email.value.trim();
    if (!validEmail(email)) { say(join, 'bad'); join.email.focus(); return; }
    say(join, ''); busy(join, true);
    try {
      // 숨은 칸(사람 눈에 안 보임)을 채운 것은 자동 입력 로봇이다. 보내지 않고 된 것처럼 보인다
      token = join.company.value ? null : await rpc('waitlist_join', { p_email: email, p_lang: lang, p_src: src });
      show(join, false); show(thanks, true);
      thanks.querySelector('h2').focus();
    } catch { say(join, 'fail'); }
    busy(join, false);
  });
  survey.addEventListener('submit', async e => {
    e.preventDefault();
    const a = readAnswers(survey);
    busy(survey, true);
    try {
      if (a && token) await rpc('waitlist_answer', { p_token: token, p_answers: a });
      show(survey, false); show(done, true);
    } catch { say(survey, 'fail'); }
    busy(survey, false);
  });
  $('#survey-skip').addEventListener('click', () => show(survey, false));

  const leave = $('#leave');
  leave.addEventListener('submit', async e => {
    e.preventDefault();
    const email = leave.email.value.trim();
    if (!validEmail(email)) { say(leave, 'bad'); return; }
    busy(leave, true);
    try { await rpc('waitlist_leave', { p_email: email }); leave.reset(); say(leave, 'ok'); leave.querySelector('[role=status]').classList.remove('bad'); }
    catch { say(leave, 'fail'); }
    busy(leave, false);
  });

  if (CONTACT) for (const el of document.querySelectorAll('[data-contact]')) {
    el.hidden = false;
    const a = el.querySelector('a');
    a.href = `mailto:${CONTACT}`; a.textContent = CONTACT;
  }

  demo($('[data-demo]'));
}

// 시연 그림: data-step 을 0→5 로 넘기며 돈다(모양은 waitlist.css 가 단계별로 그린다).
// 0 빈 입력 줄 → 1 적는 중 → 2 할 일이 생김 → 3 맡김(실행 요청) → 4 내 AI 가 실행 중 → 5 결과가 그 할 일에
const STEPS = [1000, 2600, 1100, 1500, 3200, 5200];
function demo(el) {
  if (!el) return;
  const typed = el.querySelector('[data-type]');
  const text = typed.dataset.type;
  // 동작 줄이기 설정이면 마지막 그림(결과)에서 멈춘 채로 둔다(HTML 의 처음 값이 5)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let timer;
  const go = n => {
    el.dataset.step = n;
    clearInterval(timer);
    typed.textContent = '';
    if (n === 1) {
      let i = 0;
      timer = setInterval(() => { typed.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(timer); }, (STEPS[1] - 500) / text.length);
    }
    setTimeout(() => go((n + 1) % STEPS.length), STEPS[n]);
  };
  go(0);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}
