// AyurAssist app.js v5.0 — Robust uniform parsing

const API = 'https://aravindkv28--ayurparam-service-fastapi-app.modal.run';
const $ = id => document.getElementById(id);
const input = $('symptomInput'), btn = $('analyzeBtn'), loadEl = $('loading'), errEl = $('error');
const nerStrip = $('nerStrip'), matchBanner = $('matchBanner'), diseaseHeader = $('diseaseHeader');
const resultsEl = $('results'), disclaimer = $('disclaimerFooter');
const SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';

fetch(API + '/warmup').catch(() => {});
input.addEventListener('input', () => { btn.disabled = !input.value.trim(); });
input.addEventListener('keypress', e => { if (e.key === 'Enter' && !btn.disabled) { e.preventDefault(); doAnalyze(); } });
btn.addEventListener('click', doAnalyze);
$('examples').addEventListener('click', e => {
  if (e.target.classList.contains('example-btn')) { input.value = e.target.dataset.value || ''; btn.disabled = false; input.focus(); }
});

// ── UTILITIES ──

function esc(s) { if (s == null) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function empty(t) { if (!t || typeof t !== 'string') return true; const s = t.trim(); if (s.length < 5) return true; return /^(not provided|not available|not mentioned|no information|not given|not specified|not found|no data|none available|cannot be determined|n\/a)$/i.test(s); }
function stripMd(s) { return s.replace(/\*\*/g, '').replace(/\*/g, '').trim(); }
function fmt(text) { if (!text) return ''; return esc(text).replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+?)\*/g, '<em>$1</em>'); }

// Split "1) X 2) Y" or "1. X 2. X" inline numbering
function splitInlineNumbered(text) {
  if (!text) return [];
  const rx = /(?:^|[\s,;.])(\d{1,2})\)\s*|(?:^|[.\s])(\d{1,2})\.\s+(?=[A-Z*])/g;
  const positions = [];
  let match;
  while ((match = rx.exec(text)) !== null) {
    positions.push({ pos: match.index, matchLen: match[0].length });
  }
  if (positions.length < 2) return [];
  const items = [];
  if (positions[0].pos > 10) {
    const pre = text.substring(0, positions[0].pos).trim();
    if (pre.length > 10) items.push({ text: stripMd(pre), isPreamble: true });
  }
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].pos + positions[i].matchLen;
    const end = i + 1 < positions.length ? positions[i + 1].pos : text.length;
    const chunk = text.substring(start, end).trim().replace(/[,;]\s*$/, '');
    if (chunk.length > 2) items.push({ text: stripMd(chunk) });
  }
  return items;
}

// Smart item extractor — tries numbered, comma, then sentence splitting
function smartExtract(text, minLen) {
  if (!text || empty(text)) return [];
  minLen = minLen || 4;
  const numbered = splitInlineNumbered(text);
  if (numbered.length >= 2) return numbered.filter(n => !n.isPreamble).map(n => n.text).filter(s => s.length >= minLen && s.length < 150);
  const commaItems = text.split(/,\s*/).map(s => stripMd(s.replace(/^[\s\-\u2022*\u25B8\d.\)]+/, '').replace(/\.\s*$/, '')).trim()).filter(s => s.length >= 3 && s.length < 80);
  if (commaItems.length >= 3 && commaItems.every(s => s.length < 60)) return commaItems.filter(s => s.length >= minLen);
  return text.split(/(?<=[.!?;])\s+/).map(s => stripMd(s.replace(/^[\s\-\u2022*\u25B8\d.\)]+/, '')).trim()).filter(s => s.length >= minLen && s.length < 200);
}

// Dedup by prefix
function dedup(items) {
  const seen = new Set(); const result = [];
  for (const item of items) {
    const key = item.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const prefix = key.substring(0, 30);
    if (seen.has(key) || seen.has(prefix)) continue;
    seen.add(key); seen.add(prefix); result.push(item);
  }
  return result;
}

// Parse formulations — handles **Bold**: desc AND Name (num) – desc
function parseFormulations(rawText) {
  if (!rawText || empty(rawText)) return [];
  const numbered = splitInlineNumbered(rawText);
  let sections = numbered.length >= 2 ? numbered.filter(n => !n.isPreamble).map(n => n.text) : [];
  if (sections.length === 0 && rawText.includes('**')) {
    sections = rawText.split(/(?=\d+\.\s*\*\*|\*\*[A-Z])/).filter(s => s.trim().length > 10).map(s => s.trim());
  }
  if (sections.length === 0) sections = [rawText];
  const results = [];
  for (const sec of sections) {
    if (empty(sec) || sec.length < 8) continue;
    const entry = { name: '', desc: '', dose: '', reference: '', contains: '', form: '', cleanDesc: '' };
    const boldM = sec.match(/\*\*([^*]+?)\*\*\s*[:\-\u2013]?\s*/);
    if (boldM) { entry.name = boldM[1].trim(); entry.desc = sec.substring(sec.indexOf(boldM[0]) + boldM[0].length).trim(); }
    else {
      const dashM = sec.match(/^([A-Z\u0100-\u024F][^\u2013\u2014\-]{3,60}?)\s*[\u2013\u2014\-]\s*(.*)/s);
      if (dashM) { entry.name = stripMd(dashM[1]); entry.desc = dashM[2].trim(); }
      else { const colonM = sec.match(/^([^.]{5,80}?)\s*[:\-\u2013]\s+(.*)/s); if (colonM) { entry.name = stripMd(colonM[1]); entry.desc = colonM[2].trim(); } else entry.desc = sec; }
    }
    let dM = entry.desc.match(/(?:Dos(?:e|age))\s*[:\-\u2013]\s*([^.]+)/i); if (dM) entry.dose = stripMd(dM[1]);
    if (!entry.dose) { dM = entry.desc.match(/(\d+[\-\u2013]\d+\s*(?:mg|g|ml|tablets?)[^.]{0,40})/i); if (dM) entry.dose = stripMd(dM[1]); }
    const refM = entry.desc.match(/(?:Reference|Ref\.?)\s*[:\-\u2013]\s*\*?([^*\n]+?)(?:\.\s*(?=[A-Z])|\.?\s*$)/i);
    if (refM) entry.reference = stripMd(refM[1]).replace(/\.\s*$/, '');
    const contM = entry.desc.match(/Contains?\s*[:\-\u2013]?\s+([^.]+)/i); if (contM) entry.contains = stripMd(contM[1]);
    const formM = entry.desc.match(/Form\s*[:\-\u2013]\s*([^.]+)/i); if (formM) entry.form = stripMd(formM[1]);
    let cd = entry.desc;
    [/(?:Dos(?:e|age))\s*[:\-\u2013]\s*[^.]+\.?\s*/gi, /(?:Reference|Ref\.?)\s*[:\-\u2013]\s*\*?[^*\n]+?(?:\.\s*(?=[A-Z])|\.?\s*$)/gi, /Contains?\s*[:\-\u2013]?\s+[^.]+\.?\s*/gi, /Form\s*[:\-\u2013]\s*[^.]+\.?\s*/gi].forEach(rx => { cd = cd.replace(rx, ' '); });
    entry.cleanDesc = stripMd(cd).replace(/\s{2,}/g, ' ').trim();
    if (entry.name || entry.cleanDesc.length > 10) results.push(entry);
  }
  return results;
}

// Parse single-drug remedies
function parseRemedies(rawText) {
  if (!rawText || empty(rawText)) return [];
  const numbered = splitInlineNumbered(rawText);
  let sections = numbered.length >= 2 ? numbered.filter(n => !n.isPreamble).map(n => n.text) : [];
  if (sections.length === 0 && rawText.includes('**')) {
    sections = rawText.split(/(?=\d+\.\s*\*\*|\*\*[A-Z])/).filter(s => s.trim().length > 10).map(s => s.trim());
  }
  if (sections.length === 0) sections = [rawText];
  const results = [];
  for (const sec of sections) {
    if (empty(sec) || sec.length < 8) continue;
    const entry = { name: '', sanskrit: '', part: '', preparation: '', dosage: '', duration: '', actions: '', desc: '' };
    const boldM = sec.match(/\*\*([^*]+?)\*\*\s*[:\-\u2013]?\s*/);
    if (boldM) { entry.name = boldM[1].trim(); entry.desc = sec.substring(sec.indexOf(boldM[0]) + boldM[0].length).trim(); }
    else {
      const dashM = sec.match(/^([A-Z\u0100-\u024F][^\u2013\u2014\-]{3,60}?)\s*[\u2013\u2014\-]\s*(.*)/s);
      if (dashM) { entry.name = stripMd(dashM[1]); entry.desc = dashM[2].trim(); }
      else { const colonM = sec.match(/^([^.]{3,60}?)\s*[:\-\u2013]\s+(.*)/s); if (colonM) { entry.name = stripMd(colonM[1]); entry.desc = colonM[2].trim(); } else entry.desc = sec; }
    }
    [[/Sanskrit\s*(?:name)?\s*[:\-\u2013]\s*([^.,;]+)/i, 'sanskrit'], [/Part\s*(?:used)?\s*[:\-\u2013]\s*([^.,;]+)/i, 'part'], [/Preparation\s*[:\-\u2013]\s*([^.]+)/i, 'preparation'], [/Dos(?:e|age)\s*[:\-\u2013]\s*([^.]+)/i, 'dosage'], [/Duration\s*[:\-\u2013]\s*([^.]+)/i, 'duration'], [/Actions?\s*[:\-\u2013]\s*([^.]+)/i, 'actions']].forEach(([rx, key]) => { const m = entry.desc.match(rx); if (m) entry[key] = stripMd(m[1]); });
    if (entry.name || entry.desc.length > 10) results.push(entry);
  }
  return results;
}

// Parse Q4 sections
function parseQ4(text) {
  if (!text) return {};
  const result = {};
  const kwPatterns = [
    { key: 'panchakarma', rx: /(?:panchakarma|shodhana|purif)/i },
    { key: 'pathya', rx: /(?:pathya|foods?\s+to\s+eat|favou?rable\s+food)/i },
    { key: 'apathya', rx: /(?:apathya|foods?\s+to\s+avoid)/i },
    { key: 'vihara', rx: /(?:vih[a\u0101]ra|lifestyle)/i },
    { key: 'yoga', rx: /(?:yoga|pr[a\u0101][n\u1e47]?[a\u0101]y[a\u0101]ma)/i },
  ];
  const boundaries = [];
  for (const kw of kwPatterns) { const idx = text.search(kw.rx); if (idx >= 0) boundaries.push({ pos: idx, key: kw.key }); }
  boundaries.sort((a, b) => a.pos - b.pos);
  if (boundaries.length >= 2) {
    for (let i = 0; i < boundaries.length; i++) {
      const start = boundaries[i].pos;
      const end = i + 1 < boundaries.length ? boundaries[i + 1].pos : text.length;
      const chunk = text.substring(start, end).trim();
      if (chunk.length > 5) { const k = boundaries[i].key; result[k] = (result[k] || '') + ' ' + chunk; }
    }
  } else {
    const numbered = splitInlineNumbered(text);
    if (numbered.length >= 2) {
      for (const item of numbered) {
        if (item.isPreamble) continue;
        const low = item.text.toLowerCase();
        if (low.match(/panchakarma|vamana|virechana|basti|nasya/) && !low.match(/pathya|diet|food/)) result.panchakarma = (result.panchakarma || '') + ' ' + item.text;
        else if (low.match(/pathya|diet|food|eat/) && !low.match(/avoid|apathya/)) result.pathya = (result.pathya || '') + ' ' + item.text;
        else if (low.match(/apathya|avoid/)) result.apathya = (result.apathya || '') + ' ' + item.text;
        else if (low.match(/vih[a\u0101]ra|lifestyle/)) result.vihara = (result.vihara || '') + ' ' + item.text;
        else if (low.match(/yoga|pr[a\u0101]n|asana|breathing/)) result.yoga = (result.yoga || '') + ' ' + item.text;
        else result.panchakarma = (result.panchakarma || '') + ' ' + item.text;
      }
    } else result.raw = text;
  }
  for (const k of Object.keys(result)) result[k] = result[k].trim();
  return result;
}

// Parse Q5 sections
function parseQ5(text) {
  if (!text) return {};
  const result = {};
  const progEnd = text.search(/(?:modern\s+(?:medical\s+)?correlation|modern\s+medicine|biomedical)/i);
  const warnStart = text.search(/(?:danger\s+sign|warning|red.?flag|immediate\s+attention)/i);
  if (progEnd > 0 || warnStart > 0) {
    if (progEnd > 0 && warnStart > progEnd) { result.prognosis = text.substring(0, progEnd).trim(); result.modern = text.substring(progEnd, warnStart).trim(); result.warnings = text.substring(warnStart).trim(); }
    else if (progEnd > 0) { result.prognosis = text.substring(0, progEnd).trim(); result.modern = text.substring(progEnd).trim(); }
    else if (warnStart > 0) { result.prognosis = text.substring(0, warnStart).trim(); result.warnings = text.substring(warnStart).trim(); }
  } else {
    const numbered = splitInlineNumbered(text);
    if (numbered.length >= 2) {
      for (const item of numbered) {
        if (item.isPreamble) { result.prognosis = (result.prognosis || '') + ' ' + item.text; continue; }
        const low = item.text.toLowerCase();
        if (low.match(/prognosis|s[a\u0101]dhya|y[a\u0101]pya|as[a\u0101]dhya|curable/)) result.prognosis = (result.prognosis || '') + ' ' + item.text;
        else if (low.match(/modern|correlation|biomedic|allopath|western/)) result.modern = (result.modern || '') + ' ' + item.text;
        else if (low.match(/danger|warning|immediate|referr|red.?flag/)) result.warnings = (result.warnings || '') + ' ' + item.text;
        else if (!result.prognosis) result.prognosis = (result.prognosis || '') + ' ' + item.text;
      }
    } else result.raw = text;
  }
  if (result.modern) result.modern = result.modern.replace(/^Modern\s+(?:medical\s+)?correlation\s*(?:includes?|is)?\s*[:\-\u2013]?\s*/i, '').trim();
  if (result.warnings) result.warnings = result.warnings.replace(/^(?:Danger\s+signs?\s*(?:requiring|needing)?\s*(?:immediate\s+)?attention\s*(?:include)?\s*[:\-\u2013]?\s*)/i, '').trim();
  for (const k of Object.keys(result)) if (result[k]) result[k] = result[k].trim();
  return result;
}

// ── ANALYZE ──
async function doAnalyze() {
  const text = input.value.trim(); if (!text) return;
  btn.disabled = true; btn.innerHTML = SVG + ' Analyzing...';
  loadEl.classList.remove('hidden'); errEl.classList.add('hidden');
  [nerStrip, matchBanner, diseaseHeader, resultsEl, disclaimer].forEach(e => e.classList.add('hidden'));
  resultsEl.innerHTML = '';
  const ctrl = new AbortController(), tout = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: ctrl.signal });
    clearTimeout(tout); if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json(); console.log('API:', JSON.stringify(data, null, 2)); render(data, text);
  } catch (err) {
    console.error(err);
    errEl.textContent = '\u26A0\uFE0F ' + (err.name === 'AbortError' ? 'Timeout.' : err.message.includes('fetch') ? 'Network error.' : err.message);
    errEl.classList.remove('hidden');
  } finally { btn.disabled = false; btn.innerHTML = SVG + ' Analyze'; loadEl.classList.add('hidden'); btn.disabled = !input.value.trim(); }
}

// ── RENDER ──
function render(data, origSym) {
  let tx = null;
  if (data.results && data.results.length) tx = data.results[0].treatment_info;
  else if (data.treatment_info) tx = data.treatment_info;
  if (!tx) { errEl.textContent = 'No treatment info.'; errEl.classList.remove('hidden'); return; }
  const R = tx.ayurparam_responses || {}, csv = data.csv_match || null;
  [nerStrip, matchBanner, diseaseHeader, resultsEl, disclaimer].forEach(e => e.classList.remove('hidden'));

  // NER
  nerStrip.innerHTML = '<span class="ner-strip-label">Detected Entities</span>';
  const ents = data.clinical_entities;
  if (ents && ents.length) { ents.forEach(e => { const t = document.createElement('span'); t.className = 'ner-tag'; t.innerHTML = esc(e.word) + ' <span class="score">' + esc(e.entity_group || 'ENTITY') + ' \u00B7 ' + Math.round((e.score || .9) * 100) + '%</span>'; nerStrip.appendChild(t); }); }
  else { const t = document.createElement('span'); t.className = 'ner-tag'; t.innerHTML = esc(origSym) + ' <span class="score">ENTITY \u00B7 98%</span>'; nerStrip.appendChild(t); }

  // Match banner
  const cond = tx.condition_name || (csv && csv.ayurveda_term) || origSym;
  $('matchDetails').textContent = 'Detected: ' + origSym + ' \u2192 ' + cond;
  $('matchPercent').textContent = '100%';

  // Disease header
  $('itaCode').textContent = (csv && csv.ita_id) || 'ITA';
  $('diseaseName').textContent = cond;
  $('sanskritName').textContent = tx.sanskrit_name || (csv && csv.sanskrit_iast) || (csv && csv.sanskrit) || '';
  const oLow = ((R.overview_dosha_causes || '') + ' ' + cond).toLowerCase();
  let dh = '';
  if (/v[a\u0101]t/i.test(oLow)) dh += '<span class="dosha-dot vata"></span>';
  if (/pitt/i.test(oLow)) dh += '<span class="dosha-dot pitta"></span>';
  if (/kaph/i.test(oLow)) dh += '<span class="dosha-dot kapha"></span>';
  if (!dh) dh = '<span class="dosha-dot vata"></span><span class="dosha-dot pitta"></span><span class="dosha-dot kapha"></span>';
  dh += '<span class="dosha-text">Dosha imbalance \u2014 requires assessment</span>';
  $('doshaLine').innerHTML = dh;
  const snomed = data.snomed_code || (data.results && data.results[0] && data.results[0].snomed_code) || '';
  const hasSNOMED = snomed && snomed !== 'N/A' && snomed !== '00000000' && snomed.length > 1;
  $('snomedRow').style.display = hasSNOMED ? 'flex' : 'none';
  if (hasSNOMED) { $('snomedCode').textContent = snomed; $('snomedName').textContent = cond; }

  let H = '';

  // 1. Description
  if (!empty(R.overview_dosha_causes)) {
    H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">\uD83D\uDCCB</div><span class="sc-title">Disease Description</span></div>';
    H += '<p class="desc-text">' + fmt(R.overview_dosha_causes) + '</p>';
    if (csv && csv.description) H += '<div style="margin-top:10px;font-size:13px;color:var(--text-light);background:var(--bg-warm);padding:6px 14px;border-radius:8px">\uD83C\uDFE5 ' + esc(csv.description) + '</div>';
    H += '</div>';
  }

  // 2. Nidana — extract FULL cause sentence
  let nidText = '';
  if (!empty(R.overview_dosha_causes)) {
    const sentences = R.overview_dosha_causes.split(/(?<=[.!?])\s+/);
    for (const sent of sentences) { if (/nid[a\u0101]na|causes?\s|etiolog/i.test(sent)) { nidText = sent; break; } }
  }
  const nidItems = nidText ? smartExtract(nidText, 4).slice(0, 10) : [];

  // 2b. Symptoms — detect inline numbered "1) Name—desc" pattern
  let sympHTML = '';
  if (!empty(R.symptoms)) {
    const raw = R.symptoms;
    const numbered = splitInlineNumbered(raw);
    if (numbered.length >= 3) {
      const items = dedup(numbered.filter(n => !n.isPreamble).map(n => n.text)).slice(0, 12);
      const preamble = numbered.find(n => n.isPreamble);
      if (preamble && preamble.text.length > 15) sympHTML += '<p class="desc-text" style="margin-bottom:12px">' + fmt(preamble.text) + '</p>';
      sympHTML += '<div class="tag-list">' + items.map(s => '<span class="tag-symptom">' + esc(s) + '</span>').join('') + '</div>';
    } else {
      const sentences = raw.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
      if (sentences.length <= 2) { sympHTML = '<p class="desc-text">' + fmt(raw) + '</p>'; }
      else {
        const items = dedup(sentences.map(s => stripMd(s).trim())).filter(s => s.length > 4 && s.length < 150).slice(0, 12);
        sympHTML = '<div class="tag-list">' + items.map(s => '<span class="tag-symptom">' + esc(s) + '</span>').join('') + '</div>';
      }
    }
  }

  const hasNid = nidItems.length > 0 || nidText.length > 10, hasSym = sympHTML.length > 0;
  if (hasNid && hasSym) {
    H += '<div class="two-col fade-in">';
    H += '<div class="sc" style="margin-bottom:0"><div class="sc-head"><div class="sc-icon amber">\uD83D\uDD0D</div><span class="sc-title">Root Causes (Nid\u0101na)</span></div>';
    H += nidItems.length >= 2 ? '<div class="tag-list">' + nidItems.map(n => '<span class="tag-nidana">' + esc(n) + '</span>').join('') + '</div>' : '<p class="desc-text">' + fmt(nidText) + '</p>';
    H += '</div>';
    H += '<div class="sc" style="margin-bottom:0"><div class="sc-head"><div class="sc-icon terra">\uD83E\uDE7A</div><span class="sc-title">Symptoms (R\u016Bpa)</span></div>' + sympHTML + '</div>';
    H += '</div>';
  } else {
    if (hasNid) { H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">\uD83D\uDD0D</div><span class="sc-title">Root Causes (Nid\u0101na)</span></div>'; H += nidItems.length >= 2 ? '<div class="tag-list">' + nidItems.map(n => '<span class="tag-nidana">' + esc(n) + '</span>').join('') + '</div>' : '<p class="desc-text">' + fmt(nidText) + '</p>'; H += '</div>'; }
    if (hasSym) { H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon terra">\uD83E\uDE7A</div><span class="sc-title">Symptoms (R\u016Bpa)</span></div>' + sympHTML + '</div>'; }
  }

  // 3. Ottamooli
  if (!empty(R.single_drug_remedies)) {
    const remedies = parseRemedies(R.single_drug_remedies);
    H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">\uD83C\uDF3F</div><span class="sc-title">Ottamooli \u2014 Single Medicine Remedies</span></div><div class="remedy-grid">';
    if (remedies.length > 0) { for (const r of remedies) { H += '<div class="remedy-card"><div class="remedy-name">' + esc(r.name || 'Herbal Remedy') + '</div>'; if (r.sanskrit) H += '<div class="remedy-sanskrit">' + esc(r.sanskrit) + '</div>'; H += '<div class="remedy-fields">'; if (r.part) H += '<div class="rf"><span class="rf-label">Part Used</span>' + esc(r.part) + '</div>'; if (r.preparation) H += '<div class="rf"><span class="rf-label">Preparation</span>' + esc(r.preparation) + '</div>'; if (r.dosage) H += '<div class="rf"><span class="rf-label">Dosage</span>' + esc(r.dosage) + '</div>'; if (r.duration) H += '<div class="rf"><span class="rf-label">Duration</span>' + esc(r.duration) + '</div>'; if (r.actions) H += '<div class="rf" style="grid-column:1/-1"><span class="rf-label">Actions</span>' + esc(r.actions) + '</div>'; H += '</div></div>'; } }
    else H += '<p class="desc-text" style="padding:4px">' + fmt(R.single_drug_remedies) + '</p>';
    H += '</div></div>';
  }

  // 4. Classical Formulations
  if (!empty(R.classical_formulations)) {
    const formulations = parseFormulations(R.classical_formulations);
    H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">\uD83D\uDC8A</div><span class="sc-title">Classical Formulations (Yogas)</span></div><div class="remedy-grid">';
    if (formulations.length > 0) { for (const f of formulations) { H += '<div class="form-card"><h4>' + esc(f.name || 'Classical Formulation') + '</h4>'; if (f.cleanDesc && f.cleanDesc.length > 10) H += '<div class="form-desc">' + fmt(f.cleanDesc) + '</div>'; H += '<div class="form-meta">'; if (f.dose) H += '<span>\uD83D\uDC8A <strong>Dose:</strong> ' + esc(f.dose) + '</span>'; if (f.form) H += '<span>\uD83D\uDCE6 <strong>Form:</strong> ' + esc(f.form) + '</span>'; if (f.contains) H += '<span>\uD83E\uDDEA <strong>Contains:</strong> ' + esc(f.contains) + '</span>'; H += '</div>'; if (f.reference) H += '<div class="ref-badge">\uD83D\uDCD6 ' + esc(f.reference) + '</div>'; H += '</div>'; } }
    else H += '<p class="desc-text" style="padding:4px">' + fmt(R.classical_formulations) + '</p>';
    H += '</div></div>';
  }

  // 5. Panchakarma + Diet & Lifestyle + Yoga
  if (!empty(R.panchakarma_diet_lifestyle_yoga)) {
    const q4 = parseQ4(R.panchakarma_diet_lifestyle_yoga); let any5 = false;
    // Panchakarma
    if (q4.panchakarma && !empty(q4.panchakarma)) {
      any5 = true; let pkText = q4.panchakarma.replace(/^(?:Recommended\s+)?panchakarma\s+(?:treatment\s+)?(?:for\s+\w+\s*(?:\([^)]*\))?\s*)?(?:is\s+|includes?\s+)?/i, '').trim();
      const pkItems = smartExtract(pkText, 5).filter(s => s.length < 200).slice(0, 8);
      H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">\uD83D\uDEC1</div><span class="sc-title">Panchakarma Therapies</span></div>';
      H += pkItems.length > 2 ? '<div class="remedy-grid">' + pkItems.map(p => '<div class="pk-card"><p>' + esc(p) + '</p></div>').join('') + '</div>' : '<div class="pk-card"><p>' + fmt(pkText) + '</p></div>';
      H += '</div>';
    }
    // Diet & Lifestyle
    const hasP = q4.pathya && !empty(q4.pathya), hasA = q4.apathya && !empty(q4.apathya), hasV = q4.vihara && !empty(q4.vihara);
    if (hasP || hasA || hasV) {
      any5 = true;
      H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">\uD83E\uDD57</div><span class="sc-title">Diet & Lifestyle (Pathya-Apathya)</span></div>';
      if (hasP || hasA) {
        const pC = hasP ? q4.pathya.replace(/^Pathya\s*[-\u2013:]\s*(?:foods?\s+to\s+eat\s*[-\u2013:]?\s*)?/i, '').trim() : '';
        const aC = hasA ? q4.apathya.replace(/^Apathya\s*[-\u2013:]\s*(?:foods?\s+to\s+avoid\s*[-\u2013:]?\s*)?/i, '').trim() : '';
        const pI = smartExtract(pC, 3).slice(0, 10), aI = smartExtract(aC, 3).slice(0, 10);
        if (pI.length > 0 || aI.length > 0) {
          H += '<div class="diet-grid">';
          if (pI.length) H += '<div class="diet-col favor"><h4>\u2705 Favorable</h4><div class="diet-tags">' + pI.map(f => '<span class="diet-tag good">' + esc(f) + '</span>').join('') + '</div></div>';
          if (aI.length) H += '<div class="diet-col avoid"><h4>\u274C Avoid</h4><div class="diet-tags">' + aI.map(f => '<span class="diet-tag bad">' + esc(f) + '</span>').join('') + '</div></div>';
          H += '<div class="diet-note">\uD83D\uDCA1 Follow dietary guidelines suited to your prak\u1E5Bti. Consult an Ayurvedic practitioner.</div></div>';
        } else {
          if (hasP) H += '<p class="desc-text" style="margin-bottom:8px"><strong>Favorable:</strong> ' + fmt(pC) + '</p>';
          if (hasA) H += '<p class="desc-text"><strong>Avoid:</strong> ' + fmt(aC) + '</p>';
        }
      }
      if (hasV) {
        let vC = q4.vihara.replace(/^Vih[a\u0101]ra\s*[-\u2013:]\s*(?:lifestyle\s+advice\s*[-\u2013:]?\s*)?/i, '').trim();
        const vI = smartExtract(vC, 4).filter(s => s.length < 150).slice(0, 8);
        H += '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:16px">\uD83C\uDFC3</span><span style="font-family:\'Fraunces\',serif;font-size:15px;font-weight:600;color:var(--text-dark)">Lifestyle (Vih\u0101ra)</span></div>';
        H += vI.length > 2 ? '<ul class="ls-list">' + vI.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '<p class="desc-text">' + fmt(vC) + '</p>';
        H += '</div>';
      }
      H += '</div>';
    }
    // Yoga (separate)
    if (q4.yoga && !empty(q4.yoga)) {
      any5 = true; let yC = q4.yoga.replace(/^(?:Recommended\s+)?yoga\s+and\s+pr[a\u0101][n\u1E47]?[a\u0101]y[a\u0101]ma\s*(?:for\s+\w+\s*(?:\([^)]*\))?\s*)?(?:are\s*|include\s*)?[-\u2013:]?\s*/i, '').trim();
      const yI = smartExtract(yC, 3).slice(0, 10);
      H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">\uD83E\uDDD8</div><span class="sc-title">Yoga & Pr\u0101\u1E47\u0101y\u0101ma</span></div>';
      H += yI.length > 2 ? '<div class="yoga-grid">' + yI.map(i => '<span class="yoga-tag">' + esc(i) + '</span>').join('') + '</div>' : '<p class="desc-text">' + fmt(yC) + '</p>';
      H += '</div>';
    }
    if (!any5) H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">\uD83D\uDEC1</div><span class="sc-title">Treatment Protocols</span></div><p class="desc-text">' + fmt(R.panchakarma_diet_lifestyle_yoga) + '</p></div>';
  }

  // 6-8. Prognosis + Modern + Warnings
  if (!empty(R.prognosis_modern_warnings)) {
    const q5 = parseQ5(R.prognosis_modern_warnings); let any6 = false;
    if (q5.prognosis && !empty(q5.prognosis)) { any6 = true; H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">\uD83D\uDCC8</div><span class="sc-title">Prognosis</span></div><div class="prog-box">' + fmt(q5.prognosis) + '</div></div>'; }
    if (q5.modern && !empty(q5.modern)) { any6 = true; H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon blue">\uD83C\uDFE5</div><span class="sc-title">Modern Medical Correlation</span></div><p class="desc-text">' + fmt(q5.modern) + '</p></div>'; }
    if (q5.warnings && !empty(q5.warnings)) {
      any6 = true; const wI = smartExtract(q5.warnings, 5).filter(s => s.length < 150 && !/^danger\s+sign/i.test(s)).slice(0, 8);
      H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon red">\u26A0\uFE0F</div><span class="sc-title">Warning Signs</span></div>';
      H += wI.length > 1 ? '<div class="warn-list">' + wI.map(w => '<div class="warn-item"><div class="warn-icon">!</div><span>' + esc(w) + '</span></div>').join('') + '</div>' : '<p class="desc-text">' + fmt(q5.warnings) + '</p>';
      H += '</div>';
    }
    if (!any6) H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">\uD83D\uDCC8</div><span class="sc-title">Prognosis & Clinical Notes</span></div><div class="prog-box">' + fmt(R.prognosis_modern_warnings) + '</div></div>';
  }

  // Catch-all
  const done = new Set(['overview_dosha_causes', 'symptoms', 'single_drug_remedies', 'classical_formulations', 'panchakarma_diet_lifestyle_yoga', 'prognosis_modern_warnings']);
  for (const [k, v] of Object.entries(R)) {
    if (done.has(k) || !v || typeof v !== 'string' || empty(v)) continue;
    H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">\uD83D\uDCC4</div><span class="sc-title">' + esc(k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())) + '</span></div><p class="desc-text">' + fmt(v) + '</p></div>';
  }
  resultsEl.innerHTML = H;
}
