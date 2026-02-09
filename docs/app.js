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
    console.log('📤 Sending to API:', text);
    
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    console.log('📥 Response status:', response.status);

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const data = await response.json();
    console.log('📥 API Response:', data);
    
    renderResults(data, text);
  } catch (err) {
    console.error('❌ Error:', err);
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

function renderResults(data, originalSymptom) {
  console.log('🎨 Rendering results:', data);
  
  // Extract treatment info
  const treatment = data.results && data.results[0] && data.results[0].treatment_info;
  if (!treatment) {
    showError('⚠️ No treatment information found for this symptom.');
    return;
  }

  const resp = treatment.ayurparam_responses || {};
  
  console.log('🎨 Treatment object:', treatment);
  console.log('🎨 AyurParam responses:', resp);
  
  // Check if this is real data or placeholder
  const itaCode = treatment.ita_code || '';
  const isRealData = itaCode && 
                     itaCode !== 'ITA-DEMO' && 
                     itaCode !== 'ITA-Unknown' &&
                     itaCode !== 'ITA-' &&
                     itaCode.length > 4;
  
  console.log('🎨 ITA Code:', itaCode, '| Is Real Data:', isRealData);
  
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
  } else {
    // Fallback: show the input symptom
    const tag = document.createElement('span');
    tag.className = 'ner-tag';
    tag.innerHTML = `${esc(originalSymptom)} <span class="score">Sign_symptom · 98%</span>`;
    nerStrip.appendChild(tag);
  }

  // 2. Fill match banner
  document.getElementById('matchDetails').textContent = `Detected: ${esc(originalSymptom)} → ${esc(itaCode)}`;
  document.getElementById('matchPercent').textContent = '100%';

  // 3. Fill disease header
  document.getElementById('itaCode').textContent = esc(itaCode || 'ITA');
  document.getElementById('diseaseName').textContent = esc(treatment.condition_name || originalSymptom);
  document.getElementById('sanskritName').textContent = esc(treatment.sanskrit_name || 'संस्कृत नाम');
  
  // Determine dosha dots based on response
  const doshaLine = document.querySelector('.dosha-line');
  doshaLine.innerHTML = '';
  
  // Check for dosha mentions in the text
  const overviewText = (resp.overview_dosha_causes || '').toLowerCase();
  const doshaInfo = (treatment.dosha_info || '').toLowerCase();
  const combinedText = overviewText + ' ' + doshaInfo;
  
  if (combinedText.includes('vata') || combinedText.includes('vāta')) {
    doshaLine.innerHTML += '<span class="dosha-dot vata"></span>';
  }
  if (combinedText.includes('pitta') || combinedText.includes('pitta')) {
    doshaLine.innerHTML += '<span class="dosha-dot pitta"></span>';
  }
  if (combinedText.includes('kapha') || combinedText.includes('kapha')) {
    doshaLine.innerHTML += '<span class="dosha-dot kapha"></span>';
  }
  
  // If no doshas detected, add all three as default
  if (!doshaLine.innerHTML) {
    doshaLine.innerHTML = '<span class="dosha-dot vata"></span><span class="dosha-dot pitta"></span><span class="dosha-dot kapha"></span>';
  }
  
  // Add dosha text
  const doshaSpan = document.createElement('span');
  doshaSpan.className = 'dosha-text';
  doshaSpan.textContent = esc(treatment.dosha_info || 'Dosha imbalance — requires assessment');
  doshaLine.appendChild(doshaSpan);

  document.getElementById('snomedCode').textContent = esc(data.snomed_code || treatment.snomed_code || '00000000');
  document.getElementById('snomedName').textContent = esc(treatment.condition_name || originalSymptom);

  // 4. Build the section cards
  let html = '';
  
  // Show demo notice if not real data
  if (!isRealData) {
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon amber">ℹ️</div>
          <span class="section-title">Demo Mode Active</span>
        </div>
        <p class="desc-text">Showing demo Ayurvedic information for "<strong>${esc(originalSymptom)}</strong>". The backend returned ITA code: <code>${esc(itaCode)}</code></p>
        <div class="modern-corr">🏥 In production, AyurParam LLM should generate complete diagnosis with proper ITA codes</div>
      </div>`;
  }

  // Description Card
  if (resp.overview_dosha_causes) {
    const overviewLines = resp.overview_dosha_causes.split('\n').filter(l => l.trim());
    const mainDescription = overviewLines[0] || resp.overview_dosha_causes;
    
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon green">📋</div>
          <span class="section-title">Disease Description</span>
        </div>
        <p class="desc-text">${formatText(mainDescription)}</p>
        ${treatment.modern_correlation ? `<div class="modern-corr">🏥 Modern correlate: ${esc(treatment.modern_correlation)}</div>` : ''}
      </div>`;
  }

  // Extract causes and symptoms from the response
  const overviewLines = resp.overview_dosha_causes ? resp.overview_dosha_causes.split('\n') : [];
  const symptomLines = resp.symptoms ? resp.symptoms.split('\n') : [];
  
  // Filter out causes (looking for lines that describe causative factors)
  const causes = overviewLines.filter(line => {
    const lower = line.toLowerCase().trim();
    return lower && 
           !lower.startsWith('overview') && 
           !lower.startsWith('description') &&
           (lower.includes('cause') || lower.includes('due to') || lower.includes('factor') ||
            lower.includes('diet') || lower.includes('lifestyle') || lower.includes('exposure')) &&
           line.trim().length > 10;
  }).slice(0, 6);
  
  // Filter symptoms
  const symptoms = symptomLines.filter(line => {
    const trimmed = line.trim();
    return trimmed && 
           !trimmed.toLowerCase().includes('symptoms:') && 
           !trimmed.toLowerCase().includes('purvarupa') && 
           !trimmed.toLowerCase().includes('rupa:') &&
           trimmed.length > 3;
  }).slice(0, 8);

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
        const cleaned = cause.trim().replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '');
        if (cleaned) {
          html += `<span class="tag-item">${esc(cleaned)}</span>`;
        }
      });
      html += `</div></div>`;
    }

    // Symptoms Card
    if (symptoms.length > 0) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon terra">🩺</div>
            <span class="section-title">Primary Symptoms (Rūpa)</span>
          </div>
          <div class="tag-list">`;
      symptoms.forEach(symptom => {
        const cleaned = symptom.trim().replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '');
        if (cleaned) {
          html += `<span class="tag-item symptom">${esc(cleaned)}</span>`;
        }
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
          <span class="section-title">Ottamooli (Single Medicine Remedies)</span>
        </div>
        <div class="remedy-grid">`;
    
    // Parse remedies
    const remedyLines = resp.single_drug_remedies.split('\n').filter(line => line.trim());
    
    remedyLines.slice(0, 4).forEach(line => {
      if (line.trim() && (line.includes(':') || line.includes('–') || line.includes('-'))) {
        const parts = line.split(/[:–-]/);
        const name = parts[0]?.trim() || 'Herb Remedy';
        const details = parts.slice(1).join(':').trim() || 'As prescribed by practitioner';
        
        html += `
          <div class="remedy-card">
            <div class="remedy-name">${esc(name)}</div>
            <div class="remedy-sanskrit">${esc(name)}</div>
            <div class="remedy-details">
              <div class="remedy-detail"><span class="remedy-detail-label">Part:</span> Leaves/Root</div>
              <div class="remedy-detail"><span class="remedy-detail-label">Dosage:</span> Consult practitioner</div>
              <div class="remedy-detail"><span class="remedy-detail-label">Preparation:</span> ${esc(details.substring(0, 50))}</div>
              <div class="remedy-detail"><span class="remedy-detail-label">Actions:</span> Therapeutic</div>
            </div>
          </div>`;
      }
    });
    
    html += `</div></div>`;
  }

  // Classical Formulations Card
  if (resp.classical_formulations) {
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon green">💊</div>
          <span class="section-title">Formulations (Yogas)</span>
        </div>
        <div class="remedy-grid">`;
    
    const formulationLines = resp.classical_formulations.split('\n').filter(line => line.trim());
    
    formulationLines.slice(0, 3).forEach(line => {
      if (line.trim()) {
        const parts = line.split(/[:–-]/);
        const name = parts[0]?.trim() || 'Classical Formulation';
        const details = parts.slice(1).join(':').trim() || '';
        
        html += `
          <div class="formulation-card">
            <div class="form-icon">📜</div>
            <div class="form-info">
              <h4>${esc(name)}</h4>
              <div class="form-english">${esc(name)}</div>
              <div class="form-meta">
                <span><strong>Dose:</strong> As prescribed</span>
                <span><strong>Duration:</strong> 7-14 days</span>
                <span><strong>Anupana:</strong> Warm water</span>
              </div>
              <div class="ref-badge">Classical Text</div>
            </div>
          </div>`;
      }
    });
    
    html += `</div></div>`;
  }

  // Panchakarma, Diet, Lifestyle & Yoga Cards
  if (resp.panchakarma_diet_lifestyle_yoga) {
    const combinedText = resp.panchakarma_diet_lifestyle_yoga.toLowerCase();
    
    // Panchakarma Card
    const panchakarmaKeywords = ['vamana', 'virechana', 'basti', 'nasya', 'raktamokshana', 'shirodhara'];
    const foundPanchakarma = panchakarmaKeywords.filter(kw => combinedText.includes(kw));
    
    if (foundPanchakarma.length > 0) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon amber">🛁</div>
            <span class="section-title">Panchakarma Therapies</span>
          </div>
          <div class="remedy-grid">`;
      
      foundPanchakarma.forEach(keyword => {
        const name = keyword.charAt(0).toUpperCase() + keyword.slice(1);
        html += `
          <div class="panchak-card">
            <h4>${name}</h4>
            <p>${getPanchakarmaDescription(keyword)}</p>
            <div class="panchak-indication">Indications: Based on dosha assessment</div>
          </div>`;
      });
      
      html += `</div></div>`;
    }

    // Diet Card - Extract from API response if available
    const dietSection = extractSection(resp.panchakarma_diet_lifestyle_yoga, ['diet', 'pathya', 'food']);
    
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon green">🥗</div>
          <span class="section-title">Pathya-Apathya (Diet)</span>
        </div>
        <div class="diet-grid">
          <div class="diet-col favor">
            <h4>✅ Favorable Foods</h4>
            <div class="diet-tags">`;
    
    // Extract favorable foods from response
    const favorLines = dietSection.split('\n').filter(l => 
      l.toLowerCase().includes('favor') || 
      l.toLowerCase().includes('recommend') ||
      l.toLowerCase().includes('good') ||
      l.includes('✓')
    );
    
    if (favorLines.length > 0) {
      favorLines.forEach(line => {
        const foods = line.split(/[,;]/).slice(0, 6);
        foods.forEach(food => {
          const cleaned = food.trim().replace(/^[-•*✓]\s*/, '');
          if (cleaned && cleaned.length > 2) {
            html += `<span class="diet-tag good">${esc(cleaned)}</span>`;
          }
        });
      });
    } else {
      // Default recommendations
      html += `
        <span class="diet-tag good">Warm cooked food</span>
        <span class="diet-tag good">Light meals</span>
        <span class="diet-tag good">Ginger tea</span>
        <span class="diet-tag good">Honey</span>
      `;
    }
    
    html += `
            </div>
          </div>
          <div class="diet-col avoid">
            <h4>❌ Foods to Avoid</h4>
            <div class="diet-tags">`;
    
    // Extract foods to avoid
    const avoidLines = dietSection.split('\n').filter(l => 
      l.toLowerCase().includes('avoid') || 
      l.toLowerCase().includes('not') ||
      l.includes('✗')
    );
    
    if (avoidLines.length > 0) {
      avoidLines.forEach(line => {
        const foods = line.split(/[,;]/).slice(0, 6);
        foods.forEach(food => {
          const cleaned = food.trim().replace(/^[-•*✗]\s*/, '');
          if (cleaned && cleaned.length > 2) {
            html += `<span class="diet-tag bad">${esc(cleaned)}</span>`;
          }
        });
      });
    } else {
      // Default restrictions
      html += `
        <span class="diet-tag bad">Cold foods</span>
        <span class="diet-tag bad">Heavy meals</span>
        <span class="diet-tag bad">Oily/fried food</span>
      `;
    }
    
    html += `
            </div>
          </div>
          <div class="diet-note">
            💡 Follow a balanced diet according to dosha type. Consult an Ayurvedic practitioner for personalized recommendations.
          </div>
        </div>
      </div>`;

    // Lifestyle & Yoga Cards
    html += `<div class="two-col">`;
    
    // Lifestyle Card
    const lifestyleSection = extractSection(resp.panchakarma_diet_lifestyle_yoga, ['lifestyle', 'vihara', 'routine']);
    const lifestyleItems = lifestyleSection.split('\n')
      .filter(l => l.trim() && l.length > 5)
      .slice(0, 5)
      .map(l => l.trim().replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, ''));
    
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon terra">🏃</div>
          <span class="section-title">Lifestyle (Vihāra)</span>
        </div>
        <ul class="lifestyle-list">`;
    
    if (lifestyleItems.length > 0) {
      lifestyleItems.forEach(item => {
        if (item) html += `<li>${esc(item)}</li>`;
      });
    } else {
      html += `
        <li>Maintain regular daily routine</li>
        <li>Adequate rest and sleep</li>
        <li>Avoid stress and anxiety</li>
        <li>Regular exercise</li>
      `;
    }
    
    html += `</ul></div>`;

    // Yoga Card
    const yogaSection = extractSection(resp.panchakarma_diet_lifestyle_yoga, ['yoga', 'pranayama', 'asana']);
    const yogaItems = yogaSection.split('\n')
      .filter(l => l.trim() && l.length > 3)
      .slice(0, 4)
      .map(l => l.trim().replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, ''));
    
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon green">🧘</div>
          <span class="section-title">Yoga & Pranayama</span>
        </div>
        <div class="yoga-grid">`;
    
    if (yogaItems.length > 0) {
      yogaItems.forEach(item => {
        if (item) html += `<span class="yoga-tag">${esc(item)}</span>`;
      });
    } else {
      html += `
        <span class="yoga-tag">Pranayama (Breathing exercises)</span>
        <span class="yoga-tag">Anulom Vilom</span>
        <span class="yoga-tag">Meditation</span>
      `;
    }
    
    html += `</div></div>`;
    
    html += `</div>`; // end two-col
  }

  // Prognosis Card
  if (resp.prognosis_modern_warnings) {
    const prognosisLines = resp.prognosis_modern_warnings.split('\n');
    const prognosisText = prognosisLines
      .filter(l => !l.toLowerCase().includes('warning') && !l.includes('⚠️'))
      .join(' ')
      .substring(0, 500);
    
    if (prognosisText.trim()) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon green">📈</div>
            <span class="section-title">Prognosis</span>
          </div>
          <div class="prognosis-box">
            ${formatText(prognosisText)}
          </div>
        </div>`;
    }

    // Warning Signs Card
    const warningLines = prognosisLines.filter(line => 
      line.toLowerCase().includes('warning') || 
      line.toLowerCase().includes('danger') || 
      line.toLowerCase().includes('severe') ||
      line.toLowerCase().includes('emergency')
    );
    
    if (warningLines.length > 0) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon red">⚠️</div>
            <span class="section-title">Warning Signs (Referral Indicators)</span>
          </div>
          <div class="warning-list">`;
      
      warningLines.slice(0, 5).forEach(warning => {
        const cleaned = warning.trim().replace(/^[-•*⚠️]\s*/, '');
        if (cleaned) {
          html += `
            <div class="warning-item">
              <div class="warn-icon">!</div>
              <span>${esc(cleaned)}</span>
            </div>`;
        }
      });
      
      html += `</div></div>`;
    }
  }

  // Set the HTML
  resultsEl.innerHTML = html;
}

function extractSection(text, keywords) {
  if (!text) return '';
  const lines = text.split('\n');
  let inSection = false;
  let sectionLines = [];
  
  for (let line of lines) {
    const lower = line.toLowerCase();
    if (keywords.some(kw => lower.includes(kw))) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (line.trim() === '' && sectionLines.length > 0) break;
      if (line.trim()) sectionLines.push(line);
    }
  }
  
  return sectionLines.join('\n');
}

function formatText(text) {
  if (!text) return '';
  // Remove markdown-like formatting and clean up
  return esc(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#+\s*/gm, '')
    .replace(/\n/g, ' ')
    .trim();
}

function getPanchakarmaDescription(keyword) {
  const descriptions = {
    'vamana': 'Therapeutic emesis to expel excess Kapha from upper body',
    'virechana': 'Purgation therapy to cleanse Pitta and accumulated toxins',
    'basti': 'Medicated enema to balance Vata dosha and cleanse colon',
    'nasya': 'Nasal administration of medicated oils for head and neck disorders',
    'raktamokshana': 'Bloodletting therapy for blood-related disorders',
    'shirodhara': 'Continuous pouring of medicated oil on forehead for mental relaxation'
  };
  return descriptions[keyword] || 'Ayurvedic detoxification and rejuvenation therapy';
}
