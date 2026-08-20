var KaraokeRomanize = (function () {

  const RE = {
    kana: /[\u3040-\u309F\u30A0-\u30FF]/,
    han:  /[\u3400-\u4DBF\u4E00-\u9FFF]/,
    hang: /[\uAC00-\uD7A3]/,
    cjk:  /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7A3]/g
  };

  function detect(text) {
    if (!text) return null;
    if (RE.kana.test(text)) return 'ja';
    if (RE.hang.test(text)) return 'ko';
    if (RE.han.test(text))  return 'zh';
    return null;
  }

  function latinRatio(text) {
    const s = (text || '').replace(/\s/g, '');
    if (!s.length) return 1;
    return 1 - (s.match(RE.cjk) || []).length / s.length;
  }

  const KANA = {
    'あ':'a','い':'i','う':'u','え':'e','お':'o',
    'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
    'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
    'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
    'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
    'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
    'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
    'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
    'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
    'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
    'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
    'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
    'や':'ya','ゆ':'yu','よ':'yo',
    'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
    'わ':'wa','ゐ':'wi','ゑ':'we','を':'o','ん':'n',
    'ぁ':'a','ぃ':'i','ぅ':'u','ぇ':'e','ぉ':'o',
    'ゃ':'ya','ゅ':'yu','ょ':'yo',
    'ゔ':'vu','ゕ':'ka','ゖ':'ke'
  };

  const DIGRAPH = {
    'きゃ':'kya','きゅ':'kyu','きょ':'kyo','きぇ':'kye',
    'ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
    'しゃ':'sha','しゅ':'shu','しょ':'sho','しぇ':'she',
    'じゃ':'ja','じゅ':'ju','じょ':'jo','じぇ':'je',
    'ちゃ':'cha','ちゅ':'chu','ちょ':'cho','ちぇ':'che',
    'ぢゃ':'ja','ぢゅ':'ju','ぢょ':'jo',
    'にゃ':'nya','にゅ':'nyu','にょ':'nyo',
    'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo',
    'びゃ':'bya','びゅ':'byu','びょ':'byo',
    'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
    'みゃ':'mya','みゅ':'myu','みょ':'myo',
    'りゃ':'rya','りゅ':'ryu','りょ':'ryo',
    'ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo','ふゅ':'fyu',
    'ゔぁ':'va','ゔぃ':'vi','ゔぇ':'ve','ゔぉ':'vo',
    'てぃ':'ti','でぃ':'di','とぅ':'tu','どぅ':'du',
    'うぃ':'wi','うぇ':'we','うぉ':'wo',
    'つぁ':'tsa','つぃ':'tsi','つぇ':'tse','つぉ':'tso',
    'くぁ':'kwa','ぐぁ':'gwa'
  };

  const toHiragana = (s) =>
    s.replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

  function japanese(text) {
    const src = toHiragana(text || '');
    let out = '';
    let sokuon = false;

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];

      if (ch === 'っ') { sokuon = true; continue; }

      if (ch === 'ー') {
        const last = out.match(/[aiueo]$/);
        if (last) out += last[0];
        continue;
      }

      let r = DIGRAPH[src.slice(i, i + 2)];
      if (r) i++;
      else r = KANA[ch];

      if (!r) {
        sokuon = false;
        out += ch;
        continue;
      }

      if (sokuon) {
        r = (r.startsWith('ch') ? 't' : r[0]) + r;
        sokuon = false;
      }

      if (out.endsWith('n') && /^[aiueoy]/.test(r)) out += "'";

      out += r;
    }
    return out;
  }

  let PY = null;
  const setPinyinData = (d) => { PY = d; };
  const hasPinyinData = () => !!PY;

  function chinese(text) {
    if (!PY) return text;
    const s = text || '';
    const out = [];
    let i = 0;

    while (i < s.length) {
      if (!RE.han.test(s[i])) { out.push(s[i]); i++; continue; }

      let hit = null, len = 0;
      for (let n = 4; n >= 2; n--) {
        const cand = PY.phrases[s.slice(i, i + n)];
        if (cand) { hit = cand; len = n; break; }
      }
      if (hit) { out.push(' ' + hit + ' '); i += len; continue; }

      const single = PY.chars[s[i]];
      out.push(single ? ' ' + single + ' ' : s[i]);
      i++;
    }
    return out.join('').replace(/\s{2,}/g, ' ').trim();
  }

  const LEAD = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];

  const VOWEL = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo',
                 'u','wo','we','wi','yu','eu','ui','i'];

  const TAIL = ['','k','k','k','n','n','n','t','l','k','m','p','l','l','p','l','m',
                'p','p','t','t','ng','t','t','k','t','p','t'];

  function korean(text) {
    let out = '';
    for (const ch of (text || '')) {
      const c = ch.charCodeAt(0) - 0xAC00;
      if (c < 0 || c > 11171) { out += ch; continue; }
      out += LEAD[Math.floor(c / 588)] + VOWEL[Math.floor((c % 588) / 28)] + TAIL[c % 28];
    }
    return out;
  }

  function line(text, lang) {
    if (!text) return '';
    if (lang === 'ja') return japanese(text);
    if (lang === 'zh') return chinese(text);
    if (lang === 'ko') return korean(text);
    return text;
  }

  return { detect, line, latinRatio, setPinyinData, hasPinyinData };
})();
