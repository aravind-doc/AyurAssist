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
    console.log('📥 Full API Response (stringified):', JSON.stringify(data, null, 2));
    
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
  
  // Extract treatment info - the API returns: data.results[0].treatment_info
  const treatment = data.results && data.results[0] && data.results[0].treatment_info;
  if (!treatment) {
    showError('⚠️ No treatment information found for this symptom.');
    return;
  }

  // The ayurparam_responses contains the LLM-generated text
  const resp = treatment.ayurparam_responses || {};
  
  console.log('🎨 Treatment object:', treatment);
  console.log('🎨 AyurParam responses:', resp);
  console.log('🎨 Condition name:', treatment.condition_name);
  console.log('🎨 Sanskrit name:', treatment.sanskrit_name);
  
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
      tag.innerHTML = `${esc(ent.word)} <span class="score">${esc(ent.entity_group || 'Sign_symptom')} · ${Math.round((ent.score || 0.9) * 100)}%</span>`;
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
  const conditionName = treatment.condition_name || originalSymptom;
  document.getElementById('matchDetails').textContent = `Detected: ${esc(originalSymptom)} → ${esc(conditionName)}`;
  document.getElementById('matchPercent').textContent = '100%';

  // 3. Fill disease header
  const csvMatch = data.csv_match;
  const itaCode = csvMatch ? csvMatch.ita_id : 'ITA';
  
  document.getElementById('itaCode').textContent = esc(itaCode || 'ITA');
  document.getElementById('diseaseName').textContent = esc(conditionName);
  document.getElementById('sanskritName').textContent = esc(treatment.sanskrit_name || csvMatch?.sanskrit_iast || 'संस्कृत नाम');
  
  // Determine dosha dots based on response
  const doshaLine = document.querySelector('.dosha-line');
  doshaLine.innerHTML = '';
  
  // Check for dosha mentions in the text
  const overviewText = (resp.overview_dosha_causes || '').toLowerCase();
  
  if (overviewText.includes('vata') || overviewText.includes('vāta')) {
    doshaLine.innerHTML += '<span class="dosha-dot vata"></span>';
  }
  if (overviewText.includes('pitta')) {
    doshaLine.innerHTML += '<span class="dosha-dot pitta"></span>';
  }
  if (overviewText.includes('kapha')) {
    doshaLine.innerHTML += '<span class="dosha-dot kapha"></span>';
  }
  
  // If no doshas detected, add all three as default
  if (!doshaLine.innerHTML) {
    doshaLine.innerHTML = '<span class="dosha-dot vata"></span><span class="dosha-dot pitta"></span><span class="dosha-dot kapha"></span>';
  }
  
  // Add dosha text
  const doshaSpan = document.createElement('span');
  doshaSpan.className = 'dosha-text';
  doshaSpan.textContent = 'Dosha imbalance — requires assessment';
  doshaLine.appendChild(doshaSpan);

  // SNOMED code
  document.getElementById('snomedCode').textContent = esc(data.snomed_code || '00000000');
  document.getElementById('snomedName').textContent = esc(conditionName);

  // 4. Build the section cards
  let html = '';

  // Description Card - ALWAYS SHOW if we have overview
  if (resp.overview_dosha_causes) {
    html += `
      <div class="section-card fade-in">
        <div class="section-header">
          <div class="section-icon green">📋</div>
          <span class="section-title">Disease Description</span>
        </div>
        <p class="desc-text">${formatText(resp.overview_dosha_causes)}</p>
      </div>`;
  }

  // Extract symptoms from the symptoms response
  if (resp.symptoms) {
    const symptomLines = resp.symptoms.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && 
             !trimmed.toLowerCase().startsWith('purvarupa') && 
             !trimmed.toLowerCase().startsWith('rupa') &&
             !trimmed.toLowerCase().startsWith('symptoms') &&
             trimmed.length > 5;
    }).slice(0, 8);

    if (symptomLines.length > 0) {
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon terra">🩺</div>
            <span class="section-title">Primary Symptoms (Rūpa)</span>
          </div>
          <div class="tag-list">`;
      
      symptomLines.forEach(symptom => {
        const cleaned = symptom.trim().replace(/^[-•*\d.)\s]+/, '');
        if (cleaned) {
          html += `<span class="tag-item symptom">${esc(cleaned)}</span>`;
        }
      });
      
      html += `</div></div>`;
    }
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
    
    // Parse remedies - split by lines and look for drug names
    const remedyText = resp.single_drug_remedies;
    const remedyBlocks = remedyText.split(/\n\n|\d+\.\s+/).filter(b => b.trim());
    
    remedyBlocks.slice(0, 3).forEach(block => {
      if (block.trim().length > 10) {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l);
        const name = lines[0] || 'Herb Remedy';
        
        html += `
          <div class="remedy-card">
            <div class="remedy-name">${esc(name)}</div>
            <div class="remedy-sanskrit">${esc(name)}</div>
            <div class="remedy-details">`;
        
        // Extract details from subsequent lines
        lines.slice(1).forEach(line => {
          if (line.toLowerCase().includes('part')) {
            const part = line.split(':')[1]?.trim() || 'As prescribed';
            html += `<div class="remedy-detail"><span class="remedy-detail-label">Part:</span> ${esc(part)}</div>`;
          } else if (line.toLowerCase().includes('dosage') || line.toLowerCase().includes('dose')) {
            const dosage = line.split(':')[1]?.trim() || 'Consult practitioner';
            html += `<div class="remedy-detail"><span class="remedy-detail-label">Dosage:</span> ${esc(dosage)}</div>`;
          } else if (line.toLowerCase().includes('preparation')) {
            const prep = line.split(':')[1]?.trim() || 'Standard';
            html += `<div class="remedy-detail"><span class="remedy-detail-label">Preparation:</span> ${esc(prep)}</div>`;
          }
        });
        
        html += `</div></div>`;
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
    
    const formulationText = resp.classical_formulations;
    const formBlocks = formulationText.split(/\n\n|\d+\.\s+/).filter(b => b.trim());
    
    formBlocks.slice(0, 3).forEach(block => {
      if (block.trim().length > 5) {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l);
        const name = lines[0] || 'Classical Formulation';
        
        html += `
          <div class="formulation-card">
            <div class="form-icon">📜</div>
            <div class="form-info">
              <h4>${esc(name)}</h4>
              <div class="form-meta">`;
        
        lines.slice(1).forEach(line => {
          if (line.toLowerCase().includes('dose') || line.toLowerCase().includes('dosage')) {
            const dose = line.split(':')[1]?.trim() || 'As prescribed';
            html += `<span><strong>Dose:</strong> ${esc(dose)}</span>`;
          } else if (line.toLowerCase().includes('duration')) {
            const duration = line.split(':')[1]?.trim() || '7-14 days';
            html += `<span><strong>Duration:</strong> ${esc(duration)}</span>`;
          } else if (line.toLowerCase().includes('anupana')) {
            const anupana = line.split(':')[1]?.trim() || 'Warm water';
            html += `<span><strong>Anupana:</strong> ${esc(anupana)}</span>`;
          } else if (line.toLowerCase().includes('reference')) {
            const ref = line.split(':')[1]?.trim() || 'Classical Text';
            html += `<div class="ref-badge">Ref: ${esc(ref)}</div>`;
          }
        });
        
        html += `</div></div></div>`;
      }
    });
    
    html += `</div></div>`;
  }

  // Panchakarma, Diet, Lifestyle & Yoga Cards
  if (resp.panchakarma_diet_lifestyle_yoga) {
    const combinedText = resp.panchakarma_diet_lifestyle_yoga;
    const lowerText = combinedText.toLowerCase();
    
    // Panchakarma Card
    const panchakarmaKeywords = ['vamana', 'virechana', 'basti', 'nasya', 'raktamokshana', 'shirodhara'];
    const foundPanchakarma = panchakarmaKeywords.filter(kw => lowerText.includes(kw));
    
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

    // Diet Card
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
    
    // Extract favorable foods
    const pathyaMatch = combinedText.match(/pathya[:\s-]+(.*?)(?=apathya|vihara|yoga|prognosis|$)/is);
    if (pathyaMatch) {
      const pathyaText = pathyaMatch[1];
      const foods = pathyaText.split(/[,;\n]/).map(f => f.trim()).filter(f => f.length > 2 && f.length < 50);
      foods.slice(0, 8).forEach(food => {
        const cleaned = food.replace(/^[-•*\d.)\s]+/, '');
        if (cleaned) {
          html += `<span class="diet-tag good">${esc(cleaned)}</span>`;
        }
      });
    } else {
      html += `
        <span class="diet-tag good">Warm cooked food</span>
        <span class="diet-tag good">Light meals</span>
        <span class="diet-tag good">Ginger tea</span>
      `;
    }
    
    html += `
            </div>
          </div>
          <div class="diet-col avoid">
            <h4>❌ Foods to Avoid</h4>
            <div class="diet-tags">`;
    
    // Extract foods to avoid
    const apathyaMatch = combinedText.match(/apathya[:\s-]+(.*?)(?=vihara|yoga|prognosis|$)/is);
    if (apathyaMatch) {
      const apathyaText = apathyaMatch[1];
      const foods = apathyaText.split(/[,;\n]/).map(f => f.trim()).filter(f => f.length > 2 && f.length < 50);
      foods.slice(0, 8).forEach(food => {
        const cleaned = food.replace(/^[-•*\d.)\s]+/, '');
        if (cleaned) {
          html += `<span class="diet-tag bad">${esc(cleaned)}</span>`;
        }
      });
    } else {
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
    const viharaMatch = combinedText.match(/vihara[:\s-]+(.*?)(?=yoga|pranayama|prognosis|$)/is);
    if (viharaMatch) {
      const viharaText = viharaMatch[1];
      const items = viharaText.split('\n').map(l => l.trim()).filter(l => l.length > 5 && l.length < 100);
      
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon terra">🏃</div>
            <span class="section-title">Lifestyle (Vihāra)</span>
          </div>
          <ul class="lifestyle-list">`;
      
      items.slice(0, 5).forEach(item => {
        const cleaned = item.replace(/^[-•*\d.)\s]+/, '');
        if (cleaned) {
          html += `<li>${esc(cleaned)}</li>`;
        }
      });
      
      html += `</ul></div>`;
    }

    // Yoga Card
    const yogaMatch = combinedText.match(/(?:yoga|pranayama)[:\s-]+(.*?)(?=prognosis|modern|danger|$)/is);
    if (yogaMatch) {
      const yogaText = yogaMatch[1];
      const items = yogaText.split(/[,;\n]/).map(l => l.trim()).filter(l => l.length > 2 && l.length < 50);
      
      html += `
        <div class="section-card fade-in">
          <div class="section-header">
            <div class="section-icon green">🧘</div>
            <span class="section-title">Yoga & Pranayama</span>
          </div>
          <div class="yoga-grid">`;
      
      items.slice(0, 6).forEach(item => {
        const cleaned = item.replace(/^[-•*\d.)\s]+/, '');
        if (cleaned) {
          html += `<span class="yoga-tag">${esc(cleaned)}</span>`;
        }
      });
      
      html += `</div></div>`;
    }
    
    html += `</div>`; // end two-col
  }

  // Prognosis Card
  if (resp.prognosis_modern_warnings) {
    const prognosisText = resp.prognosis_modern_warnings;
    const prognosisMatch = prognosisText.match(/prognosis[:\s-]+(.*?)(?=modern|danger|warning|$)/is);
    
    if (prognosisMatch) {
      const prognosis = prognosisMatch[1].trim();
      if (prognosis.length > 10) {
        html += `
          <div class="section-card fade-in">
            <div class="section-header">
              <div class="section-icon green">📈</div>
              <span class="section-title">Prognosis</span>
            </div>
            <div class="prognosis-box">
              ${formatText(prognosis)}
            </div>
          </div>`;
      }
    }

    // Warning Signs Card
    const warningMatch = prognosisText.match(/(?:danger|warning)[:\s-]+(.*?)$/is);
    if (warningMatch) {
      const warningText = warningMatch[1];
      const warnings = warningText.split('\n').map(l => l.trim()).filter(l => l.length > 5);
      
      if (warnings.length > 0) {
        html += `
          <div class="section-card fade-in">
            <div class="section-header">
              <div class="section-icon red">⚠️</div>
              <span class="section-title">Warning Signs (Referral Indicators)</span>
            </div>
            <div class="warning-list">`;
        
        warnings.slice(0, 5).forEach(warning => {
          const cleaned = warning.replace(/^[-•*\d.)\s]+/, '');
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
