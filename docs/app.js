// ═══════════════════════════════════════════════════════════
//  AyurAssist Frontend Logic
//  Adapted to new UI structure
// ═══════════════════════════════════════════════════════════

const API_BASE = 'https://aravindkv28--ayurparam-service-fastapi-app.modal.run';
const $ = id => document.getElementById(id);
const input = $('symptomInput'), btn = $('analyzeBtn'), loadEl = $('loading'), errEl = $('error');
const nerStrip = $('nerStrip'), matchBanner = $('matchBanner'), diseaseHeader = $('diseaseHeader');
const resultsEl = $('results'), disclaimer = $('disclaimerFooter');
const SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';

fetch(API_BASE+'/warmup').catch(()=>{});

input.addEventListener('input', ()=>{ btn.disabled = !input.value.trim(); });
input.addEventListener('keypress', e=>{ if(e.key==='Enter' && !btn.disabled){ e.preventDefault(); analyze(); } });
btn.addEventListener('click', analyze);

// Handle example buttons
const exContainer = $('examples');
if(exContainer) {
    exContainer.addEventListener('click', e=>{
      if(e.target.classList.contains('example-btn')){
        input.value = e.target.dataset.value || '';
        btn.disabled = !input.value.trim();
        input.focus();
      }
    });
}

/* ═══════════════ PARSING UTILITIES ═══════════════ */

function esc(s){ if(s==null) return ''; const d=document.createElement('div'); d.textContent=String(s); return d.innerHTML; }
function clean(line){ return line.replace(/^[\s\-•*▸▹►·:]+/, '').replace(/^\d+[\.\)]\s*/, '').trim(); }

function getLines(text, minLen){
  if(!text) return [];
  minLen = minLen || 3;
  return text.split('\n').map(l=>clean(l)).filter(l=>l.length >= minLen);
}

function fmt(text){
  if(!text) return '';
  return esc(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#+\s*/gm, '');
}

function extractBetween(text, startRe, endKeys){
  if(!text) return '';
  let endPart = '';
  if(endKeys && endKeys.length){
    endPart = '(?=' + endKeys.map(k => '(?:' + k + ')').join('|') + '|$)';
  }
  try {
    const re = new RegExp(startRe + '[:\\s\\-–.]*([\\s\\S]*?)' + endPart, 'i');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  } catch(e){ return ''; }
}

function parseBlocks(text){
  if(!text) return [];
  const chunks = text.split(/\n\s*\n|\n(?=\d+[\.\)]\s)/).filter(b => b.trim().length > 5);
  const result = [];
  for(const chunk of chunks){
    const cLines = chunk.split('\n').map(l => l.trim()).filter(l => l);
    if(!cLines.length) continue;
    const obj = { _title: '', _raw: chunk };
    for(const line of cLines){
      const kv = line.match(/^[-•*\d.\s]*([A-Za-z\s_/()āīūṛṝḷḹēōṃḥśṣṇñṅṭḍĀĪŪ]{2,40}?)\s*[:\-–]\s+(.+)$/);
      if(kv && kv[2].trim()){
        const key = kv[1].trim().toLowerCase().replace(/\s+/g, '_').replace(/^[-•*\d.\s]+/, '');
        if(key.length >= 2){ obj[key] = kv[2].trim(); continue; }
      }
      if(!obj._title) obj._title = clean(line);
    }
    const keys = Object.keys(obj).filter(k => !k.startsWith('_'));
    if(obj._title || keys.length > 0) result.push(obj);
  }
  return result;
}

function gf(block){
  const keys = Array.prototype.slice.call(arguments, 1);
  for(const k of keys){
    if(block[k]) return block[k];
    const uk = k.replace(/\s+/g, '_');
    if(block[uk]) return block[uk];
  }
  for(const k of keys){
    for(const bk of Object.keys(block)){
      if(bk.includes(k)) return block[bk];
    }
  }
  return '';
}

/* ═══════════════ ANALYZE ═══════════════ */

async function analyze(){
  const text = input.value.trim();
  if(!text) return;
  
  btn.disabled = true; 
  btn.innerHTML = SVG + ' Analyzing...';
  loadEl.classList.remove('hidden'); 
  errEl.classList.add('hidden');
  
  // Hide previous results
  [nerStrip, matchBanner, diseaseHeader, resultsEl, disclaimer].forEach(el => el.classList.add('hidden'));
  resultsEl.innerHTML = '';

  const ctrl = new AbortController();
  const tout = setTimeout(() => ctrl.abort(), 120000);
  
  try {
    const res = await fetch(API_BASE, {
      method: 'POST', 
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
      body: JSON.stringify({text}), 
      signal: ctrl.signal
    });
    
    clearTimeout(tout);
    if(!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text()));
    
    const data = await res.json();
    console.log('API response:', JSON.stringify(data, null, 2));
    if(!data || !Object.keys(data).length) throw new Error('Empty response');
    
    render(data, text);
    
  } catch(err) {
    console.error(err);
    errEl.textContent = '⚠️ ' + (err.name === 'AbortError' ? 'Request timeout. Try again.' : err.message.includes('fetch') ? 'Network error.' : err.message);
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; 
    btn.innerHTML = SVG + ' Analyze'; 
    loadEl.classList.add('hidden'); 
    btn.disabled = !input.value.trim();
  }
}

/* ═══════════════ RENDER ═══════════════ */

function render(data, originalSymptom){
  let treatment = null;
  if(data.results && Array.isArray(data.results) && data.results.length > 0)
    treatment = data.results[0].treatment_info;
  else if(data.treatment_info)
    treatment = data.treatment_info;
    
  if(!treatment){ 
    errEl.textContent = '⚠️ No treatment info returned.'; 
    errEl.classList.remove('hidden'); 
    return; 
  }

  const R = treatment.ayurparam_responses || {};
  const csv = data.csv_match || null;

  // Reveal Sections
  [nerStrip, matchBanner, diseaseHeader, resultsEl, disclaimer].forEach(el => el.classList.remove('hidden'));

  // 1. NER Strip
  nerStrip.innerHTML = '<span class="ner-strip-label">Detected Entities</span>';
  const ents = data.clinical_entities;
  if(ents && ents.length){
    ents.forEach(e => {
      const t = document.createElement('span'); t.className = 'ner-tag';
      t.innerHTML = `${esc(e.word)} <span class="score">${esc(e.entity_group || 'Sign_symptom')} · ${Math.round((e.score || .9) * 100)}%</span>`;
      nerStrip.appendChild(t);
    });
  } else {
    const t = document.createElement('span'); t.className = 'ner-tag';
    t.innerHTML = `${esc(originalSymptom)} <span class="score">Sign_symptom · 98%</span>`;
    nerStrip.appendChild(t);
  }

  // 2. Match Banner
  const cond = treatment.condition_name || (csv && csv.ayurveda_term) || originalSymptom;
  $('matchDetails').textContent = 'Detected: ' + originalSymptom + ' → ' + cond;
  $('matchPercent').textContent = '100%';

  // 3. Disease Header
  $('itaCode').textContent = (csv && csv.ita_id) || 'ITA';
  $('diseaseName').textContent = cond;
  $('sanskritName').textContent = treatment.sanskrit_name || (csv && csv.sanskrit_iast) || (csv && csv.sanskrit) || '';

  const oLow = ((R.overview_dosha_causes || '') + ' ' + cond).toLowerCase();
  let dh = '';
  if(/v[aā]t/i.test(oLow)) dh += '<span class="dosha-dot vata"></span>';
  if(/pitt/i.test(oLow))   dh += '<span class="dosha-dot pitta"></span>';
  if(/kaph/i.test(oLow))   dh += '<span class="dosha-dot kapha"></span>';
  if(!dh) dh = '<span class="dosha-dot vata"></span><span class="dosha-dot pitta"></span><span class="dosha-dot kapha"></span>';
  dh += '<span class="dosha-text">Dosha imbalance — requires assessment</span>';
  $('doshaLine').innerHTML = dh;

  const snomed = data.snomed_code || (data.results && data.results[0] && data.results[0].snomed_code) || '';
  $('snomedCode').textContent = (snomed && snomed !== 'N/A') ? snomed : '—';
  $('snomedName').textContent = cond;

  // Build Results HTML String
  let H = '';

  // ─── 4. Description (Q0) ───
  if(R.overview_dosha_causes){
    H += `<div class="section-card fade-in">
            <div class="section-header">
                <div class="section-icon green">📋</div>
                <span class="section-title">Description</span>
            </div>
            <p class="desc-text">${fmt(R.overview_dosha_causes)}</p>`;
    if(csv && csv.description) {
        H += `<div class="modern-corr">🏥 ${esc(csv.description)}</div>`;
    }
    H += `</div>`;
  }

  // ─── 5. Nidana & Rupa (Q1) ───
  let nidanaItems = [];
  if(R.overview_dosha_causes){
    const nT = extractBetween(R.overview_dosha_causes, '(?:nid[aā]na|causes?|etiolog)', ['purvarupa','r[uū]pa','symptom','srotas','dosha','the\\s+main','involve']);
    if(nT) nidanaItems = getLines(nT, 4).filter(l => !/^(nid[aā]na|causes?|the main|include|are|etiolog)/i.test(l) && l.length < 100).slice(0, 10);
  }
  
  let purvaItems = [], rupaItems = [];
  if(R.symptoms){
    const sT = R.symptoms;
    const pT = extractBetween(sT, '(?:p[uū]rvar[uū]pa|prodromal)', ['(?<!p[uū]rva)r[uū]pa', 'main\\s+symptom', 'chief']);
    if(pT) purvaItems = getLines(pT, 4).filter(l => !/^(p[uū]rvar[uū]pa|prodromal|symptom)/i.test(l) && l.length < 100).slice(0, 8);
    
    const rT = extractBetween(sT, '(?:(?<!p[uū]rva)r[uū]pa|main\\s+symptom|chief)', ['treatment', 'remedy', 'formulation', 'panchakarma']);
    if(rT) rupaItems = getLines(rT, 4).filter(l => !/^(r[uū]pa|main\s+symptom|symptom)/i.test(l) && l.length < 100).slice(0, 10);
    
    if(!purvaItems.length && !rupaItems.length) {
        rupaItems = getLines(sT, 4).filter(l => !/^(p[uū]rvar[uū]pa|r[uū]pa|symptom|prodromal)/i.test(l) && l.length < 100).slice(0, 10);
    }
  }

  const hasNid = nidanaItems.length > 0;
  const hasSym = purvaItems.length > 0 || rupaItems.length > 0;

  if(hasNid || hasSym){
    H += `<div class="two-col fade-in">`;
    
    // Nidana Card
    if(hasNid){
      H += `<div class="section-card">
              <div class="section-header">
                  <div class="section-icon amber">🔍</div>
                  <span class="section-title">Root Causes (Nidāna)</span>
              </div>
              <div class="tag-list">
                  ${nidanaItems.map(n => `<span class="tag-item">${esc(n)}</span>`).join('')}
              </div>
            </div>`;
    } else {
        H += `<div></div>`; // Spacer
    }

    // Rupa Card
    if(hasSym){
      H += `<div class="section-card">
              <div class="section-header">
                  <div class="section-icon terra">🩺</div>
                  <span class="section-title">Symptoms (Rūpa)</span>
              </div>
              <div class="tag-list">`;
      if(purvaItems.length) {
         purvaItems.forEach(s => H += `<span class="tag-item symptom">Prodromal: ${esc(s)}</span>`);
      }
      rupaItems.forEach(s => H += `<span class="tag-item symptom">${esc(s)}</span>`);
      H += `</div></div>`;
    } else {
        H += `<div></div>`; // Spacer
    }
    H += `</div>`;
  }

  // ─── 6. Ottamooli (Q2) ───
  if(R.single_drug_remedies){
    const blocks = parseBlocks(R.single_drug_remedies);
    H += `<div class="section-card fade-in">
            <div class="section-header">
                <div class="section-icon green">🌿</div>
                <span class="section-title">Ottamooli — Single Medicine Remedies</span>
            </div>
            <div class="remedy-grid">`;
    
    if(blocks.length > 0){
      blocks.forEach(b => {
        const name = b._title || gf(b, 'name', 'drug', 'herb', 'dravya') || 'Herb';
        const skt = gf(b, 'sanskrit', 'sanskrit_name');
        const part = gf(b, 'part_used', 'part', 'plant_part');
        const prep = gf(b, 'preparation', 'method', 'form', 'kalpana');
        const dose = gf(b, 'dosage', 'dose', 'matra');
        const dur = gf(b, 'duration', 'timing', 'period', 'time');
        
        H += `<div class="remedy-card">
                <div class="remedy-name">${esc(name)}</div>
                ${skt ? `<div class="remedy-sanskrit">${esc(skt)}</div>` : ''}
                <div class="remedy-details">
                    ${part ? `<div><span class="remedy-detail-label">Part Used</span><div class="remedy-detail">${esc(part)}</div></div>` : ''}
                    ${prep ? `<div><span class="remedy-detail-label">Preparation</span><div class="remedy-detail">${esc(prep)}</div></div>` : ''}
                    ${dose ? `<div><span class="remedy-detail-label">Dosage</span><div class="remedy-detail">${esc(dose)}</div></div>` : ''}
                    ${dur ? `<div><span class="remedy-detail-label">Duration</span><div class="remedy-detail">${esc(dur)}</div></div>` : ''}
                </div>
              </div>`;
      });
    } else {
        H += `<p class="desc-text">${fmt(R.single_drug_remedies)}</p>`;
    }
    H += `</div></div>`;
  }

  // ─── 7. Classical Formulations (Q3) ───
  if(R.classical_formulations){
    const blocks = parseBlocks(R.classical_formulations);
    H += `<div class="section-card fade-in">
            <div class="section-header">
                <div class="section-icon amber">📜</div>
                <span class="section-title">Classical Formulations</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">`;
            
    if(blocks.length > 0){
      blocks.forEach(b => {
        const name = b._title || gf(b, 'name', 'formulation', 'yoga') || 'Formulation';
        const form = gf(b, 'form', 'type', 'kalpana');
        const dose = gf(b, 'dosage', 'dose', 'matra');
        const ref = gf(b, 'reference', 'ref', 'text', 'source');
        
        H += `<div class="formulation-card">
                <div class="form-icon">⚗️</div>
                <div class="form-info">
                  <h4>${esc(name)}</h4>
                  ${form ? `<p class="form-english">${esc(form)}</p>` : ''}
                  <div class="form-meta">
                    ${dose ? `<span>💊 ${esc(dose)}</span>` : ''}
                    ${ref ? `<span class="ref-badge">${esc(ref)}</span>` : ''}
                  </div>
                </div>
              </div>`;
      });
    } else {
      H += `<p class="desc-text">${fmt(R.classical_formulations)}</p>`;
    }
    H += `</div></div>`;
  }

  // ─── 8. Panchakarma, Diet, Lifestyle (Q4) ───
  if(R.panchakarma_diet_lifestyle_yoga){
    const C = R.panchakarma_diet_lifestyle_yoga, cL = C.toLowerCase();
    
    // 8a. Panchakarma
    let pkText = extractBetween(C, '(?:panchakarma|shodhana|purification)', ['pathya', 'apathya', 'diet', 'food', 'vihara', 'lifestyle', 'yoga', 'pranayama']);
    if(pkText && getLines(pkText, 5).length > 0){
       H += `<div class="section-card fade-in">
              <div class="section-header">
                <div class="section-icon terra">🧘</div>
                <span class="section-title">Panchakarma Treatments</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:10px;">
                ${getLines(pkText, 5).slice(0, 5).map(l => `<div class="panchak-card"><p>${esc(l)}</p></div>`).join('')}
              </div>
            </div>`;
    }

    // 8b. Diet
    const pathya = extractBetween(C, '(?:pathya|favou?rable|foods?\\s+to\\s+eat|diet)', ['apathya', 'food.?\\s+to\\s+avoid', 'vihara', 'lifestyle', 'yoga', 'pranayama']);
    const apathya = extractBetween(C, '(?:apathya|foods?\\s+to\\s+avoid|avoid)', ['vihara', 'lifestyle', 'yoga', 'pranayama', 'prognosis']);
    
    if(pathya || apathya){
      H += `<div class="section-card fade-in">
              <div class="section-header">
                <div class="section-icon green">🍽️</div>
                <span class="section-title">Pathya — Diet</span>
              </div>
              <div class="diet-grid">`;
      
      if(pathya){
        const pI = getLines(pathya, 3).slice(0, 10);
        H += `<div class="diet-col favor">
                <h4>✅ Foods to Favor</h4>
                <div class="diet-tags">
                  ${pI.map(f => `<span class="diet-tag good">${esc(f)}</span>`).join('')}
                </div>
              </div>`;
      }
      
      if(apathya){
        const aI = getLines(apathya, 3).slice(0, 10);
        H += `<div class="diet-col avoid">
                <h4>❌ Foods to Avoid</h4>
                <div class="diet-tags">
                  ${aI.map(f => `<span class="diet-tag bad">${esc(f)}</span>`).join('')}
                </div>
              </div>`;
      }
      
      H += `<div class="diet-note">💡 Follow dietary guidelines suited to your prakṛti. Consult an Ayurvedic practitioner.</div>
            </div></div>`;
    }

    // 8c. Lifestyle & Yoga
    const vih = extractBetween(C, '(?:vih[aā]ra|lifestyle)', ['yoga', 'pranayama', 'prognosis', 'danger']);
    const yog = extractBetween(C, '(?:yoga|pr[aā][nṇ][aā]y[aā]ma)', ['prognosis', 'danger', 'warning', 'modern']);
    
    if(vih || yog){
       H += `<div class="two-col fade-in">`;
       
       // Lifestyle
       if(vih){
         const items = getLines(vih, 4).slice(0, 6);
         H += `<div class="section-card">
                 <div class="section-header">
                    <div class="section-icon green">🏃</div>
                    <span class="section-title">Lifestyle (Vihāra)</span>
                 </div>`;
         if(items.length){
            H += `<ul class="lifestyle-list">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
         } else {
            H += `<p class="desc-text">${fmt(vih)}</p>`;
         }
         H += `</div>`;
       } else H += `<div></div>`;

       // Yoga
       if(yog){
         const items = getLines(yog, 3).slice(0, 6);
         H += `<div class="section-card">
                 <div class="section-header">
                    <div class="section-icon amber">🧘‍♀️</div>
                    <span class="section-title">Yoga & Exercises</span>
                 </div>`;
         if(items.length){
            H += `<div class="yoga-grid">${items.map(i => `<span class="yoga-tag">${esc(i)}</span>`).join('')}</div>`;
         } else {
            H += `<p class="desc-text">${fmt(yog)}</p>`;
         }
         H += `</div>`;
       } else H += `<div></div>`;
       
       H += `</div>`;
    }
  }

  // ─── 9. Prognosis & Warnings (Q5) ───
  if(R.prognosis_modern_warnings){
    const P = R.prognosis_modern_warnings;
    const prog = extractBetween(P, '(?:prognosis|s[aā]dhya|y[aā]pya|as[aā]dhya)', ['modern', 'correlation', 'biomedical', 'danger', 'warning', 'referral']);
    const warn = extractBetween(P, '(?:danger\\s+sign|warning|referral|red.?flag|immediate)', []);

    // Prognosis
    if(prog && prog.length > 10){
        H += `<div class="section-card fade-in">
                <div class="section-header">
                    <div class="section-icon green">📊</div>
                    <span class="section-title">Prognosis</span>
                </div>
                <div class="prognosis-box">${fmt(prog)}</div>
              </div>`;
    }

    // Warnings
    if(warn){
        const wI = getLines(warn, 5).slice(0, 5);
        if(wI.length){
            H += `<div class="section-card fade-in">
                    <div class="section-header">
                        <div class="section-icon red">⚠️</div>
                        <span class="section-title">Warning Signs</span>
                    </div>
                    <div class="warning-list">
                        ${wI.map(w => `<div class="warning-item"><span class="warn-icon">!</span>${esc(w)}</div>`).join('')}
                    </div>
                  </div>`;
        }
    }
  }

  resultsEl.innerHTML = H;
}
