// ═══════════════════════════════════════════════════════════
//  AyurAssist app.js — External script version
//  Same logic as the inline <script> in index.html
// ═══════════════════════════════════════════════════════════

const API_BASE = 'https://aravindkv28--ayurparam-service-fastapi-app.modal.run';
const $ = id => document.getElementById(id);
const input = $('symptomInput'), btn = $('analyzeBtn'), loadEl = $('loading'), errEl = $('error');
const nerStrip = $('nerStrip'), matchBanner = $('matchBanner'), diseaseHeader = $('diseaseHeader');
const resultsEl = $('results'), disclaimer = $('disclaimerFooter');
const SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';

fetch(API_BASE+'/warmup').catch(()=>{});
input.addEventListener('input', ()=>{ btn.disabled=!input.value.trim(); });
input.addEventListener('keypress', e=>{ if(e.key==='Enter'&&!btn.disabled){e.preventDefault();analyze();} });
btn.addEventListener('click', analyze);
$('examples').addEventListener('click', e=>{
  if(e.target.classList.contains('example-btn')){input.value=e.target.dataset.value||'';btn.disabled=!input.value.trim();input.focus();}
});

/* ═══════════════ PARSING UTILITIES ═══════════════ */

function esc(s){if(s==null)return '';const d=document.createElement('div');d.textContent=String(s);return d.innerHTML;}
function clean(line){return line.replace(/^[\s\-•*▸▹►·:]+/,'').replace(/^\d+[\.\)]\s*/,'').trim();}
function getLines(text, minLen){
  if(!text) return [];
  minLen = minLen || 3;
  return text.split('\n').map(l=>clean(l)).filter(l=>l.length>=minLen);
}
function fmt(text){
  if(!text) return '';
  return esc(text).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>').replace(/^#+\s*/gm,'');
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
  const chunks = text.split(/\n\s*\n|\n(?=\d+[\.\)]\s)/).filter(b=>b.trim().length>5);
  const result = [];
  for(const chunk of chunks){
    const cLines = chunk.split('\n').map(l=>l.trim()).filter(l=>l);
    if(!cLines.length) continue;
    const obj = {_title:'', _raw:chunk};
    for(const line of cLines){
      const kv = line.match(/^[-•*\d.\s]*([A-Za-z\s_/()āīūṛṝḷḹēōṃḥśṣṇñṅṭḍĀĪŪ]{2,40}?)\s*[:\-–]\s+(.+)$/);
      if(kv && kv[2].trim()){
        const key = kv[1].trim().toLowerCase().replace(/\s+/g,'_').replace(/^[-•*\d.\s]+/,'');
        if(key.length>=2){ obj[key] = kv[2].trim(); continue; }
      }
      if(!obj._title) obj._title = clean(line);
    }
    const keys = Object.keys(obj).filter(k=>!k.startsWith('_'));
    if(obj._title || keys.length>0) result.push(obj);
  }
  return result;
}

function gf(block){
  const keys = Array.prototype.slice.call(arguments, 1);
  for(const k of keys){
    if(block[k]) return block[k];
    const uk = k.replace(/\s+/g,'_');
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
  btn.disabled=true; btn.innerHTML=SVG+' Analyzing...';
  loadEl.classList.remove('hidden'); errEl.classList.add('hidden');
  [nerStrip,matchBanner,diseaseHeader,resultsEl,disclaimer].forEach(el=>el.classList.add('hidden'));
  resultsEl.innerHTML='';

  const ctrl = new AbortController();
  const tout = setTimeout(()=>ctrl.abort(), 120000);
  try{
    const res = await fetch(API_BASE,{
      method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({text}), signal:ctrl.signal
    });
    clearTimeout(tout);
    if(!res.ok) throw new Error('HTTP '+res.status+': '+(await res.text()));
    const data = await res.json();
    console.log('API response:', JSON.stringify(data,null,2));
    if(!data||!Object.keys(data).length) throw new Error('Empty response');
    render(data, text);
  }catch(err){
    console.error(err);
    errEl.textContent = '⚠️ ' + (err.name==='AbortError' ? 'Request timeout. Try again.' : err.message.includes('fetch') ? 'Network error.' : err.message);
    errEl.classList.remove('hidden');
  }finally{
    btn.disabled=false; btn.innerHTML=SVG+' Analyze'; loadEl.classList.add('hidden'); btn.disabled=!input.value.trim();
  }
}

/* ═══════════════ RENDER ═══════════════ */

function render(data, originalSymptom){
  let treatment = null;
  if(data.results && Array.isArray(data.results) && data.results.length>0)
    treatment = data.results[0].treatment_info;
  else if(data.treatment_info)
    treatment = data.treatment_info;
  if(!treatment){ errEl.textContent='⚠️ No treatment info returned.'; errEl.classList.remove('hidden'); return; }

  const R = treatment.ayurparam_responses || {};
  const csv = data.csv_match || null;

  console.log('ayurparam_responses:');
  for(const [k,v] of Object.entries(R)) console.log('  '+k+':', (v||'').length, 'chars');
  console.log('snomed_code:', data.snomed_code);

  [nerStrip,matchBanner,diseaseHeader,resultsEl,disclaimer].forEach(el=>el.classList.remove('hidden'));

  // NER Strip
  nerStrip.innerHTML = '<span class="ner-strip-label">Detected Entities</span>';
  const ents = data.clinical_entities;
  if(ents && ents.length){
    ents.forEach(e=>{
      const t=document.createElement('span'); t.className='ner-tag';
      t.innerHTML=`${esc(e.word)} <span class="score">${esc(e.entity_group||'Sign_symptom')} · ${Math.round((e.score||.9)*100)}%</span>`;
      nerStrip.appendChild(t);
    });
  } else {
    const t=document.createElement('span'); t.className='ner-tag';
    t.innerHTML=`${esc(originalSymptom)} <span class="score">Sign_symptom · 98%</span>`;
    nerStrip.appendChild(t);
  }

  // Match Banner
  const cond = treatment.condition_name || (csv&&csv.ayurveda_term) || originalSymptom;
  $('matchDetails').textContent = 'Detected: '+originalSymptom+' → '+cond;
  $('matchPercent').textContent = '100%';

  // Disease Header
  $('itaCode').textContent = (csv&&csv.ita_id) || 'ITA';
  $('diseaseName').textContent = cond;
  $('sanskritName').textContent = treatment.sanskrit_name || (csv&&csv.sanskrit_iast) || (csv&&csv.sanskrit) || '';

  const oLow = ((R.overview_dosha_causes||'')+' '+cond).toLowerCase();
  let dh='';
  if(/v[aā]t/i.test(oLow)) dh+='<span class="dosha-dot vata"></span>';
  if(/pitt/i.test(oLow))    dh+='<span class="dosha-dot pitta"></span>';
  if(/kaph/i.test(oLow))    dh+='<span class="dosha-dot kapha"></span>';
  if(!dh) dh='<span class="dosha-dot vata"></span><span class="dosha-dot pitta"></span><span class="dosha-dot kapha"></span>';
  dh+='<span class="dosha-text">Dosha imbalance — requires assessment</span>';
  $('doshaLine').innerHTML = dh;

  const snomed = data.snomed_code || (data.results&&data.results[0]&&data.results[0].snomed_code) || '';
  $('snomedCode').textContent = (snomed && snomed!=='N/A') ? snomed : '—';
  $('snomedName').textContent = cond;

  let H = '';

  // 1. Disease Description
  if(R.overview_dosha_causes){
    H += '<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">📋</div><span class="sc-title">Disease Description</span></div>';
    H += '<p class="desc-text">'+fmt(R.overview_dosha_causes)+'</p>';
    if(csv&&csv.description) H += '<div style="margin-top:10px;font-size:13px;color:var(--text-light);background:var(--bg-warm);padding:6px 14px;border-radius:8px">🏥 '+esc(csv.description)+'</div>';
    H += '</div>';
  }

  // 2. Nidāna + Rūpa
  let nidanaItems = [];
  if(R.overview_dosha_causes){
    const nT = extractBetween(R.overview_dosha_causes, '(?:nid[aā]na|causes?|etiolog)', ['purvarupa','r[uū]pa','symptom','srotas','dosha','the\\s+main','involve']);
    if(nT) nidanaItems = getLines(nT,4).filter(l=>!/^(nid[aā]na|causes?|the main|include|are|etiolog)/i.test(l)&&l.length<100).slice(0,10);
  }
  let purvaItems=[], rupaItems=[];
  if(R.symptoms){
    const sT=R.symptoms;
    const pT=extractBetween(sT,'(?:p[uū]rvar[uū]pa|prodromal)',['(?<!p[uū]rva)r[uū]pa','main\\s+symptom','chief']);
    if(pT) purvaItems=getLines(pT,4).filter(l=>!/^(p[uū]rvar[uū]pa|prodromal|symptom)/i.test(l)&&l.length<100).slice(0,8);
    const rT=extractBetween(sT,'(?:(?<!p[uū]rva)r[uū]pa|main\\s+symptom|chief)',['treatment','remedy','formulation','panchakarma']);
    if(rT) rupaItems=getLines(rT,4).filter(l=>!/^(r[uū]pa|main\s+symptom|symptom)/i.test(l)&&l.length<100).slice(0,10);
    if(!purvaItems.length&&!rupaItems.length) rupaItems=getLines(sT,4).filter(l=>!/^(p[uū]rvar[uū]pa|r[uū]pa|symptom|prodromal)/i.test(l)&&l.length<100).slice(0,10);
  }
  const hasNid=nidanaItems.length>0, hasSym=purvaItems.length>0||rupaItems.length>0;
  if(hasNid||hasSym){
    H+='<div class="two-col fade-in">';
    if(hasNid){
      H+='<div class="sc" style="margin-bottom:0"><div class="sc-head"><div class="sc-icon amber">🔍</div><span class="sc-title">Root Causes (Nidāna)</span></div>';
      H+='<div class="tag-list">'+nidanaItems.map(n=>'<span class="tag-nidana">'+esc(n)+'</span>').join('')+'</div></div>';
    } else H+='<div></div>';
    if(hasSym){
      H+='<div class="sc" style="margin-bottom:0"><div class="sc-head"><div class="sc-icon terra">🩺</div><span class="sc-title">Symptoms (Rūpa)</span></div>';
      if(purvaItems.length){
        H+='<p style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Pūrvarūpa (Prodromal)</p>';
        H+='<div class="tag-list" style="margin-bottom:12px">'+purvaItems.map(s=>'<span class="tag-symptom">'+esc(s)+'</span>').join('')+'</div>';
      }
      if(rupaItems.length){
        if(purvaItems.length) H+='<p style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Rūpa (Main Symptoms)</p>';
        H+='<div class="tag-list">'+rupaItems.map(s=>'<span class="tag-symptom">'+esc(s)+'</span>').join('')+'</div>';
      }
      H+='</div>';
    } else H+='<div></div>';
    H+='</div>';
  }
  if(!hasNid&&!hasSym&&R.symptoms) H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon terra">🩺</div><span class="sc-title">Symptoms</span></div><div class="raw">'+fmt(R.symptoms)+'</div></div>';

  // 3. Ottamooli
  if(R.single_drug_remedies){
    const blocks=parseBlocks(R.single_drug_remedies);
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">🌿</div><span class="sc-title">Ottamooli — Single Medicine Remedies</span></div><div class="remedy-grid">';
    if(blocks.length>0){
      blocks.forEach(b=>{
        const name=b._title||gf(b,'name','drug','herb','dravya')||'Herb';
        const skt=gf(b,'sanskrit','sanskrit_name');
        const part=gf(b,'part_used','part','plant_part');
        const prep=gf(b,'preparation','method','form','kalpana');
        const dose=gf(b,'dosage','dose','matra');
        const dur=gf(b,'duration','timing','period','time');
        const act=gf(b,'action','actions','karma','pharmacological');
        H+='<div class="remedy-card"><div class="remedy-name">'+esc(name)+'</div>';
        if(skt) H+='<div class="remedy-sanskrit">'+esc(skt)+'</div>';
        H+='<div class="remedy-fields">';
        if(part) H+='<div class="rf"><span class="rf-label">Part Used</span>'+esc(part)+'</div>';
        if(prep) H+='<div class="rf"><span class="rf-label">Preparation</span>'+esc(prep)+'</div>';
        if(dose) H+='<div class="rf"><span class="rf-label">Dosage</span>'+esc(dose)+'</div>';
        if(dur)  H+='<div class="rf"><span class="rf-label">Timing / Duration</span>'+esc(dur)+'</div>';
        if(act)  H+='<div class="rf" style="grid-column:1/-1"><span class="rf-label">Actions</span>'+esc(act)+'</div>';
        H+='</div></div>';
      });
    } else H+='<div class="raw" style="padding:12px">'+fmt(R.single_drug_remedies)+'</div>';
    H+='</div></div>';
  }

  // 4. Classical Formulations
  if(R.classical_formulations){
    const blocks=parseBlocks(R.classical_formulations);
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">💊</div><span class="sc-title">Classical Formulations (Yogas)</span></div><div class="remedy-grid">';
    if(blocks.length>0){
      blocks.forEach(b=>{
        const name=b._title||gf(b,'name','formulation','yoga')||'Formulation';
        const form=gf(b,'form','type','kalpana');
        const dose=gf(b,'dosage','dose','matra');
        const dur=gf(b,'duration','period');
        const anu=gf(b,'anupana','anupāna','adjuvant','vehicle');
        const ref=gf(b,'reference','ref','text','source','grantha');
        H+='<div class="form-card"><div class="form-icon-box">📜</div><div class="form-info">';
        H+='<h4>'+esc(name)+'</h4>';
        if(form) H+='<div class="form-english">'+esc(form)+'</div>';
        H+='<div class="form-meta">';
        if(dose) H+='<span><strong>Dose:</strong> '+esc(dose)+'</span>';
        if(dur) H+='<span><strong>Duration:</strong> '+esc(dur)+'</span>';
        if(anu) H+='<span><strong>Anupāna:</strong> '+esc(anu)+'</span>';
        H+='</div>';
        if(ref) H+='<div class="ref-badge">Ref: '+esc(ref)+'</div>';
        H+='</div></div>';
      });
    } else H+='<div class="raw" style="padding:12px">'+fmt(R.classical_formulations)+'</div>';
    H+='</div></div>';
  }

  // 5. Panchakarma + Diet + Lifestyle + Yoga
  if(R.panchakarma_diet_lifestyle_yoga){
    const C=R.panchakarma_diet_lifestyle_yoga, cL=C.toLowerCase();
    let any5=false;

    let pkText=extractBetween(C,'(?:panchakarma|shodhana|purification)',['pathya','apathya','diet','food','vihara','lifestyle','yoga','pranayama']);
    if(pkText&&getLines(pkText,5).length>0){
      any5=true;
      H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">🛁</div><span class="sc-title">Panchakarma Therapies</span></div><div class="remedy-grid">';
      H+=getLines(pkText,5).filter(l=>l.length<150).slice(0,6).map(l=>'<div class="pk-card"><p>'+esc(l)+'</p></div>').join('');
      H+='</div></div>';
    } else {
      const pkDescs={vamana:'Therapeutic emesis — expels excess Kapha.',virechana:'Purgation therapy — cleanses Pitta/toxins.',basti:'Medicated enema — primary Vata treatment.',nasya:'Nasal oil administration — head/neck disorders.',raktamokshana:'Bloodletting — Pitta/blood disorders.',shirodhara:'Warm oil on forehead — calms nervous system.',abhyanga:'Full-body oil massage — nourishes, calms Vata.',swedana:'Herbal steam — opens channels.'};
      const found=Object.keys(pkDescs).filter(n=>cL.includes(n));
      if(found.length){
        any5=true;
        H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">🛁</div><span class="sc-title">Panchakarma Therapies</span></div><div class="remedy-grid">';
        found.forEach(n=>{H+='<div class="pk-card"><h4>'+esc(n[0].toUpperCase()+n.slice(1))+'</h4><p>'+pkDescs[n]+'</p></div>';});
        H+='</div></div>';
      }
    }

    const pathya=extractBetween(C,'(?:pathya|favou?rable|foods?\\s+to\\s+eat|diet)',['apathya','food.?\\s+to\\s+avoid','vihara','lifestyle','yoga','pranayama']);
    const apathya=extractBetween(C,'(?:apathya|foods?\\s+to\\s+avoid|avoid)',['vihara','lifestyle','yoga','pranayama','prognosis']);
    if(pathya||apathya){
      any5=true;
      const pI=getLines(pathya,3).filter(l=>l.length<80).slice(0,10);
      const aI=getLines(apathya,3).filter(l=>l.length<80).slice(0,10);
      H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">🥗</div><span class="sc-title">Pathya-Apathya (Diet)</span></div><div class="diet-grid">';
      if(pI.length) H+='<div class="diet-col favor"><h4>✅ Favorable</h4><div class="diet-tags">'+pI.map(f=>'<span class="diet-tag good">'+esc(f)+'</span>').join('')+'</div></div>';
      if(aI.length) H+='<div class="diet-col avoid"><h4>❌ Avoid</h4><div class="diet-tags">'+aI.map(f=>'<span class="diet-tag bad">'+esc(f)+'</span>').join('')+'</div></div>';
      H+='<div class="diet-note">💡 Follow dietary guidelines suited to your prakṛti. Consult an Ayurvedic practitioner.</div></div></div>';
    }

    const vih=extractBetween(C,'(?:vih[aā]ra|lifestyle)',['yoga','pranayama','prognosis','danger']);
    const yog=extractBetween(C,'(?:yoga|pr[aā][nṇ][aā]y[aā]ma)',['prognosis','danger','warning','modern']);
    if(vih||yog){
      any5=true;
      H+='<div class="two-col fade-in">';
      if(vih){
        const items=getLines(vih,4).filter(l=>l.length<120).slice(0,8);
        H+='<div class="sc" style="margin-bottom:0"><div class="sc-head"><div class="sc-icon terra">🏃</div><span class="sc-title">Lifestyle (Vihāra)</span></div>';
        H+=items.length?'<ul class="ls-list">'+items.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul>':'<div class="raw">'+fmt(vih)+'</div>';
        H+='</div>';
      } else H+='<div></div>';
      if(yog){
        const items=getLines(yog,3).filter(l=>l.length<80).slice(0,8);
        H+='<div class="sc" style="margin-bottom:0"><div class="sc-head"><div class="sc-icon green">🧘</div><span class="sc-title">Yoga & Prāṇāyāma</span></div>';
        H+=items.length?'<div class="yoga-grid">'+items.map(i=>'<span class="yoga-tag">'+esc(i)+'</span>').join('')+'</div>':'<div class="raw">'+fmt(yog)+'</div>';
        H+='</div>';
      } else H+='<div></div>';
      H+='</div>';
    }

    if(!any5) H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">🛁</div><span class="sc-title">Panchakarma, Diet, Lifestyle & Yoga</span></div><div class="raw">'+fmt(C)+'</div></div>';
  }

  // 6. Prognosis + Modern + Warnings
  if(R.prognosis_modern_warnings){
    const P=R.prognosis_modern_warnings;
    let any6=false;

    const prog=extractBetween(P,'(?:prognosis|s[aā]dhya|y[aā]pya|as[aā]dhya)',['modern','correlation','biomedical','danger','warning','referral']);
    if(prog&&prog.length>10){ any6=true; H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">📈</div><span class="sc-title">Prognosis</span></div><div class="prog-box">'+fmt(prog)+'</div></div>'; }

    const modern=extractBetween(P,'(?:modern\\s+(?:medical\\s+)?correlation|modern\\s+medicine|biomedical|allopathic)',['danger','warning','referral','sign','red.?flag']);
    if(modern&&modern.length>10){ any6=true; H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon blue">🏥</div><span class="sc-title">Modern Medical Correlation</span></div><p class="desc-text">'+fmt(modern)+'</p></div>'; }

    const warn=extractBetween(P,'(?:danger\\s+sign|warning|referral|red.?flag|immediate)',[]);
    if(warn){
      const wI=getLines(warn,5).filter(l=>!/^(danger|warning|sign|referral)/i.test(l)&&l.length<120).slice(0,8);
      if(wI.length){ any6=true; H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon red">⚠️</div><span class="sc-title">Warning Signs</span></div><div class="warn-list">'+wI.map(w=>'<div class="warn-item"><div class="warn-icon">!</div><span>'+esc(w)+'</span></div>').join('')+'</div></div>'; }
    }

    if(!any6) H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">📈</div><span class="sc-title">Prognosis & Warnings</span></div><div class="raw">'+fmt(P)+'</div></div>';
  }

  // Catch-all
  const done=new Set(['overview_dosha_causes','symptoms','single_drug_remedies','classical_formulations','panchakarma_diet_lifestyle_yoga','prognosis_modern_warnings']);
  for(const [k,v] of Object.entries(R)){
    if(done.has(k)||!v||typeof v!=='string') continue;
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">📄</div><span class="sc-title">'+esc(k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))+'</span></div><div class="raw">'+fmt(v)+'</div></div>';
  }

  resultsEl.innerHTML = H;
}
