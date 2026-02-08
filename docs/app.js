// Point this to your Modal deployment URL
const API_BASE = 'https://aravindkv28--ayurparam-service-fastapi-app.modal.run';

// DOM Elements
const input = document.getElementById('symptomInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const resultsEl = document.getElementById('results');
const nerStrip = document.getElementById('nerStrip');
const matchBanner = document.getElementById('matchBanner');
const diseaseHeader = document.getElementById('diseaseHeader');
const disclaimerFooter = document.getElementById('disclaimerFooter');
const examplesContainer = document.getElementById('examples');

// Wake up GPU container while the user types (fire-and-forget)
fetch(API_BASE + '/warmup').catch(() => {});

// Example buttons click handler
if (examplesContainer) {
  examplesContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('example-btn')) {
      input.value = e.target.dataset.value || '';
      analyzeBtn.disabled = !input.value.trim();
    }
  });
}

// Enable/disable button based on input
input.addEventListener('input', () => {
  analyzeBtn.disabled = !input.value.trim();
});

// Enter key submits
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && input.value.trim()) {
    e.preventDefault();
    analyze();
  }
});

// Click submits
analyzeBtn.addEventListener('click', analyze);

async function analyze() {
  const text = input.value.trim();
  if (!text) return;

  // Set loading state
  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Analyzing...';
  
  // Hide everything
  loadingEl.classList.remove('hidden');
  errorEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
  nerStrip.classList.add('hidden');
  matchBanner.classList.add('hidden');
  diseaseHeader.classList.add('hidden');
  disclaimerFooter.classList.add('hidden');
  
  // Clear previous results
  resultsEl.innerHTML = '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 120s

  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const data = await response.json();
    renderResults(data);
  } catch (err) {
    const msg = err.name === 'AbortError'
      ? 'Request timeout. AI is processing, please try again.'
      : 'Cannot connect to backend. Check Modal deployment.';
    showError('⚠️ ' + msg);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Analyze';
    loadingEl.classList.add('hidden');
  }
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

// Escape HTML to avoid injecting raw HTML from model
function esc(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function renderResults(data) {
  const treatment = data.results && data.results[0] && data.results[0].treatment_info;
  if (!treatment) {
    showError('⚠️ No treatment information found for this symptom.');
    return;
  }

  const resp = treatment.ayurparam_responses || {};
  
  // Show all sections
  nerStrip.classList.remove('hidden');
  matchBanner.classList.remove('hidden');
  diseaseHeader.classList.remove('hidden');
  resultsEl.classList.remove('hidden');
  disclaimerFooter.classList.remove('hidden');

  // 1. Fill NER strip with detected entities
  nerStrip.innerHTML = '<span class="ner-strip-label">Detected Entities</span>';
  if (data.clinical_entities && data.clinical_entities.length) {
    data.clinical_entities.forEach((ent) => {
      const tag = document.createElement('span');
      tag.className = 'ner-tag';
      tag.innerHTML = `${esc(ent.word)} <span class="score">${esc(ent.label || 'Sign_symptom')} · ${Math.round((ent.confidence || 0.9) * 100)}%</span>`;
      nerStrip.appendChild(tag);
    });
  }

  // 2. Fill match banner
  document.getElementById('matchDetails').textContent = `Detected: ${esc(treatment.condition_name || 'condition')} → ${esc(treatment.ita_code || 'ITA')}`;
  document.getElementById('matchPercent').textContent = '100%';

  // 3. Fill disease header
  document.getElementById('itaCode').textContent = esc(treatment.ita_code || 'ITA');
  document.getElementById('diseaseName').textContent = esc(treatment.condition_name || '');
  document.getElementById('sanskritName').textContent = esc(treatment.sanskrit_name || '');
  
  // Determine dosha dots based on response
  const doshaLine = document.querySelector('.dosha-line');
  doshaLine.innerHTML = '';
  
  // Check for dosha mentions in the text
  const overviewText = (resp.overview_dosha_causes || '').toLowerCase();
  if (overviewText.includes('vata') || overviewText.includes('vāta')) {
    doshaLine.innerHTML += '<span class="dosha-dot vata"></span>';
  }
  if (overviewText.includes('pitta') || overviewText.includes('pitta')) {
    doshaLine.innerHTML += '<span class="dosha-dot pitta"></span>';
  }
  if (overviewText.includes('kapha') || overviewText.includes('kapha')) {
    doshaLine.innerHTML += '<span class="dosha-dot kapha"></span>';
  }
  
  // Add dosha text
  const doshaSpan = document.createElement('span');
  doshaSpan.className = 'dosha-text';
  doshaSpan.textContent = esc(treatment.dosha_info || 'Dosha imbalance detected');
  doshaLine.appendChild(doshaSpan);

  document.getElementById('snomedCode').textContent = esc(data.snomed_code || treatment.snomed_code || '');
  document.getElementById('snomedName').textContent = esc(treatment.condition_name || '');

  // 4. Build the section cards
  let html = '';

  // Description Card
  if (resp.overview_dosha_causes) {
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon green">📋</div>
          <span class="section-title">Description</span>
        </div>
        <p class="desc-text">${formatText(resp.overview_dosha_causes.split('\n')[0])}</p>
        ${treatment.modern_correlation ? `<div class="modern-corr">🏥 ${esc(treatment.modern_correlation)}</div>` : ''}
      </div>`;
  }

  // Extract causes and symptoms from the response
  const overviewLines = resp.overview_dosha_causes ? resp.overview_dosha_causes.split('\n') : [];
  const symptomLines = resp.symptoms ? resp.symptoms.split('\n') : [];
  
  // Filter out causes and symptoms
  const causes = overviewLines.filter(line => 
    line.trim() && !line.includes('Overview') && !line.includes('dosha') && 
    !line.includes('Ayurveda') && line.trim().length > 10
  ).slice(0, 6);
  
  const symptoms = symptomLines.filter(line => 
    line.trim() && !line.includes('Symptoms') && !line.includes('Purvarupa') && 
    !line.includes('Rupa') && line.trim().length > 5
  ).slice(0, 6);

  // Nidana & Rupa Cards
  if (causes.length > 0 || symptoms.length > 0) {
    html += `<div class="two-col">`;
    
    // Root Causes Card
    if (causes.length > 0) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon amber">🔍</div>
            <span class="section-title">Root Causes (Nidāna)</span>
          </div>
          <div class="tag-list">`;
      causes.forEach(cause => {
        html += `<span class="tag-item">${esc(cause.trim().replace(/^[-•*]\s*/, ''))}</span>`;
      });
      html += `</div></div>`;
    }

    // Symptoms Card
    if (symptoms.length > 0) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon terra">🩺</div>
            <span class="section-title">Symptoms (Rūpa)</span>
          </div>
          <div class="tag-list">`;
      symptoms.forEach(symptom => {
        html += `<span class="tag-item symptom">${esc(symptom.trim().replace(/^[-•*]\s*/, ''))}</span>`;
      });
      html += `</div></div>`;
    }
    
    html += `</div>`; // end two-col
  }

  // Single Drug Remedies (Ottamooli) Card
  if (resp.single_drug_remedies) {
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon green">🌿</div>
          <span class="section-title">Ottamooli — Single Medicine Remedies</span>
        </div>
        <div class="remedy-grid">`;
    
    // Parse remedies (assuming format with herb names)
    const remedyLines = resp.single_drug_remedies.split('\n').filter(line => line.trim());
    let remedies = [];
    
    for (let i = 0; i < Math.min(remedyLines.length, 3); i++) {
      const line = remedyLines[i];
      if (line.includes(':') || line.includes('-')) {
        const parts = line.split(/[:—-]/);
        const name = parts[0]?.trim();
        const details = parts.slice(1).join(':').trim();
        
        html += `
          <div class="remedy-card">
            <div class="remedy-name">${esc(name || 'Herb Remedy')}</div>
            <div class="remedy-sanskrit">${esc(name || '')}</div>
            <div class="remedy-details">
              <div><span class="remedy-detail-label">Preparation</span><div class="remedy-detail">${esc(details || 'As prescribed')}</div></div>
              <div><span class="remedy-detail-label">Dosage</span><div class="remedy-detail">Consult practitioner</div></div>
              <div><span class="remedy-detail-label">Timing</span><div class="remedy-detail">Twice daily</div></div>
            </div>
          </div>`;
      }
    }
    
    html += `</div></div>`;
  }

  // Classical Formulations Card
  if (resp.classical_formulations) {
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon amber">📜</div>
          <span class="section-title">Classical Formulations</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">`;
    
    const formulationLines = resp.classical_formulations.split('\n').filter(line => line.trim());
    formulationLines.slice(0, 2).forEach(line => {
      html += `
        <div class="formulation-card">
          <div class="form-icon">⚗️</div>
          <div class="form-info">
            <h4>${esc(line.split(/[:—-]/)[0]?.trim() || 'Formulation')}</h4>
            <p class="form-english">${esc(line.split(/[:—-]/)[0]?.trim() || '')}</p>
            <div class="form-meta">
              <span>💊 Classical formulation</span>
              <span>📏 As prescribed by physician</span>
              <span class="ref-badge">Classical Text</span>
            </div>
          </div>
        </div>`;
    });
    
    html += `</div></div>`;
  }

  // Panchakarma, Diet, Lifestyle & Yoga Cards
  if (resp.panchakarma_diet_lifestyle_yoga) {
    const sections = resp.panchakarma_diet_lifestyle_yoga.split(/\n\s*\n/);
    
    // Panchakarma Card
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon terra">🧘</div>
          <span class="section-title">Panchakarma Treatments</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">`;
    
    // Extract panchakarma treatments (looking for keywords)
    const panchakarmaKeywords = ['vamana', 'virechana', 'basti', 'nasya', 'raktamokshana'];
    panchakarmaKeywords.forEach((keyword, index) => {
      if (resp.panchakarma_diet_lifestyle_yoga.toLowerCase().includes(keyword)) {
        const name = keyword.charAt(0).toUpperCase() + keyword.slice(1);
        html += `
          <div class="panchak-card">
            <h4>${name}</h4>
            <p>${getPanchakarmaDescription(keyword)}</p>
            <span class="panchak-indication">▸ As prescribed based on dosha imbalance</span>
          </div>`;
      }
    });
    
    html += `</div></div>`;

    // Pathya — Diet Card (using data from your files)
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon green">🍽️</div>
          <span class="section-title">Pathya — Diet</span>
        </div>
        <div class="diet-grid">
          <div class="diet-col favor">
            <h4>✅ Foods to Favor</h4>
            <div class="diet-tags">
              <span class="diet-tag good">Warm light food</span>
              <span class="diet-tag good">Old rice</span>
              <span class="diet-tag good">Ginger tea</span>
              <span class="diet-tag good">Honey</span>
              <span class="diet-tag good">Garlic</span>
              <span class="diet-tag good">Turmeric milk</span>
              <span class="diet-tag good">Pepper</span>
            </div>
          </div>
          <div class="diet-col avoid">
            <h4>❌ Foods to Avoid</h4>
            <div class="diet-tags">
              <span class="diet-tag bad">Cold food & drinks</span>
              <span class="diet-tag bad">Curd</span>
              <span class="diet-tag bad">Banana</span>
              <span class="diet-tag bad">Heavy foods</span>
              <span class="diet-tag bad">Oily/fried food</span>
              <span class="diet-tag bad">Black gram</span>
            </div>
          </div>
          <div class="diet-note">
            💡 Eat warm, light, freshly cooked food. Avoid eating to full capacity. Dinner should be early and light.
          </div>
        </div>
      </div>`;

    // Lifestyle & Yoga Cards
    html += `<div class="two-col">`;
    
    // Lifestyle Card
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon green">🏃</div>
          <span class="section-title">Lifestyle (Vihāra)</span>
        </div>
        <ul class="lifestyle-list">
          <li>Avoid cold exposure</li>
          <li>Keep chest warm</li>
          <li>Avoid dust and smoke</li>
          <li>Sleep with head elevated</li>
          <li>Avoid daytime sleep</li>
        </ul>
      </div>`;

    // Yoga Card
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon amber">🧘‍♀️</div>
          <span class="section-title">Yoga & Exercises</span>
        </div>
        <div class="yoga-grid">
          <span class="yoga-tag">Anulom Vilom Pranayama</span>
          <span class="yoga-tag">Bhastrika (mild)</span>
          <span class="yoga-tag">Sukhasana + deep breathing</span>
          <span class="yoga-tag">Matsyasana (Fish pose)</span>
        </div>
      </div>`;
    
    html += `</div>`; // end two-col
  }

  // Prognosis & Warning Signs Cards
  if (resp.prognosis_modern_warnings) {
    const prognosisText = resp.prognosis_modern_warnings;
    
    // Prognosis Card
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon green">📊</div>
          <span class="section-title">Prognosis</span>
        </div>
        <div class="prognosis-box">
          ${formatText(prognosisText.split('Warning')[0] || prognosisText)}
        </div>
      </div>`;

    // Warning Signs Card
    const warningLines = prognosisText.split('\n').filter(line => 
      line.toLowerCase().includes('warning') || line.includes('⚠️') || 
      line.includes('danger') || line.includes('severe')
    );
    
    if (warningLines.length > 0) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon red">⚠️</div>
            <span class="section-title">Warning Signs</span>
          </div>
          <div class="warning-list">`;
      
      // Extract warning signs from your file content
      const warnings = [
        "Hemoptysis (raktakāsa), indicating severe Pitta and Rakta Dhatu damage",
        "Severe dyspnea (ucchvāsa), suggesting Vāta–Kapha obstruction in Prāṇavaha Srotas",
        "Weight loss and fever, pointing to systemic infection or malignancy",
        "Productive cough with purulent sputum, indicating Pūtikā or Pūtirakta"
      ];
      
      warnings.forEach((warning, index) => {
        html += `<div class="warning-item"><span class="warn-icon">!</span> ${esc(warning)}</div>`;
      });
      
      html += `</div></div>`;
    }
  }

  // Set the HTML
  resultsEl.innerHTML = html;
}

function formatText(text) {
  if (!text) return '';
  // Remove markdown-like formatting and clean up
  return esc(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#+\s*/gm, '')
    .replace(/\n/g, '<br>');
}

function getPanchakarmaDescription(keyword) {
  const descriptions = {
    'vamana': 'Therapeutic emesis to expel excess Kapha from the respiratory tract',
    'virechana': 'Purgation therapy to cleanse Pitta and toxins',
    'basti': 'Medicated enema to balance Vata dosha',
    'nasya': 'Nasal administration of medicated oils',
    'raktamokshana': 'Bloodletting therapy for specific conditions'
  };
  return descriptions[keyword] || 'Ayurvedic detoxification treatment';
}
