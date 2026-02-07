'use client'

import { useState } from 'react'

// ── Types matching Python API response ──────────────────
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

interface PanchakarmaTherapy {
  therapy_name: string
  description: string
  indication: string
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
  panchakarma_treatments: PanchakarmaTherapy[]
  pathya_dietary_advice: DietaryAdvice
  vihara_lifestyle: string[]
  yoga_exercises: string[]
  modern_correlation: string
  prognosis: string
  warning_signs: string[]
  disclaimer: string
  note?: string
  snomed_code?: string
  snomed_name?: string
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
  entities_extracted: { text: string; label: string; score: number }[]
  conditions_matched: number
  results: ConditionResult[]
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function Home() {
  const [inputText, setInputText] = useState('')
  const [results, setResults] = useState<ConditionResult[]>([])
  const [entities, setEntities] = useState<{ text: string; label: string; score: number }[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  const handleAnalyze = async () => {
    if (!inputText.trim()) return
    setIsAnalyzing(true)
    setError('')
    setHasSearched(true)

    try {
      const res = await fetch(`${API_BASE}/api/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, enrich_with_llm: true, top_conditions: 5 }),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data: APIResponse = await res.json()
      setResults(data.results)
      setEntities(data.entities_extracted)
    } catch (err: any) {
      setError('Could not connect to backend. Make sure the Python API is running on port 8000.')
      setResults([])
      setEntities([])
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAnalyze() }
  }

  const hasLLMData = (info: TreatmentInfo) =>
    info.ottamooli_single_remedies && info.ottamooli_single_remedies.length > 0

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* ─── HEADER ─── */}
        <header className="fade-in" style={{ textAlign: 'center', padding: '48px 0 36px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--green-light)', color: 'var(--green-deep)',
            fontSize: 11, fontWeight: 600, letterSpacing: 1.5,
            textTransform: 'uppercase' as const, padding: '6px 16px', borderRadius: 100, marginBottom: 16
          }}>
            🌿 WHO ITA Standards · SNOMED CT Mapped
          </div>
          <h1 style={{
            fontFamily: "'Fraunces', serif", fontSize: 44, fontWeight: 700,
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
        <section className="fade-in" style={{
          background: 'var(--bg-card)', borderRadius: 28, padding: 32,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)', border: '1px solid var(--border)', marginBottom: 28
        }}>
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 500, marginBottom: 4 }}>
            Describe your symptoms
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 16 }}>
            Enter symptoms in plain language — our NLP engine will identify medical entities
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., headache, stomach pain, cough with fever..."
              style={{
                flex: 1, padding: '14px 20px', fontSize: 16,
                fontFamily: "'DM Sans', sans-serif",
                border: '2px solid var(--border)', borderRadius: 12,
                background: 'var(--bg-cream)', color: 'var(--text-dark)', outline: 'none',
                transition: 'all 0.25s ease'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--green-mid)'
                e.target.style.background = '#fff'
                e.target.style.boxShadow = '0 0 0 4px rgba(74,124,40,0.1)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border)'
                e.target.style.background = 'var(--bg-cream)'
                e.target.style.boxShadow = 'none'
              }}
            />
            <button
              onClick={handleAnalyze}
              disabled={!inputText.trim() || isAnalyzing}
              style={{
                padding: '14px 28px',
                background: 'linear-gradient(135deg, var(--green-deep), var(--green-mid))',
                color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' as const,
                opacity: (!inputText.trim() || isAnalyzing) ? 0.5 : 1,
                transition: 'all 0.25s ease'
              }}
            >
              {isAnalyzing ? (
                <><div className="animate-spin" style={{
                  width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff', borderRadius: '50%'
                }} /> Analyzing...</>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  Analyze
                </>
              )}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' as const }}>
            {['🧠 Bio_ClinicalBERT NER', '🤖 Qwen3-235B LLM', '📋 226 ITA Conditions'].map((t) => (
              <span key={t} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'var(--bg-warm)', padding: '3px 10px', borderRadius: 100,
                fontSize: 11, fontWeight: 500, color: 'var(--text-mid)'
              }}>{t}</span>
            ))}
          </div>
        </section>

        {/* ─── ERROR ─── */}
        {error && (
          <div className="fade-in" style={{
            background: 'var(--red-soft)', border: '1px solid #F5C6CB', borderRadius: 12,
            padding: '14px 20px', marginBottom: 20, color: 'var(--red-warn)', fontSize: 14
          }}>
            ⚠️ {error}
            <p style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
              Run: <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 4 }}>py -m uvicorn api:app --reload --port 8000</code>
            </p>
          </div>
        )}

        {/* ─── NER ENTITIES STRIP ─── */}
        {entities.length > 0 && (
          <div className="fade-in" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 20px', background: 'var(--green-light)', borderRadius: 12,
            marginBottom: 20, flexWrap: 'wrap' as const
          }}>
            <span style={{
              fontSize: 12, fontWeight: 600, color: 'var(--green-deep)',
              textTransform: 'uppercase' as const, letterSpacing: 0.8
            }}>Detected Entities</span>
            {entities.map((ent, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', background: '#fff',
                border: '1px solid rgba(74,124,40,0.2)', borderRadius: 100,
                fontSize: 13, fontWeight: 500, color: 'var(--green-deep)'
              }}>
                {ent.text}
                <span style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>
                  {ent.label} · {Math.round(ent.score * 100)}%
                </span>
              </span>
            ))}
          </div>
        )}

        {/* ─── RESULTS ─── */}
        {results.length > 0 && results.map((result, index) => {
          const info = result.treatment_info
          const hasLLM = hasLLMData(info)

          return (
            <div key={index} className="fade-in" style={{ marginBottom: 32 }}>

              {/* Match Banner */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px',
                background: 'linear-gradient(135deg, var(--green-deep), var(--green-mid))',
                borderRadius: 12, marginBottom: 20, color: '#fff'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, background: 'rgba(255,255,255,0.15)',
                    borderRadius: '50%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 18
                  }}>✓</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Ayurvedic Match Found</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Detected: {result.input_entity} → {result.ita_id} · {result.match_type}
                    </div>
                  </div>
                </div>
                <div style={{
                  fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: 'var(--green-glow)'
                }}>{result.match_score}%</div>
              </div>

              {/* Disease Header */}
              <Card style={{ marginBottom: 16 }}>
                <span style={{
                  display: 'inline-block', fontSize: 11, fontWeight: 600, color: 'var(--amber)',
                  background: 'var(--amber-soft)', padding: '3px 10px', borderRadius: 100,
                  letterSpacing: 0.5, marginBottom: 10
                }}>{result.ita_id}</span>
                <h2 style={{
                  fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 700,
                  color: 'var(--green-deep)', lineHeight: 1.2
                }}>{result.ayurveda_term}</h2>
                <p style={{
                  fontFamily: "'Fraunces', serif", fontSize: 17, fontStyle: 'italic',
                  color: 'var(--terra)', marginTop: 2
                }}>{result.sanskrit || info.sanskrit_name}</p>
                {info.dosha_involvement && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)'
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#5B8DEF' }} />
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4CAF50' }} />
                    <span style={{ fontSize: 14, color: 'var(--text-mid)', fontWeight: 500 }}>
                      {info.dosha_involvement}
                    </span>
                  </div>
                )}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, color: 'var(--text-light)'
                }}>
                  <span>SNOMED CT:</span>
                  <span style={{
                    fontFamily: 'monospace', background: 'var(--bg-warm)',
                    padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, color: 'var(--text-mid)'
                  }}>{result.snomed_code || '—'}</span>
                  <span>{result.snomed_name}</span>
                </div>
              </Card>

              {/* Description */}
              <SectionCard icon="📋" iconBg="var(--green-light)" title="Description">
                <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--text-mid)' }}>
                  {info.brief_description || result.who_description}
                </p>
                {info.modern_correlation && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
                    fontSize: 13, color: 'var(--text-light)', background: 'var(--bg-warm)',
                    padding: '6px 14px', borderRadius: 8
                  }}>🏥 {info.modern_correlation}</div>
                )}
              </SectionCard>

              {/* Nidana & Rupa - Two Columns */}
              {hasLLM && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {info.nidana_causes?.length > 0 && (
                    <SectionCard icon="🔍" iconBg="var(--amber-soft)" title="Root Causes (Nidāna)">
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                        {info.nidana_causes.map((c, i) => (
                          <PillTag key={i}>{c}</PillTag>
                        ))}
                      </div>
                    </SectionCard>
                  )}
                  {info.rupa_symptoms?.length > 0 && (
                    <SectionCard icon="🩺" iconBg="var(--terra-soft)" title="Symptoms (Rūpa)">
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                        {info.rupa_symptoms.map((s, i) => (
                          <PillTag key={i} variant="symptom">{s}</PillTag>
                        ))}
                      </div>
                    </SectionCard>
                  )}
                </div>
              )}

              {/* Ottamooli */}
              {hasLLM && info.ottamooli_single_remedies?.length > 0 && (
                <SectionCard icon="🌿" iconBg="var(--green-light)" title="Ottamooli — Single Medicine Remedies">
                  <div style={{ display: 'grid', gap: 12 }}>
                    {info.ottamooli_single_remedies.map((r, i) => (
                      <div key={i} style={{
                        background: 'var(--bg-cream)', border: '1px solid var(--border)',
                        borderRadius: 12, padding: 18, transition: 'all 0.2s ease'
                      }}>
                        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--green-deep)', marginBottom: 2 }}>
                          {r.medicine_name}
                        </div>
                        <div style={{
                          fontFamily: "'Fraunces', serif", fontStyle: 'italic',
                          fontSize: 13, color: 'var(--terra)', marginBottom: 10
                        }}>{r.sanskrit_name}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                          {r.part_used && <DetailRow label="Part Used" value={r.part_used} />}
                          {r.preparation && <DetailRow label="Preparation" value={r.preparation} />}
                          {r.dosage && <DetailRow label="Dosage" value={r.dosage} />}
                          {r.timing && <DetailRow label="Timing" value={r.timing} />}
                          {r.duration && <DetailRow label="Duration" value={r.duration} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Classical Formulations */}
              {hasLLM && info.classical_formulations?.length > 0 && (
                <SectionCard icon="📜" iconBg="var(--amber-soft)" title="Classical Formulations">
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                    {info.classical_formulations.map((f, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 14,
                        padding: 16, background: 'var(--bg-cream)', border: '1px solid var(--border)', borderRadius: 12
                      }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 10, background: 'var(--green-light)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 20, flexShrink: 0
                        }}>⚗️</div>
                        <div>
                          <div style={{
                            fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: 'var(--text-dark)'
                          }}>{f.name}</div>
                          {f.english_name && (
                            <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 6 }}>{f.english_name}</div>
                          )}
                          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-mid)', flexWrap: 'wrap' as const }}>
                            {f.form && <span>💊 {f.form}</span>}
                            {f.dosage && <span>📏 {f.dosage}</span>}
                            {f.reference_text && (
                              <span style={{
                                fontSize: 11, padding: '2px 8px', background: 'var(--amber-soft)',
                                borderRadius: 4, color: 'var(--amber)', fontWeight: 500
                              }}>{f.reference_text}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Panchakarma */}
              {hasLLM && info.panchakarma_treatments?.length > 0 && (
                <SectionCard icon="🧘" iconBg="var(--terra-soft)" title="Panchakarma Treatments">
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                    {info.panchakarma_treatments.map((p, i) => (
                      <div key={i} style={{
                        padding: 16, background: 'var(--bg-cream)', border: '1px solid var(--border)',
                        borderRadius: 12, borderLeft: '3px solid var(--amber)'
                      }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-dark)', marginBottom: 4 }}>
                          {p.therapy_name}
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 4 }}>{p.description}</p>
                        {p.indication && (
                          <span style={{ fontSize: 12, color: 'var(--green-mid)', fontStyle: 'italic' }}>
                            ▸ {p.indication}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Diet */}
              {hasLLM && info.pathya_dietary_advice && (
                <SectionCard icon="🍽️" iconBg="var(--green-light)" title="Pathya — Diet">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {info.pathya_dietary_advice.foods_to_favor?.length > 0 && (
                      <div>
                        <div style={{
                          fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const,
                          letterSpacing: 0.5, marginBottom: 8, color: 'var(--green-mid)',
                          display: 'flex', alignItems: 'center', gap: 6
                        }}>✅ Foods to Favor</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                          {info.pathya_dietary_advice.foods_to_favor.map((f, i) => (
                            <span key={i} style={{
                              padding: '4px 10px', borderRadius: 100, fontSize: 12, fontWeight: 500,
                              background: 'var(--green-light)', color: 'var(--green-deep)'
                            }}>{f}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {info.pathya_dietary_advice.foods_to_avoid?.length > 0 && (
                      <div>
                        <div style={{
                          fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const,
                          letterSpacing: 0.5, marginBottom: 8, color: 'var(--red-warn)',
                          display: 'flex', alignItems: 'center', gap: 6
                        }}>❌ Foods to Avoid</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                          {info.pathya_dietary_advice.foods_to_avoid.map((f, i) => (
                            <span key={i} style={{
                              padding: '4px 10px', borderRadius: 100, fontSize: 12, fontWeight: 500,
                              background: 'var(--red-soft)', color: 'var(--red-warn)'
                            }}>{f}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {info.pathya_dietary_advice.specific_dietary_rules && (
                      <div style={{
                        gridColumn: '1 / -1', padding: '10px 14px', background: 'var(--amber-soft)',
                        borderRadius: 8, fontSize: 13, color: 'var(--terra)', lineHeight: 1.5,
                        borderLeft: '3px solid var(--amber)'
                      }}>💡 {info.pathya_dietary_advice.specific_dietary_rules}</div>
                    )}
                  </div>
                </SectionCard>
              )}

              {/* Lifestyle & Yoga - Two Columns */}
              {hasLLM && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {info.vihara_lifestyle?.length > 0 && (
                    <SectionCard icon="🏃" iconBg="var(--green-light)" title="Lifestyle (Vihāra)">
                      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                        {info.vihara_lifestyle.map((v, i) => (
                          <li key={i} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 8,
                            fontSize: 14, color: 'var(--text-mid)', padding: '6px 0'
                          }}>
                            <span style={{ color: 'var(--green-soft)', fontWeight: 700, flexShrink: 0 }}>▸</span>
                            {v}
                          </li>
                        ))}
                      </ul>
                    </SectionCard>
                  )}
                  {info.yoga_exercises?.length > 0 && (
                    <SectionCard icon="🧘‍♀️" iconBg="var(--amber-soft)" title="Yoga & Exercises">
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                        {info.yoga_exercises.map((y, i) => (
                          <span key={i} style={{
                            padding: '8px 16px',
                            background: 'linear-gradient(135deg, #F0F7E8, #E8F0DE)',
                            border: '1px solid rgba(74,124,40,0.15)', borderRadius: 8,
                            fontSize: 13, color: 'var(--green-deep)', fontWeight: 500
                          }}>{y}</span>
                        ))}
                      </div>
                    </SectionCard>
                  )}
                </div>
              )}

              {/* Prognosis */}
              {hasLLM && info.prognosis && (
                <SectionCard icon="📊" iconBg="var(--green-light)" title="Prognosis">
                  <div style={{
                    padding: '16px 20px',
                    background: 'linear-gradient(135deg, var(--green-light), #F0F7E8)',
                    borderRadius: 12, fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.6
                  }}>{info.prognosis}</div>
                </SectionCard>
              )}

              {/* Warning Signs */}
              {hasLLM && info.warning_signs?.length > 0 && (
                <SectionCard icon="⚠️" iconBg="var(--red-soft)" title="Warning Signs">
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                    {info.warning_signs.map((w, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', background: 'var(--red-soft)', borderRadius: 8,
                        fontSize: 13, color: 'var(--red-warn)', fontWeight: 500
                      }}>
                        <span style={{
                          width: 20, height: 20, background: 'var(--red-warn)', color: '#fff',
                          borderRadius: '50%', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0
                        }}>!</span>
                        {w}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Fallback: no LLM data */}
              {!hasLLM && result.who_description && (
                <SectionCard icon="📋" iconBg="var(--amber-soft)" title="WHO Ayurveda Description">
                  <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--text-mid)' }}>
                    {result.who_description}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 10, fontStyle: 'italic' }}>
                    💡 Treatment data pending — run generate_treatments.py to populate.
                  </p>
                </SectionCard>
              )}

              {/* Disclaimer */}
              <div style={{
                marginTop: 20, padding: '16px 20px', background: 'var(--bg-warm)',
                borderRadius: 12, fontSize: 13, color: 'var(--text-light)', textAlign: 'center' as const,
                lineHeight: 1.5, border: '1px solid var(--border)'
              }}>
                ⚕️ {info.disclaimer || 'This information is for educational purposes only. Consult a qualified Ayurvedic practitioner before starting any treatment.'}
                <br />
                <span style={{ fontSize: 11, marginTop: 4, display: 'inline-block' }}>
                  AyurAssist v2.0 · NLP + LLM Powered Clinical Decision Support · WHO ITA · SNOMED CT
                </span>
              </div>
            </div>
          )
        })}

        {/* ─── NO RESULTS ─── */}
        {results.length === 0 && hasSearched && !isAnalyzing && !error && (
          <Card className="fade-in" style={{ textAlign: 'center' as const, padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <h3 style={{
              fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600,
              color: 'var(--text-dark)', marginBottom: 8
            }}>No Symptoms Detected</h3>
            <p style={{ fontSize: 14, color: 'var(--text-light)', marginBottom: 16 }}>
              Try describing common symptoms like:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, justifyContent: 'center' }}>
              {['fever', 'cold', 'headache', 'stomach pain', 'cough', 'insomnia', 'piles', 'jaundice'].map((s) => (
                <button key={s} onClick={() => setInputText(s)} style={{
                  padding: '6px 14px', background: 'var(--green-light)', color: 'var(--green-deep)',
                  border: '1px solid rgba(74,124,40,0.2)', borderRadius: 100, fontSize: 13,
                  fontWeight: 500, cursor: 'pointer'
                }}>{s}</button>
              ))}
            </div>
          </Card>
        )}

        {/* ─── HOW IT WORKS ─── */}
        {!hasSearched && (
          <Card className="fade-in">
            <h3 style={{
              fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600,
              color: 'var(--green-deep)', marginBottom: 24, textAlign: 'center' as const
            }}>How AyurAssist Works</h3>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
              {[
                { n: '1', title: 'Describe Your Symptoms', desc: 'Type in natural language, just like talking to a doctor.' },
                { n: '2', title: 'AI Extracts Medical Terms', desc: 'Bio_ClinicalBERT NER identifies medical entities automatically.' },
                { n: '3', title: 'Get Ayurvedic Treatment', desc: 'Ottamooli, formulations, panchakarma, diet, lifestyle, and yoga recommendations.' },
              ].map((step) => (
                <div key={step.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: 'var(--green-light)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 700,
                    color: 'var(--green-deep)', flexShrink: 0
                  }}>{step.n}</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-dark)', marginBottom: 2 }}>
                      {step.title}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

/* ─── Reusable Components ─── */

function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className} style={{
      background: 'var(--bg-card)', borderRadius: 20, padding: 24,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid var(--border)',
      marginBottom: 12, ...style
    }}>
      {children}
    </div>
  )
}

function SectionCard({ icon, iconBg, title, children }: {
  icon: string; iconBg: string; title: string; children: React.ReactNode
}) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0, background: iconBg
        }}>{icon}</div>
        <span style={{
          fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: 'var(--text-dark)'
        }}>{title}</span>
      </div>
      {children}
    </Card>
  )
}

function PillTag({ children, variant }: { children: React.ReactNode; variant?: 'symptom' }) {
  const isSymptom = variant === 'symptom'
  return (
    <span style={{
      padding: '6px 14px',
      background: isSymptom ? '#FFF8F0' : 'var(--bg-cream)',
      border: `1px solid ${isSymptom ? '#F0D8B8' : 'var(--border)'}`,
      borderRadius: 100, fontSize: 13,
      color: isSymptom ? 'var(--terra)' : 'var(--text-mid)',
      fontWeight: 400, lineHeight: 1.3
    }}>{children}</span>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--text-light)',
        textTransform: 'uppercase' as const, letterSpacing: 0.5
      }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>{value}</div>
    </div>
  )
}
