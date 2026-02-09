const API_BASE = 'https://aravindkv28--ayurparam-service-fastapi-app.modal.run';
const $ = id => document.getElementById(id);
const input = $('symptomInput'), btn = $('analyzeBtn'), loadEl = $('loading'), errEl = $('error');
const nerStrip = $('nerStrip'), matchBanner = $('matchBanner'), diseaseHeader = $('diseaseHeader');
const resultsEl = $('results'), disclaimer = $('disclaimerFooter');

// Prevent "null" errors by checking elements exist
const safeSet = (id, val) => { const el = $(id); if(el) el.textContent = val; };
const SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';

fetch(API_BASE+'/warmup').catch(()=>{});

input.addEventListener('input', ()=>{ btn.disabled = !input.value.trim(); });
input.addEventListener('keypress', e=>{ if(e.key==='Enter' && !btn.disabled){ e.preventDefault(); analyze(); } });
btn.addEventListener('click', analyze);

$('examples').addEventListener('click', e => {
    if(e.target.classList.contains('example-btn')){
        input.value = e.target.dataset.value;
        btn.disabled = false;
        input.focus();
    }
});

/* ═══════════════ CLEANING UTILITIES ═══════════════ */

function esc(s){ if(s==null) return ''; const d=document.createElement('div'); d.textContent=String(s); return d.innerHTML; }

// Removes markdown, trailing numbers (like "2)"), and artifacts
function cleanText(text) {
    if(!text) return '';
    let clean = text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/^\s*[:\-]\s*/, '')      // Remove leading colons/dashes
        .replace(/\s+\d+[\.\)]\s*$/, '')  // Remove " 2)" or " 3." at the END of a string
        .replace(/^\d+[\.\)]\s*/, '')     // Remove "1. " at the START
        .trim();
    // Fix "and pranayama" issues by capitalizing if it looks like a sentence start
    if(clean.startsWith('and ')) clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    return clean;
}

// Fixes the "Guggulu - Guggulu - Guggulu" repetition bug
function deduplicateContent(text) {
    if (!text || text.length < 50) return text;
    // Check if it's a list separated by hyphens or newlines
    if (text.includes(' - ') || text.includes('\n')) {
        const separator = text.includes('\n') ? '\n' : ' - ';
        const parts = text.split(separator).map(s => s.trim()).filter(s => s);
        const unique = [...new Set(parts)]; // Remove duplicates
        return unique.join('<br>');
    }
    return text;
}

// Smarter splitter for "1) X 2) Y" patterns
function splitSections(fullText) {
    if(!fullText) return [];
    
    // Split by "Number + Dot/Paren" (e.g., "1.", "2)", "3.")
    // We capture the delimiter to know where sections start
    const parts = fullText.split(/(?:\s+|^)(\d+[\.\)])\s+/);
    
    const sections = [];
    // If the text doesn't start with a number, the first chunk is "General"
    if(parts[0] && parts[0].trim()) sections.push(parts[0].trim());
    
    for(let i=1; i<parts.length; i+=2) {
        if(parts[i+1]) sections.push(parts[i+1].trim());
    }
    
    // Fallback: if no numbers found, split by newlines if huge
    if(sections.length === 0) return [fullText];
    if(sections.length === 1 && fullText.length > 200 && fullText.includes('\n')) {
        return fullText.split('\n').filter(s => s.trim().length > 5);
    }
    
    return sections;
}

// Identify section type by keyword
function getCategory(text) {
    const t = text.toLowerCase();
    if(t.includes('panchakarma') || t.includes('treatment') || t.includes('basti') || t.includes('vamana')) return 'PK';
    if(t.includes('diet') || t.includes('food') || t.includes('eat') || t.includes('pathya')) return 'DIET';
    if(t.includes('lifestyle') || t.includes('vihara')) return 'LIFE';
    if(t.includes('yoga') || t.includes('asana') || t.includes('exercise')) return 'YOGA';
    if(t.includes('prognosis') || t.includes('modern') || t.includes('warning')) return 'PROG';
    return 'GEN';
}

function getListItems(text) {
    return cleanText(text).split(/[,;]/).map(s => cleanText(s)).filter(s => s.length > 2);
}

/* ═══════════════ CORE LOGIC ═══════════════ */

async function analyze(){
    const text = input.value.trim();
    if(!text) return;
    
    btn.disabled = true; btn.innerHTML = 'Analyzing...';
    loadEl.classList.remove('hidden'); errEl.classList.add('hidden');
    [nerStrip, matchBanner, diseaseHeader, resultsEl, disclaimer].forEach(el => el.classList.add('hidden'));
    resultsEl.innerHTML = '';

    try {
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({text})
        });
        
        if(!res.ok) throw new Error('API Error');
        const data = await res.json();
        
        render(data, text);
        
    } catch(err) {
        errEl.textContent = 'Connection Error: Please try again.';
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false; btn.innerHTML = SVG + ' Analyze';
        loadEl.classList.add('hidden');
    }
}

function render(data, userQuery){
    const tx = (data.results && data.results[0] && data.results[0].treatment_info) || data.treatment_info;
    if(!tx) { errEl.textContent = "No data found."; errEl.classList.remove('hidden'); return; }

    const R = tx.ayurparam_responses || {};
    const csv = data.csv_match || {};

    // 1. Show Containers
    [nerStrip, matchBanner, diseaseHeader, resultsEl, disclaimer].forEach(el => el.classList.remove('hidden'));

    // 2. NER Strip
    nerStrip.innerHTML = '<span class="ner-label">Detected:</span> ';
    (data.clinical_entities || []).forEach(e => {
        nerStrip.innerHTML += `<span class="ner-tag">${esc(e.word)} <small>${Math.round(e.score*100)}%</small></span>`;
    });

    // 3. Header Info
    const disease = tx.condition_name || csv.ayurveda_term || userQuery;
    safeSet('matchDetails', `Detected: ${userQuery} → ${disease}`);
    safeSet('itaCode', csv.ita_id || 'ITA');
    safeSet('diseaseName', disease);
    safeSet('sanskritName', tx.sanskrit_name || csv.sanskrit_iast || '');
    safeSet('snomedCode', data.snomed_code || '—');
    safeSet('snomedName', disease); // Fixed JS Error

    // Dosha Dots
    const fullText = (R.overview_dosha_causes || '') + ' ' + (R.symptoms || '');
    let dHTML = '';
    if(fullText.match(/vata/i)) dHTML += '<span class="dot vata"></span>';
    if(fullText.match(/pitta/i)) dHTML += '<span class="dot pitta"></span>';
    if(fullText.match(/kapha/i)) dHTML += '<span class="dot kapha"></span>';
    $('doshaLine').innerHTML = dHTML || '<span class="dot vata"></span><span class="dot pitta"></span><span class="dot kapha"></span> <span style="font-size:12px; color:#666">Tri-dosha assessment recommended</span>';

    // 4. Build Content
    let HTML = '';

    // -- Description --
    if(R.overview_dosha_causes) {
        HTML += `<div class="card fade-in">
            <div class="card-head"><span class="icon">📋</span><h3>Overview</h3></div>
            <p>${cleanText(R.overview_dosha_causes)}</p>
        </div>`;
    }

    // -- Symptoms (Simple Split) --
    if(R.symptoms) {
        HTML += `<div class="card fade-in">
            <div class="card-head"><span class="icon">🩺</span><h3>Symptoms</h3></div>
            <p>${cleanText(R.symptoms)}</p>
        </div>`;
    }

    // -- Ottamooli (Repetition Fix) --
    if(R.single_drug_remedies) {
        const fixedText = deduplicateContent(cleanText(R.single_drug_remedies));
        HTML += `<div class="card fade-in">
            <div class="card-head"><span class="icon">🌿</span><h3>Single Medicine Remedies</h3></div>
            <div class="remedy-box">${fixedText}</div>
        </div>`;
    }

    // -- Formulations --
    if(R.classical_formulations) {
        HTML += `<div class="card fade-in">
            <div class="card-head"><span class="icon">📜</span><h3>Classical Formulations</h3></div>
            <p>${cleanText(R.classical_formulations)}</p>
        </div>`;
    }

    // -- Complex Split: Panchakarma, Diet, Lifestyle --
    if(R.panchakarma_diet_lifestyle_yoga) {
        const sections = splitSections(R.panchakarma_diet_lifestyle_yoga);
        let pk='', dietFav=[], dietAv=[], life=[], yoga=[];

        sections.forEach(sec => {
            const cat = getCategory(sec);
            const cleanSec = cleanText(sec);

            if(cat === 'PK') pk = cleanSec;
            else if(cat === 'DIET') {
                // Split Favor/Avoid inside the sentence
                if(cleanSec.toLowerCase().includes('avoid')) {
                    const parts = cleanSec.split(/avoid/i);
                    dietFav = getListItems(parts[0].replace(/foods to (favor|eat)|pathya/i, ''));
                    dietAv = getListItems(parts[1]);
                } else {
                    dietFav = getListItems(cleanSec);
                }
            }
            else if(cat === 'LIFE') life = getListItems(cleanSec);
            else if(cat === 'YOGA') yoga = getListItems(cleanSec);
        });

        if(pk) HTML += `<div class="card fade-in"><div class="card-head"><span class="icon">🛁</span><h3>Panchakarma</h3></div><p>${pk}</p></div>`;
        
        if(dietFav.length || dietAv.length) {
            HTML += `<div class="card fade-in">
                <div class="card-head"><span class="icon">🍽️</span><h3>Diet (Pathya)</h3></div>
                <div class="diet-grid">
                    ${dietFav.length ? `<div class="diet-col favor"><h4>✅ Favor</h4><div>${dietFav.map(i=>`<span class="tag g">${i}</span>`).join('')}</div></div>` : ''}
                    ${dietAv.length ? `<div class="diet-col avoid"><h4>❌ Avoid</h4><div>${dietAv.map(i=>`<span class="tag r">${i}</span>`).join('')}</div></div>` : ''}
                </div>
            </div>`;
        }

        if(life.length || yoga.length) {
            HTML += `<div class="two-col fade-in">`;
            if(life.length) HTML += `<div class="card"><div class="card-head"><span class="icon">🏃</span><h3>Lifestyle</h3></div><ul>${life.map(i=>`<li>${i}</li>`).join('')}</ul></div>`;
            if(yoga.length) HTML += `<div class="card"><div class="card-head"><span class="icon">🧘</span><h3>Yoga</h3></div><div class="yoga-box">${yoga.map(i=>`<span>${i}</span>`).join('')}</div></div>`;
            HTML += `</div>`;
        }
    }

    // -- Prognosis --
    if(R.prognosis_modern_warnings) {
        HTML += `<div class="card fade-in">
            <div class="card-head"><span class="icon">📊</span><h3>Prognosis & Notes</h3></div>
            <p>${cleanText(R.prognosis_modern_warnings)}</p>
        </div>`;
    }

    resultsEl.innerHTML = HTML;
}
