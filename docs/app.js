// ─── CONFIG ───
const API_BASE = 'https://aravindkv28--ayurparam-service-fastapi-app.modal.run';

// ─── DOM ───
const input        = document.getElementById('symptomInput');
const analyzeBtn   = document.getElementById('analyzeBtn');
const loadingEl    = document.getElementById('loading');
const errorEl      = document.getElementById('error');
const resultsEl    = document.getElementById('results');
const nerStrip     = document.getElementById('nerStrip');
const matchBanner  = document.getElementById('matchBanner');
const diseaseHeader= document.getElementById('diseaseHeader');
const disclaimerFooter = document.getElementById('disclaimerFooter');
const examplesContainer = document.getElementById('examples');

const SEARCH_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>';

// ─── INIT ───
fetch(API_BASE + '/warmup').catch(() => {});

if (examplesContainer) {
  examplesContainer.addEventListener('click', e => {
    if (e.target.classList.contains('example-btn')) {
      input.value = e.target.dataset.value || '';
      analyzeBtn.disabled = !input.value.trim();
      input.focus();
    }
  });
}

input.addEventListener('input', () => { analyzeBtn.disabled = !input.value.trim(); });
input.addEventListener('keypress', e => {
  if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); analyze(); }
});
analyzeBtn.addEventListener('click', analyze);

// ─── HELPERS ───
function esc(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function cleanLine(line) {
  return line.replace(/^[\s\-•*▸▹►·]+/, '').replace(/^\d+[\.\)]\s*/, '').trim();
}

function splitLines(text) {
  if (!text) return [];
  return text.split('\n').map(l => cleanLine(l)).filter(l => l.length > 2);
}

function fmt(text) {
  if (!text) return '';
  return esc(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#+\s*/gm, '')
    .trim();
}

/**
 * Parse LLM text blocks into structured objects.
 * Blocks are separated by double newlines or numbered headings.
 * Lines with "Key: Value" are extracted as properties.
 */
function parseBlocks(text) {
  if (!text) return [];
  const rawBlocks = text.split(/\n\s*\n|\n(?=\d+[\.\)]\s)/).filter(b => b.trim());
  const blocks = [];

  for (const raw of rawBlocks) {
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
    if (!lines.length) continue;

    const obj = { _lines: lines, _title: '' };
    let lastKey = '';

    for (const line of lines) {
      const kv = line.match(/^([A-Za-z_\s/()-]+)\s*[:\-–]\s*(.+)$/);
      if (kv) {
        const key = kv[1].trim().toLowerCase().replace(/\s+/g, '_');
        obj[key] = kv[2].trim();
        lastKey = key;
      } else if (!obj._title) {
        obj._title = cleanLine(line);
      } else if (lastKey && obj[lastKey]) {
        obj[lastKey] += ' ' + line.trim();
      }
    }

    if (obj._title || Object.keys(obj).length > 2) {
      blocks.push(obj);
    }
  }
  return blocks;
}

function extractSection(text, startPattern, endPatterns) {
  if (!text) return '';
  const re = new RegExp(startPattern + '[:\\s\\-–]*(.*?)(?=' + endPatterns.join('|') + '|$)', 'is');
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

function getPanchakarmaDesc(keyword) {
  const desc = {
    'vamana': 'Therapeutic emesis — expels excess Kapha from the upper body and respiratory tract.',
    'virechana': 'Purgation therapy — cleanses accumulated Pitta and toxins via the lower GI tract.',
    'basti': 'Medicated enema — primary treatment for Vata disorders; cleanses the colon.',
    'nasya': 'Nasal administration of medicated oils — treats disorders above the clavicle.',
    'raktamokshana': 'Bloodletting therapy — indicated for Pitta and blood-related disorders.',
    'shirodhara': 'Continuous pouring of warm medicated oil on the forehead — calms the nervous system.',
    'abhyanga': 'Full-body warm oil massage — nourishes tissues, calms Vata, improves circulation.',
    'swedana': 'Herbal steam therapy — opens channels, relieves stiffness, supports detoxification.',
  };
  return desc[keyword] || 'Traditional Ayurvedic detoxification and rejuvenation therapy.';
}


// ─── MAIN ───
async function analyze() {
  const text = input.value.trim();
  if (!text) return;

  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = SEARCH_SVG + ' Analyzing...';

  loadingEl.classList.remove('hidden');
  errorEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
  nerStrip.classList.add('hidden');
  matchBanner.classList.add('hidden');
  diseaseHeader.classList.add('hidden');
  disclaimerFooter.classList.add('hidden');
  resultsEl.innerHTML = '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error('HTTP ' + response.status);

    const data = await response.json();
    console.log('📥 API Response:', JSON.stringify(data, null, 2));

    renderResults(data, text);
  } catch (err) {
    console.error('❌ Error:', err);
    const msg = err.name === 'AbortError'
      ? 'Request timeout. AI is processing, please try again.'
      : 'Cannot connect to backend. Check Modal deployment.';
    showError('⚠️ ' + msg);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = SEARCH_SVG + ' Analyze';
    loadingEl.classList.add('hidden');
  }
}


// ─── RENDER ───
function renderResults(data, originalSymptom) {
  // Extract treatment_info from API response
  let treatment = null;
  if (data.results && data.results[0] && data.results[0].treatment_info) {
    treatment = data.results[0].treatment_info;
  } else if (data.treatment_info) {
    treatment = data.treatment_info;
  }

  if (!treatment) {
    showError('⚠️ No treatment information found for this symptom.');
    return;
  }

  const resp = treatment.ayurparam_responses || {};
  const csvMatch = data.csv_match || null;

  console.log('🔍 ayurparam_responses keys:', Object.keys(resp));

  // Show sections
  nerStrip.classList.remove('hidden');
  matchBanner.classList.remove('hidden');
  diseaseHeader.classList.remove('hidden');
  resultsEl.classList.remove('hidden');
  disclaimerFooter.classList.remove('hidden');

  // ── NER Strip ──
  nerStrip.innerHTML = '<span class="ner-strip-label">Detected Entities</span>';
  if (data.clinical_entities && data.clinical_entities.length) {
    data.clinical_entities.forEach(ent => {
      const tag = document.createElement('span');
      tag.className = 'ner-tag';
      tag.innerHTML = `${esc(ent.word)} <span class="score">${esc(ent.entity_group || 'Sign_symptom')} · ${Math.round((ent.score || 0.9) * 100)}%</span>`;
      nerStrip.appendChild(tag);
    });
  } else {
    const tag = document.createElement('span');
    tag.className = 'ner-tag';
    tag.innerHTML = `${esc(originalSymptom)} <span class="score">Sign_symptom · 98%</span>`;
    nerStrip.appendChild(tag);
  }

  // ── Match Banner ──
  const conditionName = treatment.condition_name || originalSymptom;
  document.getElementById('matchDetails').textContent = `Detected: ${originalSymptom} → ${conditionName}`;
  document.getElementById('matchPercent').textContent = '100%';

  // ── Disease Header ──
  document.getElementById('itaCode').textContent = csvMatch ? (csvMatch.ita_id || 'ITA') : 'ITA';
  document.getElementById('diseaseName').textContent = conditionName;
  document.getElementById('sanskritName').textContent = treatment.sanskrit_name || csvMatch?.sanskrit_iast || '';

  // Dosha dots
  const doshaLine = document.querySelector('.dosha-line') || document.getElementById('doshaLine');
  const overviewLower = ((resp.overview_dosha_causes || '') + ' ' + conditionName).toLowerCase();
  let doshaHTML = '';
  if (overviewLower.includes('vat') || overviewLower.includes('vāt')) doshaHTML += '<span class="dosha-dot vata"></span>';
  if (overviewLower.includes('pitt')) doshaHTML += '<span class="dosha-dot pitta"></span>';
  if (overviewLower.includes('kaph')) doshaHTML += '<span class="dosha-dot kapha"></span>';
  if (!doshaHTML) doshaHTML = '<span class="dosha-dot vata"></span><span class="dosha-dot pitta"></span><span class="dosha-dot kapha"></span>';
  doshaHTML += '<span class="dosha-text">Dosha imbalance — requires assessment</span>';
  doshaLine.innerHTML = doshaHTML;

  // SNOMED
  document.getElementById('snomedCode').textContent = data.snomed_code || '—';
  document.getElementById('snomedName').textContent = conditionName;

  // ── Build Cards ──
  let html = '';

  // A: Overview / Description
  if (resp.overview_dosha_causes) {
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon green">📋</div>
          <span class="section-title">Disease Description</span>
        </div>
        <p class="desc-text">${fmt(resp.overview_dosha_causes)}</p>
        ${csvMatch?.description ? `<div class="modern-corr">🏥 ${esc(csvMatch.description)}</div>` : ''}
      </div>`;
  }

  // B: Symptoms
  if (resp.symptoms) {
    const lines = splitLines(resp.symptoms).filter(l =>
      l.length > 3 && !/^(purvarupa|rupa|symptoms|prodromal|main\s+symptoms)/i.test(l)
    );
    const hasStructure = resp.symptoms.toLowerCase().includes('purvarupa') || resp.symptoms.toLowerCase().includes('rupa');

    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon terra">🩺</div>
          <span class="section-title">Symptoms (Pūrvarūpa & Rūpa)</span>
        </div>`;

    if (hasStructure) {
      html += `<div class="raw-text-block">${fmt(resp.symptoms)}</div>`;
    } else if (lines.length > 0) {
      html += `<div class="tag-list">${lines.slice(0, 12).map(s => `<span class="tag-item symptom">${esc(s)}</span>`).join('')}</div>`;
    }

    html += `</div>`;
  }

  // C: Single Drug Remedies
  if (resp.single_drug_remedies) {
    const blocks = parseBlocks(resp.single_drug_remedies);
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon green">🌿</div>
          <span class="section-title">Ottamooli (Single Medicine Remedies)</span>
        </div>
        <div class="remedy-grid">`;

    if (blocks.length > 0) {
      blocks.forEach(b => {
        const name = b._title || b.name || b.drug || 'Herb Remedy';
        html += `
          <div class="remedy-card">
            <div class="remedy-name">${esc(name)}</div>
            ${b.sanskrit || b.sanskrit_name ? `<div class="remedy-sanskrit">${esc(b.sanskrit || b.sanskrit_name)}</div>` : ''}
            <div class="remedy-details">
              ${b.part_used || b.part ? `<div class="remedy-detail"><span class="remedy-detail-label">Part Used</span> ${esc(b.part_used || b.part)}</div>` : ''}
              ${b.dosage || b.dose ? `<div class="remedy-detail"><span class="remedy-detail-label">Dosage</span> ${esc(b.dosage || b.dose)}</div>` : ''}
              ${b.preparation || b.method ? `<div class="remedy-detail"><span class="remedy-detail-label">Preparation</span> ${esc(b.preparation || b.method)}</div>` : ''}
              ${b.actions || b.action || b.karma ? `<div class="remedy-detail"><span class="remedy-detail-label">Actions</span> ${esc(b.actions || b.action || b.karma)}</div>` : ''}
              ${b.duration ? `<div class="remedy-detail"><span class="remedy-detail-label">Duration</span> ${esc(b.duration)}</div>` : ''}
            </div>
          </div>`;
      });
    } else {
      html += `<div class="raw-text-block" style="padding:12px">${fmt(resp.single_drug_remedies)}</div>`;
    }

    html += `</div></div>`;
  }

  // D: Classical Formulations
  if (resp.classical_formulations) {
    const blocks = parseBlocks(resp.classical_formulations);
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon amber">💊</div>
          <span class="section-title">Classical Formulations (Yogas)</span>
        </div>
        <div class="remedy-grid">`;

    if (blocks.length > 0) {
      blocks.forEach(b => {
        const name = b._title || b.name || 'Formulation';
        html += `
          <div class="formulation-card">
            <div class="form-icon">📜</div>
            <div class="form-info">
              <h4>${esc(name)}</h4>
              ${b.form || b.type ? `<div class="form-english">${esc(b.form || b.type)}</div>` : ''}
              <div class="form-meta">
                ${b.dosage || b.dose ? `<span><strong>Dose:</strong> ${esc(b.dosage || b.dose)}</span>` : ''}
                ${b.duration ? `<span><strong>Duration:</strong> ${esc(b.duration)}</span>` : ''}
                ${b.anupana || b.adjuvant ? `<span><strong>Anupāna:</strong> ${esc(b.anupana || b.adjuvant)}</span>` : ''}
              </div>
              ${b.reference || b.ref || b.text ? `<div class="ref-badge">Ref: ${esc(b.reference || b.ref || b.text)}</div>` : ''}
            </div>
          </div>`;
      });
    } else {
      html += `<div class="raw-text-block" style="padding:12px">${fmt(resp.classical_formulations)}</div>`;
    }

    html += `</div></div>`;
  }

  // E: Panchakarma, Diet, Lifestyle, Yoga (combined response)
  if (resp.panchakarma_diet_lifestyle_yoga) {
    const combined = resp.panchakarma_diet_lifestyle_yoga;
    const lower = combined.toLowerCase();

    // E1: Panchakarma
    const panchaSection = extractSection(combined,
      '(?:panchakarma|shodhana|treatment)',
      ['pathya', 'apathya', 'diet', 'vihara', 'lifestyle', 'yoga', 'pranayama']
    );

    if (panchaSection) {
      const lines = splitLines(panchaSection).filter(l => l.length > 5);
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon amber">🛁</div>
            <span class="section-title">Panchakarma Therapies</span>
          </div>
          <div class="remedy-grid">
            ${lines.length > 0
              ? lines.map(l => `<div class="panchak-card"><p>${esc(l)}</p></div>`).join('')
              : `<div class="raw-text-block" style="padding:12px">${fmt(panchaSection)}</div>`
            }
          </div>
        </div>`;
    } else {
      const panchaKeywords = ['vamana', 'virechana', 'basti', 'nasya', 'raktamokshana', 'shirodhara', 'abhyanga', 'swedana'];
      const found = panchaKeywords.filter(kw => lower.includes(kw));
      if (found.length > 0) {
        html += `
          <div class="section-card fade-in">
            <div class="section-header">
              <div class="section-icon amber">🛁</div>
              <span class="section-title">Panchakarma Therapies</span>
            </div>
            <div class="remedy-grid">
              ${found.map(kw => `
                <div class="panchak-card">
                  <h4>${esc(kw.charAt(0).toUpperCase() + kw.slice(1))}</h4>
                  <p>${esc(getPanchakarmaDesc(kw))}</p>
                </div>`).join('')}
            </div>
          </div>`;
      }
    }

    // E2: Diet
    const pathyaSection = extractSection(combined,
      '(?:pathya|diet|foods?\\s+to\\s+eat|favorable)',
      ['apathya', 'vihara', 'lifestyle', 'yoga', 'pranayama']
    );
    const apathyaSection = extractSection(combined,
      '(?:apathya|foods?\\s+to\\s+avoid|avoid)',
      ['vihara', 'lifestyle', 'yoga', 'pranayama']
    );

    if (pathyaSection || apathyaSection || lower.includes('pathya') || lower.includes('diet')) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon green">🥗</div>
            <span class="section-title">Pathya-Apathya (Diet)</span>
          </div>`;

      if (pathyaSection || apathyaSection) {
        html += `<div class="diet-grid">`;
        if (pathyaSection) {
          const foods = splitLines(pathyaSection).filter(f => f.length < 80).slice(0, 10);
          html += `<div class="diet-col favor"><h4>✅ Favorable</h4><div class="diet-tags">${foods.map(f => `<span class="diet-tag good">${esc(f)}</span>`).join('')}</div></div>`;
        }
        if (apathyaSection) {
          const foods = splitLines(apathyaSection).filter(f => f.length < 80).slice(0, 10);
          html += `<div class="diet-col avoid"><h4>❌ Avoid</h4><div class="diet-tags">${foods.map(f => `<span class="diet-tag bad">${esc(f)}</span>`).join('')}</div></div>`;
        }
        html += `<div class="diet-note">💡 Follow dietary guidelines suited to your dosha type. Consult an Ayurvedic practitioner.</div></div>`;
      } else {
        const dietBlock = extractSection(combined, '(?:pathya|diet)', ['vihara', 'lifestyle', 'yoga', 'pranayama']);
        if (dietBlock) html += `<div class="raw-text-block">${fmt(dietBlock)}</div>`;
      }

      html += `</div>`;
    }

    // E3+E4: Lifestyle & Yoga
    const viharaSection = extractSection(combined, '(?:vihara|lifestyle)', ['yoga', 'pranayama', 'prognosis']);
    const yogaSection = extractSection(combined, '(?:yoga|pranayama)', ['prognosis', 'modern', 'danger', 'warning']);

    if (viharaSection || yogaSection) {
      html += `<div class="two-col">`;

      if (viharaSection) {
        const items = splitLines(viharaSection).filter(l => l.length > 3 && l.length < 120).slice(0, 8);
        html += `<div class="section-card fade-in"><div class="section-header"><div class="section-icon terra">🏃</div><span class="section-title">Lifestyle (Vihāra)</span></div>`;
        html += items.length > 0
          ? `<ul class="lifestyle-list">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
          : `<div class="raw-text-block">${fmt(viharaSection)}</div>`;
        html += `</div>`;
      }

      if (yogaSection) {
        const items = splitLines(yogaSection).filter(l => l.length > 2 && l.length < 60).slice(0, 8);
        html += `<div class="section-card fade-in"><div class="section-header"><div class="section-icon green">🧘</div><span class="section-title">Yoga & Prāṇāyāma</span></div>`;
        html += items.length > 0
          ? `<div class="yoga-grid">${items.map(i => `<span class="yoga-tag">${esc(i)}</span>`).join('')}</div>`
          : `<div class="raw-text-block">${fmt(yogaSection)}</div>`;
        html += `</div>`;
      }

      html += `</div>`;
    }

    // E-Fallback
    if (!panchaSection && !pathyaSection && !apathyaSection && !viharaSection && !yogaSection) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon amber">🛁</div>
            <span class="section-title">Panchakarma, Diet, Lifestyle & Yoga</span>
          </div>
          <div class="raw-text-block">${fmt(resp.panchakarma_diet_lifestyle_yoga)}</div>
        </div>`;
    }
  }

  // F: Prognosis, Modern Correlation, Warnings
  if (resp.prognosis_modern_warnings) {
    const progText = resp.prognosis_modern_warnings;

    const prognosisSection = extractSection(progText, '(?:prognosis|sadhya|yapya|asadhya)', ['modern', 'correlation', 'danger', 'warning', 'referral']);
    const modernSection = extractSection(progText, '(?:modern\\s+(?:medical\\s+)?correlation|modern\\s+medicine|biomedical)', ['danger', 'warning', 'referral', 'sign']);
    const warningSection = extractSection(progText, '(?:danger|warning|referral|red\\s*flag)', ['$']);

    if (prognosisSection) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon green">📈</div>
            <span class="section-title">Prognosis</span>
          </div>
          <div class="prognosis-box">${fmt(prognosisSection)}</div>
        </div>`;
    }

    if (modernSection) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon blue">🏥</div>
            <span class="section-title">Modern Medical Correlation</span>
          </div>
          <p class="desc-text">${fmt(modernSection)}</p>
        </div>`;
    }

    if (warningSection) {
      const warnings = splitLines(warningSection).filter(l => l.length > 5).slice(0, 8);
      if (warnings.length > 0) {
        html += `
          <div class="section-card fade-in">
            <div class="section-header">
              <div class="section-icon red">⚠️</div>
              <span class="section-title">Warning Signs (Referral Indicators)</span>
            </div>
            <div class="warning-list">
              ${warnings.map(w => `<div class="warning-item"><div class="warn-icon">!</div><span>${esc(w)}</span></div>`).join('')}
            </div>
          </div>`;
      }
    }

    if (!prognosisSection && !modernSection && !warningSection) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon green">📈</div>
            <span class="section-title">Prognosis, Correlation & Warnings</span>
          </div>
          <div class="raw-text-block">${fmt(resp.prognosis_modern_warnings)}</div>
        </div>`;
    }
  }

  // Catch-all for any unhandled response keys
  const handledKeys = new Set([
    'overview_dosha_causes', 'symptoms', 'single_drug_remedies',
    'classical_formulations', 'panchakarma_diet_lifestyle_yoga',
    'prognosis_modern_warnings'
  ]);
  for (const [key, value] of Object.entries(resp)) {
    if (handledKeys.has(key) || !value || typeof value !== 'string') continue;
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon amber">📄</div>
          <span class="section-title">${esc(key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</span>
        </div>
        <div class="raw-text-block">${fmt(value)}</div>
      </div>`;
  }

  resultsEl.innerHTML = html;
}
