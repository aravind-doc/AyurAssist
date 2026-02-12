import modal
import json
import os
import re
import asyncio
from contextlib import asynccontextmanager

from config import (
    MODAL_APP_NAME, MODAL_VOLUME_NAME,
    MODAL_SECRET_HUGGINGFACE, MODAL_SECRET_UMLS,
    GPU_TYPE, GPU_TIMEOUT, GPU_MIN_CONTAINERS, GPU_SCALEDOWN_WINDOW,
    CPU_TIMEOUT, CPU_SCALEDOWN_WINDOW,
    LLM_MODEL_ID, LLM_MAX_MODEL_LEN, LLM_MAX_TOKENS,
    LLM_TEMPERATURE, LLM_TOP_P, LLM_TOP_K,
    NER_MODEL_NAME, MODEL_CACHE_DIR, VOLUME_MOUNT_PATH,
    UMLS_SEARCH_URL, UMLS_ATOMS_URL_TEMPLATE, UMLS_REQUEST_TIMEOUT,
    PYTHON_VERSION,
)

app = modal.App(MODAL_APP_NAME)

# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------
cpu_image = (
    modal.Image.debian_slim(python_version=PYTHON_VERSION)
    .pip_install(
        "scispacy==0.5.5",
        "https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.4/en_core_sci_lg-0.5.4.tar.gz",
        "fastapi[standard]==0.109.0",
        "requests==2.31.0",
    )
    .add_local_file("config.py", "/root/config.py")
)

gpu_image = (
    modal.Image.debian_slim(python_version=PYTHON_VERSION)
    .pip_install(
        "torch==2.1.0",
        "numpy==1.24.3",
        "transformers==4.46.0",
        "accelerate==0.34.0",
        "huggingface_hub==0.25.0",
        "fastapi[standard]==0.109.0",
        "requests==2.31.0",
    )
    .add_local_file("config.py", "/root/config.py")
)

volume = modal.Volume.from_name(MODAL_VOLUME_NAME, create_if_missing=True)


# ===================================================================
# GPU Tier (LLM)
# ===================================================================
@app.cls(
    image=gpu_image,
    gpu=GPU_TYPE,
    timeout=GPU_TIMEOUT,
    min_containers=GPU_MIN_CONTAINERS,
    scaledown_window=GPU_SCALEDOWN_WINDOW,
    volumes={VOLUME_MOUNT_PATH: volume},
    secrets=[modal.Secret.from_name(MODAL_SECRET_HUGGINGFACE)]
)
class LLMEngine:
    @modal.enter()
    def setup(self):
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        from huggingface_hub import login

        hf_token = os.environ.get("HF_TOKEN")
        if hf_token: login(token=hf_token)

        self.tokenizer = AutoTokenizer.from_pretrained(
            LLM_MODEL_ID, use_fast=False, trust_remote_code=True,
            cache_dir=MODEL_CACHE_DIR,
        )
        if self.tokenizer.pad_token_id is None:
            self.tokenizer.pad_token_id = self.tokenizer.eos_token_id
        self.model = AutoModelForCausalLM.from_pretrained(
            LLM_MODEL_ID, torch_dtype=torch.float16, trust_remote_code=True,
            cache_dir=MODEL_CACHE_DIR, device_map="auto",
        )
        print("LLM engine ready.")

    @modal.method()
    def generate(self, prompt: str) -> str:
        import torch
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
        prompt_len = inputs["input_ids"].shape[1]
        max_new = min(LLM_MAX_TOKENS, LLM_MAX_MODEL_LEN - prompt_len)
        with torch.no_grad():
            output_ids = self.model.generate(
                **inputs, max_new_tokens=max_new, do_sample=True,
                temperature=LLM_TEMPERATURE, top_p=LLM_TOP_P, top_k=LLM_TOP_K,
                eos_token_id=self.tokenizer.eos_token_id,
                pad_token_id=self.tokenizer.pad_token_id,
                use_cache=True,
            )
        return self.tokenizer.decode(output_ids[0][prompt_len:], skip_special_tokens=True)

    @modal.method()
    def warmup(self) -> dict:
        return {"status": "ready"}


# ===================================================================
# CPU Tier — Helpers (Logic Engine)
# ===================================================================

def _clean_input_smart(text: str) -> str:
    """
    Remove conversational filler so we are left with the core medical concept.
    'I am having severe stomach pain' -> 'stomach pain'
    'Why do I think about death' -> 'think about death' -> 'death' (via stopping)
    """
    t = text.lower()
    # Remove standard fillers
    fillers = [
        "i am", "i'm", "i have", "i've", "i feel", "i think", "why do", "what is",
        "having", "feeling", "suffering", "diagnosed", "with", "from",
        "severe", "mild", "acute", "chronic", "very", "bad", "really",
        "my", "the", "a", "an", "and", "or", "in", "on", "at", "to"
    ]
    for f in fillers:
        # Regex to remove whole words only
        t = re.sub(r'\b' + re.escape(f) + r'\b', '', t)

    # Remove punctuation and extra spaces
    t = re.sub(r'[^\w\s]', '', t)
    return t.strip()


def _lookup_umls(api_key, keyword):
    """
    Search UMLS for a keyword.
    Returns: (CUI, SNOMED_CODE, PREFERRED_NAME, ICD10_CODE)
    """
    import requests

    # Default failures
    res = ("N/A", "N/A", keyword, "N/A")

    if not api_key or len(keyword) < 2:
        return res

    try:
        # 1. Search for CUI
        params = {"string": keyword, "apiKey": api_key, "returnIdType": "concept"}
        r = requests.get(UMLS_SEARCH_URL, params=params, timeout=UMLS_REQUEST_TIMEOUT)

        if r.status_code != 200: return res

        data = r.json()
        results = data.get("result", {}).get("results", [])

        if not results: return res

        # Take the top result (UMLS ranking is usually good for exact matches)
        top = results[0]
        cui = top.get("ui")
        name = top.get("name")

        # 2. Fetch SNOMED/ICD codes for this CUI
        snomed = "N/A"
        icd10 = "N/A"

        atoms_url = UMLS_ATOMS_URL_TEMPLATE.format(cui=cui)
        r2 = requests.get(atoms_url, params={
            "apiKey": api_key,
            "sabs": "SNOMEDCT_US,ICD10CM",
            "ttys": "PT",
            "pageSize": 20
        }, timeout=UMLS_REQUEST_TIMEOUT)

        if r2.status_code == 200:
            for atom in r2.json().get("result", []):
                src = atom.get("rootSource")
                if src == "SNOMEDCT_US" and snomed == "N/A":
                    # Clean code URL
                    code = atom.get("code", "").split("/")[-1]
                    snomed = code
                if src == "ICD10CM" and icd10 == "N/A":
                    code = atom.get("code", "").split("/")[-1]
                    icd10 = code

        return (cui, snomed, name, icd10)

    except Exception as e:
        print(f"UMLS Error: {e}")
        return res


def _build_questions(condition, original_text):
    """
    Standard Ayurvedic Clinical Assessment Protocol
    """
    return [
        f"The patient reports: '{original_text}'. Focusing on '{condition}', explain the Ayurvedic perspective (Nidana/Pathogenesis). Which Doshas are aggravated?",
        f"What are the main symptoms (Rupa) of '{condition}' in Ayurveda?",
        f"List 3 specific single-herb remedies (Eka Mulika) for '{condition}'.",
        f"Suggest 2 classical Ayurvedic formulations (Yogas) for '{condition}'.",
        f"What Panchakarma therapies are indicated for '{condition}'?",
        f"Provide dietary advice (Pathya/Apathya) for '{condition}'.",
        f"What Yoga Asanas or Pranayama are beneficial for '{condition}'?",
        f"What is the prognosis (Sadhya/Asadhya) for '{condition}'?",
        f"What are the Red Flags or Danger Signs requiring immediate modern medical care for '{condition}'?",
        f"What is the Differential Diagnosis (Vyavachedaka) in Ayurveda?",
        f"What modern lab investigations are recommended for '{condition}'?",
        f"Suggest Rasayana (Rejuvenation) therapy to prevent recurrence of '{condition}'.",
        f"Is there a psychosomatic component (Manasika Dosha)? Suggest Satvavajaya (counseling) measures."
    ]


def _assemble_json(responses, condition, snomed, icd10):
    """
    Map the 13 answers to the JSON structure.
    """
    return {
        "condition_name": condition,
        "snomed_code": snomed,
        "icd10_code": icd10,
        "ayurvedic_analysis": {
            "pathogenesis_dosha": responses[0],
            "symptoms": responses[1],
            "single_herbs": responses[2],
            "classical_medicines": responses[3],
            "panchakarma": responses[4],
            "diet_lifestyle": responses[5],
            "yoga_therapy": responses[6],
            "prognosis": responses[7],
            "safety_red_flags": responses[8],
            "differential_diagnosis": responses[9],
            "lab_investigations": responses[10],
            "prevention_rasayana": responses[11],
            "psychotherapy_satvavajaya": responses[12]
        }
    }


# ---------------------------------------------------------------------------
# App Logic
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(web_app):
    import asyncio
    # Warmup GPU
    asyncio.create_task(LLMEngine().warmup.remote.aio())

    # Load NER (Just in case we need fallback)
    import spacy
    web_app.state.ner = await asyncio.to_thread(spacy.load, NER_MODEL_NAME)
    web_app.state.umls_api_key = os.environ.get("UMLS_API_KEY", "")
    print("System Ready.")
    yield


@app.function(
    image=cpu_image,
    timeout=CPU_TIMEOUT,
    secrets=[
        modal.Secret.from_name(MODAL_SECRET_UMLS),
        modal.Secret.from_name(MODAL_SECRET_HUGGINGFACE),
    ],
)
@modal.asgi_app()
def fastapi_app():
    from fastapi import FastAPI, Request, HTTPException
    from fastapi.middleware.cors import CORSMiddleware

    web = FastAPI(lifespan=lifespan)
    web.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @web.post("/")
    async def analyze(request: Request):
        try:
            body = await request.json()
            user_input = body.get("text", "").strip()
            if not user_input: raise HTTPException(400, "No text provided")

            st = request.app.state

            # --- LOGIC STEP 1: Smart Cleaning (The Phrase Extractor) ---
            # We trust the user's input structure more than NER tags initially.
            # "I have stomach pain" -> "stomach pain"
            cleaned_phrase = _clean_input_smart(user_input)

            # --- LOGIC STEP 2: The "Specificity" Contest ---
            # We will search TWO things:
            # A. The full cleaned phrase ("stomach pain")
            # B. The individual entities found by NER ("stomach", "pain")

            # A. Phrase Search
            cui, snomed, name, icd = await asyncio.to_thread(
                _lookup_umls, st.umls_api_key, cleaned_phrase
            )

            final_keyword = name
            final_snomed = snomed
            final_icd = icd

            # B. Fallback to NER if Phrase Search fails or returns generic nonsense
            # (Only do this if SNOMED is N/A)
            entities_found = []
            if snomed == "N/A":
                # Run NER
                doc = await asyncio.to_thread(st.ner, user_input)
                entities_found = [e.text for e in doc.ents]

                # Pick the longest entity (Heuristic: Longest = Most Specific)
                # "left arm" vs "chest pain" -> chest pain is longer/more complex usually
                # OR we just loop through them and stop at the first one with a SNOMED code
                for ent in sorted(entities_found, key=len, reverse=True):
                    e_cui, e_snomed, e_name, e_icd = await asyncio.to_thread(
                        _lookup_umls, st.umls_api_key, ent
                    )
                    if e_snomed != "N/A":
                        final_keyword = e_name
                        final_snomed = e_snomed
                        final_icd = e_icd
                        break

            # --- LOGIC STEP 3: Generate Content ---
            # If still nothing, default to the raw input
            if final_snomed == "N/A":
                final_keyword = cleaned_phrase or user_input

            llm = LLMEngine()
            questions = _build_questions(final_keyword, user_input)

            # Run all 13 prompts in parallel
            responses = await asyncio.gather(*[
                llm.generate.remote.aio(f"<user> {q} <assistant>")
                for q in questions
            ])

            # Clean up whitespace
            responses = [r.strip() for r in responses]

            result_json = _assemble_json(responses, final_keyword, final_snomed, final_icd)

            return {
                "input": user_input,
                "detected_concept": final_keyword,
                "snomed": final_snomed,
                "icd10": final_icd,
                "result": result_json
            }

        except Exception as e:
            print(f"Error: {e}")
            raise HTTPException(500, str(e))

    return web
