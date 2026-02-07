'use client'

import { useState } from 'react'

// ── Updated Types matching expanded Python API response ──────────────────
interface ClinicalEntity {
  word: string
  entity_group?: string
  score: number
}

interface OttamooliRemedy {
  medicine_name: string
  sanskrit_name: string
  part_used: string
  preparation: string
  dosage: string
  timing: string
  duration: string
}

interface ClassicalFormulation {
  name: string
  english_name: string
  form: string
  dosage: string
  reference_text: string
}

interface DietaryAdvice {
  foods_to_favor: string[]
  foods_to_avoid: string[]
  specific_dietary_rules: string
}

interface TreatmentInfo {
  condition_name: string
  sanskrit_name: string
  brief_description: string
  dosha_involvement: string
  nidana_causes: string[]
  purvarupa_prodromal_symptoms: string[]
  rupa_symptoms: string[]
  ottamooli_single_remedies: OttamooliRemedy[]
  classical_formulations: ClassicalFormulation[]
  pathya_dietary_advice: DietaryAdvice
  vihara_lifestyle: string[]
  yoga_exercises: string[]
  modern_correlation: string
  prognosis: string
  warning_signs: string[]
  disclaimer: string
}

interface ConditionResult {
  input_entity: string
  match_type: string
  match_score: number
  ita_id: string
  ayurveda_term: string
  sanskrit: string
  snomed_code: string
  snomed_name: string
  who_description: string
  treatment_info: TreatmentInfo
}

interface APIResponse {
  input_text: string
  clinical_entities: ClinicalEntity[] // From Bio_ClinicalBERT
  umls_cui: string                  // From SciSpacy + UMLS Linker
  conditions_matched: number
  results: ConditionResult[]
}

// Defaults to your specific FastAPI endpoint on Modal
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://aravindkv28--ayurparam-service-fastapi-app.modal.run'

export default function Home() {
  const [inputText, setInputText] = useState('')
  const [results, setResults] = useState<ConditionResult[]>([])
  const [clinicalEntities, setClinicalEntities] = useState<ClinicalEntity[]>([])
  const [umlsCui, setUmlsCui] = useState<string>('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  const handleAnalyze = async () => {
    if (!inputText.trim()) return
    setIsAnalyzing(true)
    setError('')
    setHasSearched(true)

    try {
      const res = await fetch(`${API_BASE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)
      
      const data: APIResponse = await res.json()
      
      if (data.results && data.results.length > 0) {
        setResults(data.results)
        setClinicalEntities(data.clinical_entities || [])
        setUmlsCui(data.umls_cui || 'N/A')
      } else {
        setResults([])
        setError('No matching Ayurvedic conditions found.')
      }
    } catch (err: any) {
      console.error("Connection Error:", err)
      setError('Could not connect to the cloud AI. Check your internet or Modal deployment.')
      setResults([])
      setClinicalEntities([])
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAnalyze() }
  }

  const hasLLMData = (info: TreatmentInfo) =>
    info && info.ottamooli_single_remedies && info.ottamooli_single_remedies.length > 0

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* ─── HEADER ─── */}
        <header style={{ textAlign: 'center', padding: '48px 0 36px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--green-light)', color: 'var(--green-deep)',
            fontSize: 11, fontWeight: 600, letterSpacing: 1.5,
            textTransform: 'uppercase' as const, padding: '6px 16px', borderRadius: 100, marginBottom: 16
          }}>
            🌿 WHO ITA Standards · SNOMED CT Mapped
          </div>
          <h1 style={{
            fontSize: 44, fontWeight: 700,
            color: 'var(--green-deep)', letterSpacing: -1, lineHeight: 1.1
          }}>
            Ayur<span style={{ color: 'var(--green-soft)', fontWeight: 300, fontStyle: 'italic' }}>Assist</span>
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-light)', marginTop: 8 }}>
            Ayurveda–SNOMED Clinical Decision Support
          </p>
          <div style={{
            width: 60, height: 3, margin: '20px auto 0', borderRadius: 2,
            background: 'linear-gradient(90deg, var(--green-soft), var(--amber))'
          }} />
        </header>

        {/* ─── SEARCH ─── */}
        <section style={{
          background: 'var(--bg-card)', borderRadius: 28, padding: 32,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)', border: '1px solid var(--border)', marginBottom: 28
        }}>
          <p style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>
            Describe your symptoms
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 16 }}>
            Enter symptoms in plain language — our engine will identify medical entities
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="e.g., headache, stomach pain, cough with fever..."
              style={{
                flex: 1, padding: '14px 20px', fontSize: 16,
                border: '2px solid var(--border)', borderRadius: 12,
                background: 'var(--bg-cream)', color: 'var(--text-dark)', outline: 'none'
              }}
            />
            <button
              onClick={handleAnalyze}
              disabled={!inputText.trim() || isAnalyzing}
              style={{
                padding: '14px 28px',
                background: 'linear-gradient(135deg, var(--green-deep), var(--green-mid))',
                color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600,
                cursor: 'pointer', opacity: (!inputText.trim() || isAnalyzing) ? 0.5 : 1
              }}
            >
              {isAnalyzing ? "Analyzing..." : "Analyze"}
            </button>
          </div>
        </section>

        {/* ─── ERROR ─── */}
        {error && (
          <div style={{
            background: 'var(--red-soft)', border: '1px solid #F5C6CB', borderRadius: 12,
            padding: '14px 20px', marginBottom: 20, color: 'var(--red-warn)', fontSize: 14
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ─── CLINICAL INTELLIGENCE DISPLAY (ClinicalBERT & UMLS) ─── */}
        {results.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={{ padding: 20, background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: 16 }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase', marginBottom: 12 }}>
                Clinical Entities (Bio_ClinicalBERT)
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {clinicalEntities.map((ent, i) => (
                  <span key={i} style={{ padding: '4px 10px', background: '#fff', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 12, color: '#1D4ED8' }}>
                    {ent.word}
                  </span>
                ))}
                {clinicalEntities.length === 0 && <span style={{ fontSize: 12, fontStyle: 'italic', color: '#60A5FA' }}>Analyzing clinical context...</span>}
              </div>
            </div>

            <div style={{ padding: 20, background: '#FAF5FF', border: '1px solid #F3E8FF', borderRadius: 16 }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: '#6B21A8', textTransform: 'uppercase', marginBottom: 12 }}>
                Standardized Mapping (UMLS)
              </h3>
              <div style={{ fontSize: 13, color: '#7E22CE', fontWeight: 500 }}>
                UMLS CUI: <span style={{ fontFamily: 'monospace', background: '#fff', padding: '2px 6px', borderRadius: 4 }}>{umlsCui}</span>
              </div>
              <div style={{ fontSize: 13, color: '#7E22CE', fontWeight: 500, marginTop: 8 }}>
                SNOMED CT: <span style={{ fontFamily: 'monospace', background: '#fff', padding: '2px 6px', borderRadius: 4 }}>{results[0].snomed_code}</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── RESULTS ─── */}
        {results.map((result, index) => {
          const info = result.treatment_info;
          const hasLLM = hasLLMData(info);

          return (
            <div key={index} style={{ marginBottom: 32 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', background: 'var(--green-deep)', borderRadius: 12, marginBottom: 20, color: '#fff'
              }}>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Ayurvedic Protocol Generated</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>Entity: {result.ayurveda_term}</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{result.match_score}%</div>
              </div>

              <Card>
                <h2 style={{ fontSize: 30, color: 'var(--green-deep)' }}>{result.ayurveda_term}</h2>
                <p style={{ color: 'var(--terra)', fontStyle: 'italic' }}>{result.sanskrit || info.sanskrit_name}</p>
                <div style={{ fontSize: 13, color: 'var(--text-light)', marginTop: 10 }}>
                  SNOMED CT Descriptor: <span style={{ background: 'var(--bg-warm)', padding: '2px 6px' }}>{result.snomed_name}</span>
                </div>
              </Card>

              <SectionCard icon="📋" iconBg="#DCFCE7" title="Clinical Description">
                <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-mid)' }}>{info.brief_description || result.who_description}</p>
              </SectionCard>

              {hasLLM && (
                <>
                  <SectionCard icon="🌿" iconBg="#DCFCE7" title="Ottamooli (Single Remedies)">
                    {info.ottamooli_single_remedies.map((r, i) => (
                      <div key={i} style={{ padding: 12, borderBottom: i !== info.ottamooli_single_remedies.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <strong style={{ color: 'var(--green-deep)' }}>{r.medicine_name}</strong> ({r.sanskrit_name})
                        <div style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 4 }}>
                          Preparation: {r.preparation} | Dosage: {r.dosage}
                        </div>
                      </div>
                    ))}
                  </SectionCard>

                  <SectionCard icon="🍽️" iconBg="#FEF3C7" title="Dietary (Pathya-Apathya)">
                    <div style={{ marginBottom: 12 }}>
                      <strong style={{ fontSize: 14, color: '#166534' }}>✅ Favor (Pathya):</strong>
                      <div style={{ fontSize: 14, color: '#166534', marginTop: 4 }}>{info.pathya_dietary_advice.foods_to_favor.join(', ')}</div>
                    </div>
                    <div>
                      <strong style={{ fontSize: 14, color: '#991B1B' }}>❌ Avoid (Apathya):</strong>
                      <div style={{ fontSize: 14, color: '#991B1B', marginTop: 4 }}>{info.pathya_dietary_advice.foods_to_avoid.join(', ')}</div>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 13, fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      Note: {info.pathya_dietary_advice.specific_dietary_rules}
                    </div>
                  </SectionCard>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  )
}

/* ─── Reusable UI Components ─── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 20, padding: 24,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid var(--border)',
      marginBottom: 12, ...style
    }}>{children}</div>
  )
}

function SectionCard({ icon, iconBg, title, children }: { icon: string; iconBg: string; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: iconBg }}>{icon}</div>
        <span style={{ fontSize: 18, fontWeight: 600 }}>{title}</span>
      </div>
      {children}
    </Card>
  )
}
