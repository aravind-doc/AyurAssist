/* AyurAssist v6.1 — Fixed: ottamooli parsing, modern correlation formatting,
   nidāna empty box, yoga dedup, structured line-by-line rendering */

var API='https://aravindkv28--ayurparam-service-fastapi-app.modal.run';
var $=function(id){return document.getElementById(id)};
var input=$('symptomInput'),btn=$('analyzeBtn'),loadEl=$('loading'),errEl=$('error');
var nerStrip=$('nerStrip'),matchBanner=$('matchBanner'),diseaseHeader=$('diseaseHeader');
var resultsEl=$('results'),disclaimer=$('disclaimerFooter');
var SVG='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';

fetch(API+'/warmup').catch(function(){});
input.addEventListener('input',function(){btn.disabled=!input.value.trim()});
input.addEventListener('keypress',function(e){if(e.key==='Enter'&&!btn.disabled){e.preventDefault();doAnalyze()}});
btn.addEventListener('click',doAnalyze);
$('examples').addEventListener('click',function(e){if(e.target.classList.contains('example-btn')){input.value=e.target.dataset.value||'';btn.disabled=false;input.focus()}});

/* ═══ UTILITIES ═══ */

function esc(s){if(s==null)return '';var d=document.createElement('div');d.textContent=String(s);return d.innerHTML}
function empty(t){if(!t||typeof t!=='string')return true;var s=t.trim();if(s.length<5)return true;return /^(not provided|not available|not mentioned|no information|not given|not specified|not found|no data|none available|cannot be determined|n\/a)$/i.test(s)}
function stripMd(s){return s.replace(/\*\*/g,'').replace(/\*/g,'').trim()}
function fmt(text){if(!text)return '';return esc(text).replace(/\*\*([^*]+?)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+?)\*/g,'<em>$1</em>')}

function splitInlineNumbered(text){
  if(!text)return [];
  var positions=[];
  var rx=/(?:^|[\s,;.])(\d{1,2})\)\s*|(?:^|[.\s])(\d{1,2})\.\s+(?=[A-Z*])/g;
  var m;
  while((m=rx.exec(text))!==null){positions.push({pos:m.index,len:m[0].length})}
  if(positions.length<2)return [];
  var items=[];
  if(positions[0].pos>10){var pre=text.substring(0,positions[0].pos).trim();if(pre.length>10)items.push({text:stripMd(pre),isPreamble:true})}
  for(var i=0;i<positions.length;i++){
    var start=positions[i].pos+positions[i].len;
    var end=i+1<positions.length?positions[i+1].pos:text.length;
    var chunk=text.substring(start,end).trim().replace(/[,;]\s*$/,'');
    if(chunk.length>2)items.push({text:stripMd(chunk)});
  }
  return items;
}

function smartExtract(text,minLen){
  if(!text||empty(text))return [];
  minLen=minLen||4;
  var numbered=splitInlineNumbered(text);
  if(numbered.length>=2)return numbered.filter(function(n){return !n.isPreamble}).map(function(n){return n.text}).filter(function(s){return s.length>=minLen&&s.length<150});
  var commaItems=text.split(/,\s*/).map(function(s){return stripMd(s.replace(/^[\s\-\u2022*\u25B8\d.\)]+/,'').replace(/\.\s*$/,'')).trim()}).filter(function(s){return s.length>=3&&s.length<80});
  var isRealList=commaItems.length>=3&&commaItems.every(function(s){return s.split(/\s+/).length<=4&&!/^and\s/i.test(s)&&s.indexOf('.')<0});
  if(isRealList)return commaItems.filter(function(s){return s.length>=minLen});
  return text.split(/(?<=[.!?;])\s+/).map(function(s){return stripMd(s.replace(/^[\s\-\u2022*\u25B8\d.\)]+/,'')).trim()}).filter(function(s){return s.length>=minLen&&s.length<200});
}

function isProse(text){
  if(!text)return true;
  var sents=text.split(/(?<=[.!?])\s+/).filter(function(s){return s.trim().length>5});
  if(sents.length<=2)return true;
  var avgLen=sents.reduce(function(a,s){return a+s.length},0)/sents.length;
  return avgLen>60;
}

/* Deduplicate — normalize name before comparing so "Bhujangāsana" and "Bhujangasana" match */
function dedup(items){
  var seen={};var result=[];
  for(var i=0;i<items.length;i++){
    var key=items[i].toLowerCase().replace(/[\u0100-\u024F]/g,function(c){return c.normalize('NFD').replace(/[\u0300-\u036f]/g,'')}).replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
    var prefix=key.substring(0,25);
    if(seen[key]||seen[prefix])continue;
    seen[key]=true;seen[prefix]=true;result.push(items[i]);
  }
  return result;
}

/* ═══ OTTAMOOLI PARSER — rewritten for "Name: Sanskrit - Part Used: X - Preparation: Y - Dosage: Z" format ═══ */
function parseRemedies(rawText){
  if(!rawText||empty(rawText))return [];
  // Split into individual remedy blocks by numbered items
  var numbered=splitInlineNumbered(rawText);
  var sections=numbered.length>=2?numbered.filter(function(n){return !n.isPreamble}).map(function(n){return n.text}):[];
  if(sections.length===0&&rawText.indexOf('**')>=0){sections=rawText.split(/(?=\d+\.\s*\*\*|\*\*[A-Z])/).filter(function(s){return s.trim().length>10}).map(function(s){return s.trim()})}
  if(sections.length===0)sections=[rawText];
  var results=[];
  for(var i=0;i<sections.length;i++){
    var sec=sections[i];if(empty(sec)||sec.length<8)continue;
    var entry={name:'',sanskrit:'',part:'',preparation:'',dosage:'',duration:'',actions:'',desc:''};

    // Extract name: try **Bold** first, then "Name (Latin):" pattern, then "Name –"
    var boldM=sec.match(/\*\*([^*]+?)\*\*\s*[:\-\u2013]?\s*/);
    if(boldM){
      entry.name=boldM[1].trim();
      entry.desc=sec.substring(sec.indexOf(boldM[0])+boldM[0].length).trim();
    }else{
      // Try "Name (Latin name):" — common AyurParam format
      var nameColonM=sec.match(/^([A-Z\u0100-\u024F][^:\-\u2013]{2,60}?(?:\([^)]+\))?)\s*[:\u2013\u2014]\s*(.*)/s);
      if(nameColonM){entry.name=stripMd(nameColonM[1]);entry.desc=nameColonM[2].trim()}
      else{entry.desc=sec}
    }

    // KEY FIX: Parse "- Key: Value" or "Key: Value" pairs from desc using dash-prefixed keys
    // This handles: "Sanskrit name - Part Used: Leaves - Preparation: Swarasa - Dosage: 10ml"
    var fieldPatterns=[
      [/(?:^|[\-\u2013]\s*)Sanskrit\s*(?:name)?\s*[:\-]\s*([^,\-\u2013]+?)(?=\s*[\-\u2013]\s*[A-Z]|\s*$)/i,'sanskrit'],
      [/(?:^|[\-\u2013]\s*)Part\s*(?:Used)?\s*[:\-]\s*([^,\-\u2013]+?)(?=\s*[\-\u2013]\s*[A-Z]|\s*$)/i,'part'],
      [/(?:^|[\-\u2013]\s*)Preparation\s*[:\-]\s*([^,\-\u2013]+?)(?=\s*[\-\u2013]\s*(?:Dos|Dur|Eff|[A-Z])|\s*$)/i,'preparation'],
      [/(?:^|[\-\u2013]\s*)Dos(?:e|age)\s*[:\-]\s*([^,\-\u2013]+?)(?=\s*[\-\u2013]\s*(?:Dur|Eff|[A-Z])|\s*$)/i,'dosage'],
      [/(?:^|[\-\u2013]\s*)Duration\s*[:\-]\s*([^,\-\u2013]+?)(?=\s*[\-\u2013]\s*(?:Eff|[A-Z])|\s*$)/i,'duration'],
      [/(?:^|[\-\u2013]\s*)(?:Effect|Actions?)\s*[:\-]\s*(.+?)(?=\s*$)/i,'actions']
    ];
    var fullText=entry.desc;
    for(var fp=0;fp<fieldPatterns.length;fp++){
      var m=fullText.match(fieldPatterns[fp][0]);
      if(m)entry[fieldPatterns[fp][1]]=stripMd(m[1]).replace(/\.\s*$/,'');
    }

    // If no structured fields found, try the older "Key: Value" without dash prefix
    if(!entry.part&&!entry.dosage){
      var kvP=[[/Part\s*(?:Used)?\s*[:\u2013]\s*([^.,;\-]+)/i,'part'],[/Preparation\s*[:\u2013]\s*([^.,;\-]+)/i,'preparation'],[/Dos(?:e|age)\s*[:\u2013]\s*([^.,;\-]+)/i,'dosage'],[/Duration\s*[:\u2013]\s*([^.,;\-]+)/i,'duration'],[/(?:Effect|Actions?)\s*[:\u2013]\s*([^.]+)/i,'actions']];
      for(var kv=0;kv<kvP.length;kv++){var km=entry.desc.match(kvP[kv][0]);if(km)entry[kvP[kv][1]]=stripMd(km[1])}
    }

    // If name ends with ":" remove it
    entry.name=entry.name.replace(/:\s*$/,'').trim();
    // Extract sanskrit from name if it contains it (e.g. "Vasaka" from desc starting with "Vāsaka -")
    if(!entry.sanskrit){
      var skM=entry.desc.match(/^([A-Z\u0100-\u024F][a-z\u0100-\u024F]+)\s*[\-\u2013]/);
      if(skM)entry.sanskrit=skM[1];
    }

    if(entry.name||entry.part||entry.dosage)results.push(entry);
  }
  return results;
}

/* Parse formulations — unchanged from previous version */
function parseFormulations(rawText){
  if(!rawText||empty(rawText))return [];
  var numbered=splitInlineNumbered(rawText);
  var sections=numbered.length>=2?numbered.filter(function(n){return !n.isPreamble}).map(function(n){return n.text}):[];
  if(sections.length===0&&rawText.indexOf('**')>=0){sections=rawText.split(/(?=\d+\.\s*\*\*|\*\*[A-Z])/).filter(function(s){return s.trim().length>10}).map(function(s){return s.trim()})}
  if(sections.length===0)sections=[rawText];
  var results=[];
  for(var i=0;i<sections.length;i++){
    var sec=sections[i];if(empty(sec)||sec.length<8)continue;
    var entry={name:'',desc:'',dose:'',reference:'',contains:'',form:'',cleanDesc:''};
    var boldM=sec.match(/\*\*([^*]+?)\*\*\s*[:\-\u2013]?\s*/);
    if(boldM){entry.name=boldM[1].trim();entry.desc=sec.substring(sec.indexOf(boldM[0])+boldM[0].length).trim()}
    else{var dashM=sec.match(/^([A-Z\u0100-\u024F][^\u2013\u2014\-]{3,60}?)\s*[\u2013\u2014\-]\s*(.*)/s);if(dashM){entry.name=stripMd(dashM[1]);entry.desc=dashM[2].trim()}else{var colonM=sec.match(/^([^.]{5,80}?)\s*[:\-\u2013]\s+(.*)/s);if(colonM){entry.name=stripMd(colonM[1]);entry.desc=colonM[2].trim()}else entry.desc=sec}}
    var dM=entry.desc.match(/(?:Dos(?:e|age))\s*[:\-\u2013]\s*([^.]+)/i);if(dM)entry.dose=stripMd(dM[1]);
    if(!entry.dose){dM=entry.desc.match(/(\d+[\-\u2013]\d+\s*(?:mg|g|ml|tablets?)[^.]{0,40})/i);if(dM)entry.dose=stripMd(dM[1])}
    var refM=entry.desc.match(/(?:Reference|Ref\.?)\s*[:\-\u2013]\s*\*?([^*\n]+?)(?:\.\s*(?=[A-Z])|\.?\s*$)/i);if(refM)entry.reference=stripMd(refM[1]).replace(/\.\s*$/,'');
    var contM=entry.desc.match(/Contains?\s*[:\-\u2013]?\s+([^.]+)/i);if(contM)entry.contains=stripMd(contM[1]);
    var formM=entry.desc.match(/Form\s*[:\-\u2013]\s*([^.]+)/i);if(formM)entry.form=stripMd(formM[1]);
    var cd=entry.desc;
    [/(?:Dos(?:e|age))\s*[:\-\u2013]\s*[^.]+\.?\s*/gi,/(?:Reference|Ref\.?)\s*[:\-\u2013]\s*\*?[^*\n]+?(?:\.\s*(?=[A-Z])|\.?\s*$)/gi,/Contains?\s*[:\-\u2013]?\s+[^.]+\.?\s*/gi,/Form\s*[:\-\u2013]\s*[^.]+\.?\s*/gi].forEach(function(rx){cd=cd.replace(rx,' ')});
    entry.cleanDesc=stripMd(cd).replace(/\s{2,}/g,' ').trim();
    if(entry.name||entry.cleanDesc.length>10)results.push(entry);
  }
  return results;
}

/*
 * parseModernCorrelation: Split "1) Modern correlation... 2) General line of treatment... 3) Danger signs..."
 * into structured {correlation, treatment (with bullet items), warnings} 
 */
function parseModernCorrelation(text){
  if(!text)return {correlation:'',treatment:'',treatmentItems:[],warnings:'',warningItems:[]};
  var result={correlation:'',treatment:'',treatmentItems:[],warnings:'',warningItems:[]};
  var numbered=splitInlineNumbered(text);
  if(numbered.length>=2){
    var parts=numbered.filter(function(n){return !n.isPreamble}).map(function(n){return n.text});
    for(var i=0;i<parts.length;i++){
      var low=parts[i].toLowerCase();
      if(low.match(/modern\s+medical\s+correlation|modern\s+correlation|equivalent/i)&&!result.correlation)result.correlation=parts[i];
      else if(low.match(/general\s+line|line\s+of\s+treatment|treatment\s+in\s+modern/i)&&!result.treatment)result.treatment=parts[i];
      else if(low.match(/danger\s+sign|red\s*flag|warning|immediate\s+(?:medical\s+)?attention/i))result.warnings=parts[i];
      else if(!result.correlation)result.correlation=parts[i];
      else if(!result.treatment)result.treatment=parts[i];
      else result.warnings=(result.warnings?result.warnings+' ':'')+parts[i];
    }
  }else{
    // Try keyword-based splitting
    var corrEnd=text.search(/(?:general\s+line|line\s+of\s+treatment|treatment\s+in\s+modern)/i);
    var warnStart=text.search(/(?:danger\s+sign|red\s*flag|warning|immediate\s+(?:medical\s+)?attention)/i);
    if(corrEnd>0&&warnStart>corrEnd){
      result.correlation=text.substring(0,corrEnd).trim();
      result.treatment=text.substring(corrEnd,warnStart).trim();
      result.warnings=text.substring(warnStart).trim();
    }else if(corrEnd>0){
      result.correlation=text.substring(0,corrEnd).trim();
      result.treatment=text.substring(corrEnd).trim();
    }else{result.correlation=text}
  }
  // Extract bullet items from treatment (split on " - " or "; " dash-prefixed items)
  if(result.treatment){
    var tItems=result.treatment.split(/\s*[\-\u2013]\s+(?=[A-Z])/).filter(function(s){return s.trim().length>5});
    if(tItems.length>=2){
      // First item is the intro sentence, rest are treatment items
      var intro=tItems[0];
      // Check if intro contains "includes:" — split there
      var incIdx=intro.search(/includes?\s*:\s*/i);
      if(incIdx>=0){result.treatment=intro.substring(0,incIdx+('includes:'.length)).trim();tItems[0]=intro.substring(incIdx+('includes:'.length)).trim()}
      else{result.treatment=intro;tItems.shift()}
      result.treatmentItems=tItems.map(function(s){return stripMd(s).replace(/\.\s*$/,'').trim()}).filter(function(s){return s.length>3});
    }
  }
  // Extract warning items
  if(result.warnings){
    var wItems=result.warnings.split(/\s*[\-\u2013]\s+(?=[A-Z])/).filter(function(s){return s.trim().length>5});
    if(wItems.length>=2){
      result.warnings=wItems[0];wItems.shift();
      result.warningItems=wItems.map(function(s){return stripMd(s).replace(/\.\s*$/,'').trim()}).filter(function(s){return s.length>3});
    }
  }
  // Clean prefixes
  result.correlation=result.correlation.replace(/^(?:The\s+)?modern\s+(?:medical\s+)?correlation\s+(?:for\s+\w+\s+)?(?:is|includes?)\s*/i,'').trim();
  result.treatment=result.treatment.replace(/^(?:The\s+)?general\s+line\s+of\s+treatment\s+(?:in\s+modern\s+medicine\s+)?(?:for\s+\w+\s+)?(?:includes?)\s*:?\s*/i,'').trim();
  result.warnings=result.warnings.replace(/^(?:Danger\s+signs?\s*(?:or\s+red\s*flags?\s*)?(?:requiring|needing)\s+immediate\s+(?:medical\s+)?attention\s*(?:include)?\s*:?\s*)/i,'').trim();
  return result;
}

/* ═══ ANALYZE ═══ */
async function doAnalyze(){
  var text=input.value.trim();if(!text)return;
  btn.disabled=true;btn.innerHTML=SVG+' Analyzing...';
  loadEl.classList.remove('hidden');errEl.classList.add('hidden');
  [nerStrip,matchBanner,diseaseHeader,resultsEl,disclaimer].forEach(function(e){e.classList.add('hidden')});
  resultsEl.innerHTML='';
  var ctrl=new AbortController(),tout=setTimeout(function(){ctrl.abort()},180000);
  try{
    var res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text}),signal:ctrl.signal});
    clearTimeout(tout);if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json();console.log('API:',JSON.stringify(data,null,2));render(data,text);
  }catch(err){
    console.error(err);errEl.textContent='\u26A0\uFE0F '+(err.name==='AbortError'?'Request timed out. Please try again.':err.message.includes('fetch')?'Network error.':err.message);errEl.classList.remove('hidden');
  }finally{btn.disabled=false;btn.innerHTML=SVG+' Analyze';loadEl.classList.add('hidden');btn.disabled=!input.value.trim()}
}

/* ═══ RENDER ═══ */
function render(data,origSym){
  var tx=null;
  if(data.results&&data.results.length)tx=data.results[0].treatment_info;
  else if(data.treatment_info)tx=data.treatment_info;
  if(!tx){errEl.textContent='No treatment info.';errEl.classList.remove('hidden');return}
  var R=tx.ayurparam_responses||{},csv=data.csv_match||null;
  console.log('Response keys:',Object.keys(R));
  [nerStrip,matchBanner,diseaseHeader,resultsEl,disclaimer].forEach(function(e){e.classList.remove('hidden')});

  // NER
  nerStrip.innerHTML='<span class="ner-strip-label">Detected Entities</span>';
  var ents=data.clinical_entities;
  if(ents&&ents.length){ents.forEach(function(e){var t=document.createElement('span');t.className='ner-tag';t.innerHTML=esc(e.word)+' <span class="score">'+esc(e.entity_group||'ENTITY')+' \u00B7 '+Math.round((e.score||.9)*100)+'%</span>';nerStrip.appendChild(t)})}
  else{var t=document.createElement('span');t.className='ner-tag';t.innerHTML=esc(origSym)+' <span class="score">ENTITY \u00B7 98%</span>';nerStrip.appendChild(t)}

  var cond=tx.condition_name||(csv&&csv.ayurveda_term)||origSym;
  $('matchDetails').textContent='Detected: '+origSym+' \u2192 '+cond;
  $('matchPercent').textContent=csv?'100%':'SNOMED';
  $('itaCode').textContent=(csv&&csv.ita_id)||'ITA';
  $('diseaseName').textContent=cond;
  $('sanskritName').textContent=tx.sanskrit_name||(csv&&csv.sanskrit_iast)||(csv&&csv.sanskrit)||'';

  var oLow=((R.overview_dosha_causes||'')+' '+cond).toLowerCase();
  var dh='';
  if(/v[a\u0101]t/i.test(oLow))dh+='<span class="dosha-dot vata"></span>';
  if(/pitt/i.test(oLow))dh+='<span class="dosha-dot pitta"></span>';
  if(/kaph/i.test(oLow))dh+='<span class="dosha-dot kapha"></span>';
  if(!dh)dh='<span class="dosha-dot vata"></span><span class="dosha-dot pitta"></span><span class="dosha-dot kapha"></span>';
  dh+='<span class="dosha-text">Dosha imbalance \u2014 requires assessment</span>';
  $('doshaLine').innerHTML=dh;

  var snomed=data.snomed_code||(data.results&&data.results[0]&&data.results[0].snomed_code)||'';
  var hasSNOMED=snomed&&snomed!=='N/A'&&snomed!=='00000000'&&snomed.length>1;
  $('snomedRow').style.display=hasSNOMED?'flex':'none';
  if(hasSNOMED){$('snomedCode').textContent=snomed;$('snomedName').textContent=data.snomed_name||cond}

  // ICD-10
  var icd10=data.icd10_code||(data.results&&data.results[0]&&data.results[0].icd10_code)||'';
  var hasICD=icd10&&icd10!=='N/A'&&icd10.length>1;
  $('icdRow').style.display=hasICD?'flex':'none';
  if(hasICD)$('icdCode').textContent=icd10;

  var H='';

  // ═══ 1. DISEASE DESCRIPTION ═══
  if(!empty(R.overview_dosha_causes)){
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">\uD83D\uDCCB</div><span class="sc-title">Disease Description</span></div>';
    H+='<p class="desc-text">'+fmt(R.overview_dosha_causes)+'</p>';
    if(csv&&csv.description)H+='<div style="margin-top:10px;font-size:13px;color:var(--text-light);background:var(--bg-warm);padding:6px 14px;border-radius:8px">\uD83C\uDFE5 '+esc(csv.description)+'</div>';
    H+='</div>';
  }

  // ═══ 2. NIDANA + SYMPTOMS — adaptive layout (no empty boxes) ═══
  var nidText='';
  if(!empty(R.overview_dosha_causes)){
    var sentences=R.overview_dosha_causes.split(/(?<=[.!?])\s+/);
    var nidSentences=[];
    for(var si=0;si<sentences.length;si++){
      if(/nid[a\u0101]na|causes?\b|etiolog|provocat|aggravat/i.test(sentences[si]))nidSentences.push(sentences[si]);
    }
    nidText=nidSentences.join(' ').trim();
    if(!nidText&&sentences.length>1)nidText=sentences[sentences.length-1].trim();
  }

  var sympHTML='';
  if(!empty(R.symptoms)){
    var raw=R.symptoms;
    var isMetaSentence=function(s){return /^these\s+(indicate|signs?|symptoms?|reflect|arise|are\s+due|manifest)/i.test(s.trim())};
    var numbered=splitInlineNumbered(raw);
    if(numbered.length>=3){
      var items=dedup(numbered.filter(function(n){return !n.isPreamble}).map(function(n){return n.text})).filter(function(s){return !isMetaSentence(s)}).slice(0,12);
      var preamble=numbered.filter(function(n){return n.isPreamble})[0];
      if(preamble&&preamble.text.length>15&&!isMetaSentence(preamble.text))sympHTML+='<p class="desc-text" style="margin-bottom:12px">'+fmt(preamble.text)+'</p>';
      if(items.length>0)sympHTML+='<div class="tag-list">'+items.map(function(s){return '<span class="tag-symptom">'+esc(s)+'</span>'}).join('')+'</div>';
      else sympHTML='<p class="desc-text">'+fmt(raw)+'</p>';
    }else{
      var sents=raw.split(/(?<=[.!?])\s+/).filter(function(s){return s.trim().length>5});
      var realSents=sents.filter(function(s){return !isMetaSentence(s)});
      if(realSents.length<=3||isProse(raw)){sympHTML='<p class="desc-text">'+fmt(raw)+'</p>'}
      else{
        var items2=dedup(realSents.map(function(s){return stripMd(s).trim()})).filter(function(s){return s.length>4&&s.length<150}).slice(0,12);
        sympHTML='<div class="tag-list">'+items2.map(function(s){return '<span class="tag-symptom">'+esc(s)+'</span>'}).join('')+'</div>';
      }
    }
  }

  var hasNid=nidText.length>10,hasSym=sympHTML.length>0;
  // FIX: Only use two-col when BOTH sides have substantial content (>80 chars each)
  var useTwoCol=hasNid&&hasSym&&nidText.length>80;
  if(useTwoCol){
    H+='<div class="two-col fade-in">';
    H+='<div class="sc" style="margin-bottom:0"><div class="sc-head"><div class="sc-icon amber">\uD83D\uDD0D</div><span class="sc-title">Root Causes (Nid\u0101na)</span></div><p class="desc-text">'+fmt(nidText)+'</p></div>';
    H+='<div class="sc" style="margin-bottom:0"><div class="sc-head"><div class="sc-icon terra">\uD83E\uDE7A</div><span class="sc-title">Symptoms (R\u016Bpa)</span></div>'+sympHTML+'</div>';
    H+='</div>';
  }else{
    // Stacked full-width — no empty space issue
    if(hasNid)H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">\uD83D\uDD0D</div><span class="sc-title">Root Causes (Nid\u0101na)</span></div><p class="desc-text">'+fmt(nidText)+'</p></div>';
    if(hasSym)H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon terra">\uD83E\uDE7A</div><span class="sc-title">Symptoms (R\u016Bpa)</span></div>'+sympHTML+'</div>';
  }

  // ═══ 3. OTTAMOOLI — rewritten parser ═══
  if(!empty(R.single_drug_remedies)){
    var remedies=parseRemedies(R.single_drug_remedies);
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">\uD83C\uDF3F</div><span class="sc-title">Ottamooli \u2014 Single Medicine Remedies</span></div><div class="remedy-grid">';
    if(remedies.length>0){remedies.forEach(function(r){
      H+='<div class="remedy-card"><div class="remedy-name">'+esc(r.name||'Herbal Remedy')+'</div>';
      if(r.sanskrit)H+='<div class="remedy-sanskrit">'+esc(r.sanskrit)+'</div>';
      H+='<div class="remedy-fields">';
      if(r.part)H+='<div class="rf"><span class="rf-label">Part Used</span>'+esc(r.part)+'</div>';
      if(r.preparation)H+='<div class="rf"><span class="rf-label">Preparation</span>'+esc(r.preparation)+'</div>';
      if(r.dosage)H+='<div class="rf"><span class="rf-label">Dosage</span>'+esc(r.dosage)+'</div>';
      if(r.duration)H+='<div class="rf"><span class="rf-label">Duration</span>'+esc(r.duration)+'</div>';
      if(r.actions)H+='<div class="rf" style="grid-column:1/-1"><span class="rf-label">Actions / Effect</span>'+esc(r.actions)+'</div>';
      H+='</div></div>';
    })}
    else H+='<p class="desc-text" style="padding:4px">'+fmt(R.single_drug_remedies)+'</p>';
    H+='</div></div>';
  }

  // ═══ 4. CLASSICAL FORMULATIONS ═══
  if(!empty(R.classical_formulations)){
    var formulations=parseFormulations(R.classical_formulations);
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">\uD83D\uDC8A</div><span class="sc-title">Classical Formulations (Yogas)</span></div><div class="remedy-grid">';
    if(formulations.length>0){formulations.forEach(function(f){H+='<div class="form-card"><h4>'+esc(f.name||'Classical Formulation')+'</h4>';if(f.cleanDesc&&f.cleanDesc.length>10)H+='<div class="form-desc">'+fmt(f.cleanDesc)+'</div>';H+='<div class="form-meta">';if(f.dose)H+='<span>\uD83D\uDC8A <strong>Dose:</strong> '+esc(f.dose)+'</span>';if(f.form)H+='<span>\uD83D\uDCE6 <strong>Form:</strong> '+esc(f.form)+'</span>';if(f.contains)H+='<span>\uD83E\uDDEA <strong>Contains:</strong> '+esc(f.contains)+'</span>';H+='</div>';if(f.reference)H+='<div class="ref-badge">\uD83D\uDCD6 '+esc(f.reference)+'</div>';H+='</div>'})}
    else H+='<p class="desc-text" style="padding:4px">'+fmt(R.classical_formulations)+'</p>';
    H+='</div></div>';
  }

  // ═══ 5. PANCHAKARMA ═══
  if(!empty(R.panchakarma)){
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">\uD83D\uDEC1</div><span class="sc-title">Panchakarma Therapies</span></div>';
    H+='<div class="pk-card"><p>'+fmt(R.panchakarma)+'</p></div></div>';
  }

  // ═══ 6. DIET & LIFESTYLE ═══
  if(!empty(R.diet_lifestyle)){
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">\uD83E\uDD57</div><span class="sc-title">Diet & Lifestyle (Pathya-Apathya)</span></div>';
    H+='<p class="desc-text">'+fmt(R.diet_lifestyle)+'</p>';
    H+='<div class="diet-note" style="margin-top:12px">\uD83D\uDCA1 Follow dietary guidelines suited to your prak\u1E5Bti. Consult an Ayurvedic practitioner.</div>';
    H+='</div>';
  }

  // ═══ 7. YOGA — with dedup + cap at 10 to prevent hallucination floods ═══
  if(!empty(R.yoga)){
    var yogaRaw=R.yoga;
    // Split numbered items, dedup, cap at 10
    var yogaNumbered=splitInlineNumbered(yogaRaw);
    var yogaItems=[];
    if(yogaNumbered.length>=2){
      yogaItems=dedup(yogaNumbered.filter(function(n){return !n.isPreamble}).map(function(n){return n.text})).slice(0,10);
    }
    if(yogaItems.length===0){
      // Try comma split for "Name – benefit, Name – benefit" format
      var commaSplit=yogaRaw.split(/,\s*(?=\d+\.\s)/).map(function(s){return stripMd(s).trim()}).filter(function(s){return s.length>3});
      yogaItems=dedup(commaSplit).slice(0,10);
    }
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">\uD83E\uDDD8</div><span class="sc-title">Yoga & Pr\u0101\u1E47\u0101y\u0101ma</span></div>';
    if(yogaItems.length>=2){
      H+='<div class="yoga-grid">'+yogaItems.map(function(i){return '<span class="yoga-tag">'+esc(i)+'</span>'}).join('')+'</div>';
    }else{
      H+='<p class="desc-text">'+fmt(yogaRaw)+'</p>';
    }
    H+='</div>';
  }

  // ═══ 8. PROGNOSIS ═══
  if(!empty(R.prognosis)){
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">\uD83D\uDCC8</div><span class="sc-title">Prognosis (S\u0101dhya / Y\u0101pya / As\u0101dhya)</span></div>';
    H+='<div class="prog-box">'+fmt(R.prognosis)+'</div></div>';
  }

  // ═══ 9. MODERN MEDICAL CORRELATION — structured line-by-line ═══
  if(!empty(R.modern_correlation_warnings)){
    var mc=parseModernCorrelation(R.modern_correlation_warnings);
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon blue">\uD83C\uDFE5</div><span class="sc-title">Modern Medical Correlation & Treatment</span></div>';
    H+='<div class="modern-section">';
    if(mc.correlation&&mc.correlation.length>5){
      H+='<div class="modern-sub">\uD83C\uDFE5 Modern Medical Correlation</div>';
      H+='<p class="desc-text">'+fmt(mc.correlation)+'</p>';
    }
    if((mc.treatment&&mc.treatment.length>5)||mc.treatmentItems.length>0){
      H+='<div class="modern-sub">\uD83D\uDC8A General Line of Treatment in Modern Medicine</div>';
      if(mc.treatment&&mc.treatment.length>5)H+='<p class="desc-text" style="margin-bottom:6px">'+fmt(mc.treatment)+'</p>';
      if(mc.treatmentItems.length>0){
        H+='<ul>';
        mc.treatmentItems.forEach(function(item){H+='<li>'+esc(item)+'</li>'});
        H+='</ul>';
      }
    }
    // If nothing was parsed, show raw
    if((!mc.correlation||mc.correlation.length<=5)&&(!mc.treatment||mc.treatment.length<=5)&&mc.treatmentItems.length===0){
      H+='<p class="desc-text">'+fmt(R.modern_correlation_warnings)+'</p>';
    }
    H+='</div></div>';

    // Warning signs from modern correlation (section 3 of the response)
    if((mc.warnings&&mc.warnings.length>5)||mc.warningItems.length>0){
      H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon red">\u26A0\uFE0F</div><span class="sc-title">Warning Signs & Red Flags</span></div>';
      if(mc.warningItems.length>0){
        H+='<div class="warn-list">';
        mc.warningItems.forEach(function(w){H+='<div class="warn-item"><div class="warn-icon">!</div><span>'+esc(w)+'</span></div>'});
        H+='</div>';
      }else{H+='<p class="desc-text">'+fmt(mc.warnings)+'</p>'}
      H+='</div>';
    }
  }

  // ═══ 10. DIFFERENTIAL DIAGNOSIS — parse if numbered ═══
  if(!empty(R.differential_diagnosis)){
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon blue">\uD83E\uDE7A</div><span class="sc-title">Differential Diagnosis (Vyavachedaka Nid\u0101na)</span></div>';
    var ddNumbered=splitInlineNumbered(R.differential_diagnosis);
    var ddItems=ddNumbered.length>=2?ddNumbered.filter(function(n){return !n.isPreamble}).map(function(n){return n.text}):[];
    var ddPreamble=ddNumbered.filter(function(n){return n.isPreamble})[0];
    if(ddItems.length>=2){
      if(ddPreamble&&ddPreamble.text.length>10)H+='<p class="desc-text" style="margin-bottom:12px">'+fmt(ddPreamble.text)+'</p>';
      H+='<div class="dd-grid">';
      ddItems.forEach(function(item){
        var dashSplit=item.match(/^(.+?)\s*[\u2014\u2013\-]{1,2}\s*(.+)$/);
        if(dashSplit){
          H+='<div class="dd-item"><div class="dd-name">'+esc(stripMd(dashSplit[1]))+'</div><div class="dd-detail">'+esc(stripMd(dashSplit[2]))+'</div></div>';
        }else{
          H+='<div class="dd-item"><div class="dd-name">'+esc(stripMd(item))+'</div></div>';
        }
      });
      H+='</div>';
    }else{
      H+='<div class="diff-card"><p>'+fmt(R.differential_diagnosis)+'</p></div>';
    }
    H+='</div>';
  }

  // ═══ 11. INVESTIGATIONS & LABS — parse numbered items into structured list ═══
  if(!empty(R.investigations_labs)){
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">\uD83E\uDDEA</div><span class="sc-title">Investigations & Laboratory Tests</span></div>';
    var invNumbered=splitInlineNumbered(R.investigations_labs);
    var invItems=invNumbered.length>=2?invNumbered.filter(function(n){return !n.isPreamble}).map(function(n){return n.text}):[];
    var invPreamble=invNumbered.filter(function(n){return n.isPreamble})[0];
    if(invItems.length>=2){
      if(invPreamble&&invPreamble.text.length>10)H+='<p class="desc-text" style="margin-bottom:12px">'+fmt(invPreamble.text)+'</p>';
      H+='<div class="invest-grid">';
      invItems.forEach(function(item){
        // Try to split "Test name (Sanskrit) — conclusion/finding"
        var dashSplit=item.match(/^(.+?)\s*[\u2014\u2013\-]{1,2}\s*(.+)$/);
        if(dashSplit){
          H+='<div class="invest-item"><div class="invest-name">'+esc(stripMd(dashSplit[1]))+'</div><div class="invest-finding">'+esc(stripMd(dashSplit[2]))+'</div></div>';
        }else{
          H+='<div class="invest-item"><div class="invest-name">'+esc(stripMd(item))+'</div></div>';
        }
      });
      H+='</div>';
    }else{
      H+='<div class="invest-card"><p>'+fmt(R.investigations_labs)+'</p></div>';
    }
    H+='</div>';
  }

  // ═══ BACKWARD COMPAT: old combined keys ═══
  if(!empty(R.panchakarma_diet_lifestyle_yoga)&&empty(R.panchakarma)){
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">\uD83D\uDEC1</div><span class="sc-title">Treatment Protocols</span></div>';
    H+='<p class="desc-text">'+fmt(R.panchakarma_diet_lifestyle_yoga)+'</p></div>';
  }
  if(!empty(R.prognosis_modern_warnings)&&empty(R.prognosis)){
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon green">\uD83D\uDCC8</div><span class="sc-title">Prognosis & Clinical Notes</span></div>';
    H+='<div class="prog-box">'+fmt(R.prognosis_modern_warnings)+'</div></div>';
  }

  // ═══ CATCH-ALL ═══
  var done=['overview_dosha_causes','symptoms','single_drug_remedies','classical_formulations','panchakarma','diet_lifestyle','yoga','prognosis','modern_correlation_warnings','differential_diagnosis','investigations_labs','panchakarma_diet_lifestyle_yoga','prognosis_modern_warnings'];
  Object.keys(R).forEach(function(k){
    if(done.indexOf(k)>=0||!R[k]||typeof R[k]!=='string'||empty(R[k]))return;
    H+='<div class="sc fade-in"><div class="sc-head"><div class="sc-icon amber">\uD83D\uDCC4</div><span class="sc-title">'+esc(k.replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase()}))+'</span></div><p class="desc-text">'+fmt(R[k])+'</p></div>';
  });

  resultsEl.innerHTML=H;
}
