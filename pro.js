/* ============================================================
   원탭 숏폼 스튜디오 · pro.js  v1.0.0
   ------------------------------------------------------------
   Pro 연결 슬롯 (ProConnect 호환 규격)
   · 대중적인 상위 3개 API를 1·2·3번 원클릭 카드로, 자체 서버는 4번.
     1) OpenAI      대본 + 이미지 + AI 성우 TTS
     2) Google Gemini  대본 + Imagen 이미지
     3) Anthropic Claude  고퀄리티 대본
     4) 자체 API 서버 (커스텀 프록시)
   · 키는 sessionStorage 에만. 서버로 보내지 않는다.
   · 연결하지 않아도 앱의 무료 기능은 100% 동작한다.
   ============================================================ */
(function (root) {
  'use strict';

  var STORE_KEY = 'shorts-video-studio.pro';
  var TIMEOUT = 90000;

  var PROVIDERS = [
    {
      id: 'openai', rank: 1, name: 'OpenAI', tag: '올인원',
      desc: '대본 + 컷 이미지 + AI 성우 TTS를 한 키로',
      caps: ['script', 'image', 'tts'],
      models: { script: 'gpt-4.1-mini', image: 'gpt-image-1', tts: 'tts-1' },
      keyHint: 'API 키 붙여넣기', docs: 'platform.openai.com', accent: '#10a37f',
      note: '세 기능을 모두 씁니다. 이미지 모델은 gpt-image-1, 음성은 tts-1이 기본값입니다.'
    },
    {
      id: 'gemini', rank: 2, name: 'Google Gemini', tag: '대본 + 이미지',
      desc: '대본은 Gemini, 컷 이미지는 Imagen',
      caps: ['script', 'image'],
      models: { script: 'gemini-2.5-flash', image: 'imagen-4.0-generate-001' },
      keyHint: 'API 키 붙여넣기', docs: 'aistudio.google.com', accent: '#4285f4',
      note: '음성 합성은 지원하지 않습니다. 성우가 필요하면 OpenAI나 자체 서버를 쓰세요.'
    },
    {
      id: 'claude', rank: 3, name: 'Anthropic Claude', tag: '고퀄 대본',
      desc: '긴 호흡의 대본·카피에 강한 모델',
      caps: ['script'],
      models: { script: 'claude-sonnet-4-5' },
      keyHint: 'API 키 붙여넣기', docs: 'console.anthropic.com', accent: '#d97757',
      note: '대본만 지원합니다. 이미지·음성은 다른 제공자나 자체 서버가 필요합니다.'
    },
    {
      id: 'custom', rank: 4, name: '자체 API 서버', tag: '커스텀 프록시',
      desc: '키를 서버에 두고 /script · /image · /tts 규격으로 연결',
      caps: ['script', 'image', 'tts'],
      models: { script: 'script', image: 'image', tts: 'tts' },
      keyHint: '서버 접근 토큰 (선택)', docs: '내 서버', accent: '#6a5b4a',
      needsBase: true,
      note: 'POST {base}/script, {base}/image, {base}/tts. 응답은 {text} 또는 {cuts}, {imageUrl|b64}, 오디오 바이너리.'
    }
  ];

  function providerById(id) {
    for (var i = 0; i < PROVIDERS.length; i++) if (PROVIDERS[i].id === id) return PROVIDERS[i];
    return PROVIDERS[0];
  }

  function defaults() {
    var cfg = { provider: 'openai', voice: 'nova', entries: {} };
    PROVIDERS.forEach(function (p) {
      cfg.entries[p.id] = {
        key: '', model: p.models.script, baseUrl: '', connected: false,
        imageModel: p.models.image || '', ttsModel: p.models.tts || ''
      };
    });
    return cfg;
  }

  function normalize(raw) {
    var base = defaults();
    if (!raw || typeof raw !== 'object') return base;
    base.provider = providerById(raw.provider).id;
    base.voice = String(raw.voice || 'nova');
    PROVIDERS.forEach(function (p) {
      var e = (raw.entries || {})[p.id];
      if (!e) return;
      base.entries[p.id].key = typeof e.key === 'string' ? e.key : '';
      base.entries[p.id].model = typeof e.model === 'string' && e.model ? e.model : p.models.script;
      base.entries[p.id].imageModel = typeof e.imageModel === 'string' && e.imageModel ? e.imageModel : (p.models.image || '');
      base.entries[p.id].ttsModel = typeof e.ttsModel === 'string' && e.ttsModel ? e.ttsModel : (p.models.tts || '');
      base.entries[p.id].baseUrl = typeof e.baseUrl === 'string' ? e.baseUrl : '';
      base.entries[p.id].connected = !!e.connected;
    });
    return base;
  }

  function load() {
    try {
      var raw = root.sessionStorage && root.sessionStorage.getItem(STORE_KEY);
      if (!raw) return defaults();
      return normalize(JSON.parse(raw));
    } catch (e) { return defaults(); }
  }

  function save(cfg) {
    try {
      if (!root.sessionStorage) return false;
      root.sessionStorage.setItem(STORE_KEY, JSON.stringify(cfg));
      return true;
    } catch (e) { return false; }
  }

  function clear() {
    try { if (root.sessionStorage) root.sessionStorage.removeItem(STORE_KEY); } catch (e) { /* noop */ }
    return defaults();
  }

  function entry(cfg, id) {
    var c = cfg || defaults();
    var p = providerById(id || c.provider);
    return { provider: p, data: c.entries[p.id] || defaults().entries[p.id] };
  }

  function hasAccess(cfg) {
    var e = entry(cfg);
    return !!(e.data.key || (e.provider.needsBase && e.data.baseUrl));
  }

  function isConnected(cfg) {
    var e = entry(cfg);
    return hasAccess(cfg) && !!e.data.connected;
  }

  function maskKey(key) {
    var k = String(key || '');
    if (!k) return '';
    if (k.length <= 8) return '••••••••';
    return k.slice(0, 3) + '••••••••' + k.slice(-2);
  }

  function normalizeBase(url) {
    var u = String(url || '').trim().replace(/\/+$/, '');
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }

  /* ── HTTP ─────────────────────────────────────────────── */
  function http(url, opts) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT) : null;
    var init = {
      method: (opts && opts.method) || 'GET',
      headers: (opts && opts.headers) || {},
      signal: controller ? controller.signal : undefined
    };
    if (opts && opts.body !== undefined) init.body = opts.body;
    return fetch(url, init).then(function (res) {
      return res.text().then(function (text) {
        if (timer) clearTimeout(timer);
        if (!res.ok) {
          var msg = '';
          try { var j = JSON.parse(text); msg = (j.error && (j.error.message || j.error.type)) || j.message || ''; } catch (e) { msg = String(text).slice(0, 160); }
          var err = new Error(friendly(res.status, msg));
          err.status = res.status;
          throw err;
        }
        return { res: res, text: text };
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.status) throw err;
      if (err && err.name === 'AbortError') throw new Error('응답이 90초 안에 오지 않았습니다. 네트워크와 모델 이름을 확인하세요.');
      throw new Error('요청을 보내지 못했습니다. 브라우저 직접 호출이 차단(CORS)되었거나 주소가 틀렸을 수 있습니다. ' + (err && err.message ? '(' + err.message + ')' : ''));
    });
  }

  function friendly(status, msg) {
    if (status === 401 || status === 403) return '키가 올바르지 않거나 이 기능에 대한 권한이 없습니다.';
    if (status === 404) return '모델 이름이나 주소를 찾지 못했습니다. 모델 칸을 확인하세요. ' + (msg || '');
    if (status === 429) return '한도(quota)를 초과했습니다. 잠시 뒤 다시 시도하거나 결제 상태를 확인하세요.';
    if (status >= 500) return '제공자 서버 오류입니다. 잠시 뒤 다시 시도하세요.';
    return '요청이 거절되었습니다(' + status + '). ' + (msg || '');
  }

  function json(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  /* ── 연결 확인 ────────────────────────────────────────── */
  function test(cfg) {
    var e = entry(cfg);
    var p = e.provider, d = e.data;
    if (!hasAccess(cfg)) return Promise.reject(new Error('키를 먼저 입력하세요.'));
    if (p.id === 'openai') {
      return http('https://api.openai.com/v1/models?limit=1', {
        headers: { Authorization: 'Bearer ' + d.key }
      }).then(function () { return { ok: true, label: 'OpenAI 연결됨', detail: '모델 목록을 확인했습니다.' }; });
    }
    if (p.id === 'gemini') {
      return http('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=' + encodeURIComponent(d.key))
        .then(function () { return { ok: true, label: 'Gemini 연결됨', detail: '모델 목록을 확인했습니다.' }; });
    }
    if (p.id === 'claude') {
      return http('https://api.anthropic.com/v1/models?limit=1', {
        headers: {
          'x-api-key': d.key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        }
      }).then(function () { return { ok: true, label: 'Claude 연결됨', detail: '모델 목록을 확인했습니다.' }; });
    }
    var base = normalizeBase(d.baseUrl);
    if (!base) return Promise.reject(new Error('자체 서버 주소를 입력하세요.'));
    var headers = d.key ? { Authorization: 'Bearer ' + d.key } : {};
    return http(base + '/health', { headers: headers })
      .then(function () { return { ok: true, label: '자체 서버 연결됨', detail: base + '/health 응답 확인.' }; })
      .catch(function (err) {
        if (err && err.status === 404) {
          return http(base, { headers: headers }).then(function () {
            return { ok: true, label: '자체 서버 연결됨', detail: '/health 는 없지만 서버가 응답합니다.' };
          });
        }
        throw err;
      });
  }

  /* ── 대본 ─────────────────────────────────────────────── */
  function script(cfg, opts) {
    var e = entry(cfg);
    var p = e.provider, d = e.data;
    var prompt = opts && opts.prompt ? opts.prompt : '';
    if (!prompt) return Promise.reject(new Error('프롬프트가 비었습니다.'));
    if (!hasAccess(cfg)) return Promise.reject(new Error('키를 먼저 입력하거나 무료 모드로 대본을 만드세요.'));
    var model = d.model || p.models.script;

    if (p.id === 'openai') {
      return http('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.key },
        body: JSON.stringify({
          model: model,
          temperature: 0.85,
          messages: [
            { role: 'system', content: '한국어 숏폼 대본 작가. 요청한 JSON 배열만 출력한다. 설명, 인사, 코드블록 금지.' },
            { role: 'user', content: prompt }
          ]
        })
      }).then(function (r) {
        var data = json(r.text) || {};
        var text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!text) throw new Error('응답에서 대본을 찾지 못했습니다.');
        return { text: text, model: model };
      });
    }
    if (p.id === 'gemini') {
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
        ':generateContent?key=' + encodeURIComponent(d.key);
      return http(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 2048 }
        })
      }).then(function (r) {
        var data = json(r.text) || {};
        var cand = data.candidates && data.candidates[0];
        var text = cand && cand.content && cand.content.parts ? cand.content.parts.map(function (x) { return x.text || ''; }).join('\n') : '';
        if (!text) throw new Error('응답에서 대본을 찾지 못했습니다.' + (data.promptFeedback ? ' (차단: ' + data.promptFeedback.blockReason + ')' : ''));
        return { text: text, model: model };
      });
    }
    if (p.id === 'claude') {
      return http('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': d.key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 1600,
          temperature: 0.85,
          messages: [{ role: 'user', content: prompt }]
        })
      }).then(function (r) {
        var data = json(r.text) || {};
        var text = (data.content || []).map(function (b) { return b.text || ''; }).join('\n').trim();
        if (!text) throw new Error('응답에서 대본을 찾지 못했습니다.');
        return { text: text, model: model };
      });
    }
    var base = normalizeBase(d.baseUrl);
    if (!base) return Promise.reject(new Error('자체 서버 주소를 입력하세요.'));
    return http(base + '/script', {
      method: 'POST',
      headers: withJsonAuth(d),
      body: JSON.stringify({
        prompt: prompt, topic: opts.topic, tone: opts.tone, platform: opts.platform, model: model
      })
    }).then(function (r) {
      var data = json(r.text);
      if (!data) throw new Error('자체 서버 응답이 JSON이 아닙니다.');
      var text = data.text || data.content || (data.cuts ? JSON.stringify(data.cuts) : '');
      if (!text) throw new Error('자체 서버 응답에 text 또는 cuts가 없습니다.');
      return { text: text, model: model };
    });
  }

  /* ── 컷 이미지 ────────────────────────────────────────── */
  function image(cfg, prompt, size) {
    var e = entry(cfg);
    var p = e.provider, d = e.data;
    if (!hasAccess(cfg)) return Promise.reject(new Error('키를 먼저 입력하세요.'));
    if (p.caps.indexOf('image') < 0) {
      return Promise.reject(new Error(p.name + '는 이미지 생성을 지원하지 않습니다. Gemini(Imagen)나 OpenAI를 선택하세요.'));
    }
    var model = d.imageModel || p.models.image;

    if (p.id === 'openai') {
      return http('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.key },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          n: 1,
          size: size || '1024x1536'
        })
      }).then(function (r) {
        var data = json(r.text) || {};
        var item = data.data && data.data[0];
        if (!item) throw new Error('이미지 응답이 비었습니다.');
        if (item.b64_json) return { dataUrl: 'data:image/png;base64,' + item.b64_json, model: model };
        if (item.url) return { url: item.url, model: model };
        throw new Error('이미지 데이터가 없습니다.');
      });
    }
    if (p.id === 'gemini') {
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
        ':predict?key=' + encodeURIComponent(d.key);
      return http(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: prompt }],
          parameters: { sampleCount: 1, aspectRatio: '9:16' }
        })
      }).then(function (r) {
        var data = json(r.text) || {};
        var pred = data.predictions && data.predictions[0];
        var b64 = pred && (pred.bytesBase64Encoded || (pred.image && pred.image.imageBytes));
        if (!b64) throw new Error('Imagen 응답에 이미지가 없습니다. 모델 이름(imagen-…)과 API 사용 설정을 확인하세요.');
        var mime = (pred.mimeType || 'image/png');
        return { dataUrl: 'data:' + mime + ';base64,' + b64, model: model };
      });
    }
    var base = normalizeBase(d.baseUrl);
    if (!base) return Promise.reject(new Error('자체 서버 주소를 입력하세요.'));
    return http(base + '/image', {
      method: 'POST',
      headers: withJsonAuth(d),
      body: JSON.stringify({ prompt: prompt, size: size || '1024x1536', model: model })
    }).then(function (r) {
      var data = json(r.text);
      if (!data) throw new Error('자체 서버 응답이 JSON이 아닙니다.');
      if (data.dataUrl) return { dataUrl: data.dataUrl, model: model };
      if (data.b64) return { dataUrl: 'data:image/png;base64,' + data.b64, model: model };
      if (data.imageUrl) return { url: data.imageUrl, model: model };
      throw new Error('자체 서버 응답에 imageUrl 또는 b64가 없습니다.');
    });
  }

  /* ── 성우 TTS ─────────────────────────────────────────── */
  function tts(cfg, text, voice, speed) {
    var e = entry(cfg);
    var p = e.provider, d = e.data;
    if (!hasAccess(cfg)) return Promise.reject(new Error('키를 먼저 입력하세요.'));
    if (p.caps.indexOf('tts') < 0) {
      return Promise.reject(new Error(p.name + '는 음성 합성을 지원하지 않습니다. OpenAI나 자체 서버를 쓰세요.'));
    }
    var input = String(text || '').trim();
    if (!input) return Promise.reject(new Error('읽을 문장이 없습니다.'));
    if (input.length > 4000) input = input.slice(0, 4000);
    var model = d.ttsModel || p.models.tts;
    var rate = Number(speed);
    if (!(rate >= 0.25 && rate <= 4)) rate = 1;

    if (p.id === 'openai') {
      return fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.key },
        body: JSON.stringify({
          model: model,
          voice: voice || 'nova',
          input: input,
          speed: rate,
          response_format: 'mp3'
        })
      }).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            var j = json(t) || {};
            throw new Error(friendly(res.status, (j.error && j.error.message) || ''));
          });
        }
        return res.blob().then(function (blob) {
          if (!blob.size) throw new Error('음성 데이터가 비었습니다.');
          return { blob: blob, model: model };
        });
      }).catch(function (err) {
        if (err && err.status) throw err;
        if (err && /권한|한도|거절|키가/.test(err.message || '')) throw err;
        throw new Error('음성 요청을 보내지 못했습니다. ' + (err && err.message ? err.message : ''));
      });
    }
    var base = normalizeBase(d.baseUrl);
    if (!base) return Promise.reject(new Error('자체 서버 주소를 입력하세요.'));
    return fetch(base + '/tts', {
      method: 'POST',
      headers: withJsonAuth(d),
      body: JSON.stringify({ text: input, voice: voice || 'nova', model: model, speed: rate })
    }).then(function (res) {
      if (!res.ok) throw new Error('자체 서버 음성 요청이 실패했습니다(' + res.status + ').');
      return res.blob().then(function (blob) {
        if (!blob.size) throw new Error('음성 데이터가 비었습니다.');
        return { blob: blob, model: model };
      });
    }).catch(function (err) {
      throw new Error(err && err.message ? err.message : '음성 요청에 실패했습니다.');
    });
  }

  function withJsonAuth(d) {
    var h = { 'Content-Type': 'application/json' };
    if (d.key) h.Authorization = 'Bearer ' + d.key;
    return h;
  }

  /** 오디오 Blob → AudioBuffer (녹화에 오디오 트랙으로 합성) */
  function decodeAudio(blob) {
    var Ctx = root.AudioContext || root.webkitAudioContext;
    if (!Ctx) return Promise.reject(new Error('이 브라우저는 오디오 디코딩을 지원하지 않습니다.'));
    var ac = new Ctx();
    return blob.arrayBuffer().then(function (buf) {
      return new Promise(function (resolve, reject) {
        ac.decodeAudioData(buf, function (audio) {
          ac.close().catch(function () {});
          resolve(audio);
        }, function () {
          ac.close().catch(function () {});
          reject(new Error('음성 파일을 해독하지 못했습니다.'));
        });
      });
    });
  }

  root.ShortsPro = {
    PROVIDERS: PROVIDERS,
    providerById: providerById,
    defaults: defaults,
    load: load,
    save: save,
    clear: clear,
    entry: entry,
    hasAccess: hasAccess,
    isConnected: isConnected,
    maskKey: maskKey,
    normalizeBase: normalizeBase,
    test: test,
    script: script,
    image: image,
    tts: tts,
    decodeAudio: decodeAudio,
    _storeKey: STORE_KEY
  };
})(typeof self !== 'undefined' ? self : this);
