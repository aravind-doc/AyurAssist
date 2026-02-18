# ──────────────────────────────────────────────────────────────
# AyurAssist configuration
#
# All tuneable constants live here. Secrets (API keys, tokens)
# are stored in Modal's secret manager -- only their *names*
# are referenced below.
# ──────────────────────────────────────────────────────────────

# ── Modal ─────────────────────────────────────────────────────
MODAL_APP_NAME = "ayurparam-service"
MODAL_SECRET_UMLS = "my-umls-secret"
MODAL_SECRET_GROQ = "groq-secret"

# ── CPU tier (ASGI + NER + Groq orchestrator) ────────────────
CPU_TIMEOUT = 1200             # seconds
CPU_SCALEDOWN_WINDOW = 300     # seconds idle before shutdown

# ── Groq LLM ─────────────────────────────────────────────────
GROQ_MODEL = "qwen/qwen3-32b"
GROQ_RATE_LIMIT_DELAY = 0.5   # seconds between sequential Groq calls

# ── LLM generation params ────────────────────────────────────
LLM_TEMPERATURE = 0.3
LLM_MAX_TOKENS = 1024

# ── NER ──────────────────────────────────────────────────────
NER_MODEL_NAME = "en_core_sci_lg"

# ── ITA vocabulary ───────────────────────────────────────────
ITA_CSV_SOURCE_PATH = "who-ita/ita_terms_ascii.csv"
ITA_CSV_CONTAINER_PATH = "/app/ita_terms_ascii.csv"
FUZZY_THRESHOLD = 0.80

# ── UMLS API ─────────────────────────────────────────────────
UMLS_SEARCH_URL = "https://uts-ws.nlm.nih.gov/rest/search/current"
UMLS_ATOMS_URL_TEMPLATE = "https://uts-ws.nlm.nih.gov/rest/content/current/CUI/{cui}/atoms"
UMLS_REQUEST_TIMEOUT = 10      # seconds

# ── Python version for container images ──────────────────────
PYTHON_VERSION = "3.11"
