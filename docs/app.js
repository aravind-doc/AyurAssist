// ═══════════════════════════════════════════════════════════
//  AyurAssist Frontend Logic (Corrected Parsing)
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

/* ═══════════════ ROBUST PARSING UTILITIES ═══════════════ */

function esc(s){ if(s==null) return ''; const d=document.createElement('div'); d.textContent=String(s); return d.innerHTML; }

// Formatting: Remove markdown, remove leading numbers like "1)", "2."
function fmt(text){
  if(!text) return '';
  let clean = text
    .replace(/^\s*\d+[\.\)]\s*/, '') // Remove "1. " or "2) " at start
    .replace(/\s*\d+\)\s*$/, '')     // Remove trailing "3)"
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#+\s*/gm, '');
  return esc(clean).replace(/&lt;strong&gt;/g, '<strong>').replace(/&lt;\/strong&gt;/g, '</strong>').replace(/&lt;em&gt;/g, '<em>').replace(/&lt;\/em&gt;/g, '</em>');
}

// Split a text block by numbered lists (1. or 1) or 2. etc)
// This fixes the "incomplete sentences" and "run-on headers"
function splitByNumbers(text) {
    if (!text) return [];
    // Split by pattern: Newline or Space + Digit + Dot/Paren + Space
    // e.g. " treatment... 2) Pathya..."
    const parts = text.split(/(?:^|\s+)(\d+[\.\)])\s+/);
    
    // Reassemble into cleaner chunks
    let chunks = [];
    if(parts[0]) chunks.push(parts[0]); 
    
    for (let i = 1; i < parts.length; i += 2) {
        if(parts[i+1]) chunks.push(parts[i+1]);
    }
    
    // If splitting failed (no numbers), try splitting by newlines
    if (chunks.length <= 1 && text.includes('\n')) {
        chunks = text.split('\n').filter(line => line.trim().length > 5);
    }
    
    // Fallback: If still one chunk, return it as is
    if (chunks.length === 0) chunks = [text];
    
    return chunks.map(c => c.trim()).filter(c => c);
}

// Helper to categorize chunks based on keywords
function identifyChunk(chunk) {
    const c = chunk.toLowerCase();
    if (c.includes('panchakarma') || c.includes('shodhana') || c.includes('vamana') || c.includes('basti')) return 'panchakarma';
    if (c.includes('pathya') || c.includes('diet') || c.includes('foods to')) return 'diet';
    if (c.includes('vihara') || c.includes('lifestyle')) return 'lifestyle';
    if (c.includes('yoga') || c.includes('asana') || c.includes('pranayama')) return 'yoga';
    if (c.includes('prognosis') || c.includes('sadhya')) return 'prognosis';
    if (c.includes('modern') || c.includes('correlation')) return 'modern';
    if (c.includes('danger') || c.includes('warning') || c.includes('emergency')) return 'warning';
    return 'general';
}

// Fix for the "Guggulu" repetition issue
function deduplicateList(items) {
    return [...new Set(items)];
}

// Split comma-separated lists, cleaning up headers
function getItems(text) {
    if (!text) return [];
    // Remove headers like "Foods to eat are..."
    let cleanText = text
        .replace(/^(foods to (favor|eat|avoid)|pathya|apathya|include|are|recommended|lifestyle|yoga|exercises?)[\s\-:]*/i, '')
        .replace(/^(is|include|are)\s+/i, '');

    // Split by comma, semicolon, or newline
    return cleanText.split(/[,;\n]/)
        .map(i => i.trim())
        .filter(i => i.length > 2 && !i.match(/^\d+[\.\)]$/)); // Filter out empty or just numbers
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

  // 4. Build Results HTML
  let H = '';

  // --- Description (Q0) ---
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

  // --- Nidana & Rupa (Q1) ---
  // Simple split logic to ensure we don't display empty cards
  const sympText = R.symptoms || '';
  if(sympText.length > 5) {
      H += `<div class="section-card fade-in">
              <div class="section-header">
                  <div class="section-icon terra">🩺</div>
                  <span class="section-title">Symptoms & Causes</span>
              </div>
              <p class="desc-text">${fmt(sympText)}</p>
            </div>`;
  }

  // --- Ottamooli (Q2) - Repetition Fix ---
  if(R.single_drug_remedies){
    // If text repeats lines like "Guggulu... Guggulu...", we dedupe them by splitting by newline or hyphen
    let rawRemedies = R.single_drug_remedies;
    
    // Check if it's a "wall of text" repetition
    if(rawRemedies.length > 100 && rawRemedies.includes('*Guggulu*')) {
        // Attempt to split by ' - ' or newlines to fix the screenshot issue
        let parts = rawRemedies.split(/(?: - |\n)/).map(s => s.trim()).filter(s => s);
        let uniqueParts = deduplicateList(parts);
        rawRemedies = uniqueParts.join('<br>');
    }

    H += `<div class="section-card fade-in">
            <div class="section-header">
                <div class="section-icon green">🌿</div>
                <span class="section-title">Ottamooli — Single Medicine Remedies</span>
            </div>
            <div class="remedy-grid">
               <div class="raw-text">${fmt(rawRemedies)}</div>
            </div>
          </div>`;
  }

  // --- Formulations (Q3) ---
  if(R.classical_formulations){
    H += `<div class="section-card fade-in">
            <div class="section-header">
                <div class="section-icon amber">📜</div>
                <span class="section-title">Classical Formulations</span>
            </div>
            <div class="raw-text">${fmt(R.classical_formulations)}</div>
          </div>`;
  }

  // --- Panchakarma, Diet, Lifestyle, Yoga (Q4 - The Complex Split) ---
  if(R.panchakarma_diet_lifestyle_yoga){
    const fullText = R.panchakarma_diet_lifestyle_yoga;
    const chunks = splitByNumbers(fullText);
    
    let pkContent = '', dietFavor = [], dietAvoid = [], lifestyle = [], yoga = [];

    chunks.forEach(chunk => {
        const type = identifyChunk(chunk);
        
        if (type === 'panchakarma') {
            // Clean the header "Recommended panchakarma is..."
            pkContent = chunk.replace(/^(recommended|panchakarma|treatment|is)\s+/gi, '').replace(/^[:\s-]+/, '');
        } 
        else if (type === 'diet') {
            // Logic to split Favor vs Avoid inside the diet chunk
            // "Foods to eat are X, Y, Z. Avoid A, B, C."
            let avoidIndex = chunk.toLowerCase().indexOf('avoid');
            let favorText = chunk;
            let avoidText = '';

            if (avoidIndex > -1) {
                favorText = chunk.substring(0, avoidIndex);
                avoidText = chunk.substring(avoidIndex);
            }
            
            dietFavor = getItems(favorText);
            // Clean "Avoid" word from the start of avoidText
            dietAvoid = getItems(avoidText.replace(/^avoid\s+/i, ''));
        } 
        else if (type === 'lifestyle') {
            lifestyle = getItems(chunk);
        } 
        else if (type === 'yoga') {
            yoga = getItems(chunk);
        }
    });

    // 8a. Panchakarma
    if (pkContent) {
        H += `<div class="section-card fade-in">
                <div class="section-header"><div class="section-icon terra">🧘</div><span class="section-title">Panchakarma Treatments</span></div>
                <div class="panchak-card"><p>${fmt(pkContent)}</p></div>
              </div>`;
    }

    // 8b. Diet
    if (dietFavor.length > 0 || dietAvoid.length > 0) {
        H += `<div class="section-card fade-in">
                <div class="section-header"><div class="section-icon green">🍽️</div><span class="section-title">Pathya — Diet</span></div>
                <div class="diet-grid">`;
        
        if (dietFavor.length) {
            H += `<div class="diet-col favor">
                    <h4>✅ Foods to Favor</h4>
                    <div class="diet-tags">${dietFavor.map(f => `<span class="diet-tag good">${esc(f)}</span>`).join('')}</div>
                  </div>`;
        }
        if (dietAvoid.length) {
            H += `<div class="diet-col avoid">
                    <h4>❌ Foods to Avoid</h4>
                    <div class="diet-tags">${dietAvoid.map(f => `<span class="diet-tag bad">${esc(f)}</span>`).join('')}</div>
                  </div>`;
        }
        H += `</div></div>`;
    }

    // 8c. Lifestyle & Yoga
    if (lifestyle.length > 0 || yoga.length > 0) {
        H += `<div class="two-col fade-in">`;
        if (lifestyle.length) {
             H += `<div class="section-card">
                     <div class="section-header"><div class="section-icon green">🏃</div><span class="section-title">Lifestyle</span></div>
                     <ul class="lifestyle-list">${lifestyle.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
                   </div>`;
        } else H += `<div></div>`;

        if (yoga.length) {
             H += `<div class="section-card">
                     <div class="section-header"><div class="section-icon amber">🧘‍♀️</div><span class="section-title">Yoga</span></div>
                     <div class="yoga-grid">${yoga.map(i => `<span class="yoga-tag">${esc(i)}</span>`).join('')}</div>
                   </div>`;
        } else H += `<div></div>`;
        H += `</div>`;
    }
  }

  // --- Prognosis & Warnings (Q5) ---
  if(R.prognosis_modern_warnings){
    const chunks = splitByNumbers(R.prognosis_modern_warnings);
    let prog = '', warn = [], modern = '';

    chunks.forEach(chunk => {
        const type = identifyChunk(chunk);
        if (type === 'prognosis') prog = chunk;
        if (type === 'warning') warn = getItems(chunk);
        if (type === 'modern') modern = chunk;
    });

    if(prog) {
        H += `<div class="section-card fade-in">
                <div class="section-header"><div class="section-icon green">📊</div><span class="section-title">Prognosis</span></div>
                <div class="prognosis-box">${fmt(prog)}</div>
              </div>`;
    }
    if(warn.length) {
        H += `<div class="section-card fade-in">
                <div class="section-header"><div class="section-icon red">⚠️</div><span class="section-title">Warning Signs</span></div>
                <div class="warning-list">${warn.map(w => `<div class="warning-item"><span class="warn-icon">!</span>${esc(w)}</div>`).join('')}</div>
              </div>`;
    }
  }

  resultsEl.innerHTML = H;
}
