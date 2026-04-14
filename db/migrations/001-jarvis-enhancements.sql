-- ============================================================
-- Jarvis Enhancements — PostgreSQL Migration
-- Sistema 360 MVP — ai50m
-- Run against: Cloud SQL leads-db
-- ============================================================

-- Jarvis configuration key-value store
CREATE TABLE IF NOT EXISTS jarvis_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(100) UNIQUE NOT NULL,
  config_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO jarvis_config (config_key, config_value) VALUES
  ('company_name',          'AI50M'),
  ('founder_name',          'Rey Martinez'),
  ('company_location',      'Miami, Florida'),
  ('support_email',         'reymartinezcontact@gmail.com'),
  ('jarvis_role',           'Lead Qualification Agent'),
  ('personality_tone',      'Professional, Friendly, Smart'),
  ('never_say',             'bot,AI,artificial,chatbot,automated,algorithm'),
  ('always_say',            'team,we,I,our approach,our solution'),
  ('context_memory_messages','30'),
  ('escalation_team',       'AI50M Sales Team'),
  ('calendly_url',          'https://calendly.com/ai50m/30min')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW();

-- Audio transcriptions (WhatsApp voice messages)
CREATE TABLE IF NOT EXISTS audio_messages (
  id                    SERIAL PRIMARY KEY,
  lead_id               INT,
  whatsapp_message_id   VARCHAR(255),
  audio_url             TEXT,
  duration_seconds      INT,
  transcription         TEXT,
  confidence            FLOAT,
  language              VARCHAR(10),
  sentiment             VARCHAR(20),
  processor             VARCHAR(20) DEFAULT 'whisper',
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at          TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audio_lead_id ON audio_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_audio_created  ON audio_messages(created_at);

-- Image analyses (WhatsApp image messages)
CREATE TABLE IF NOT EXISTS image_messages (
  id                    SERIAL PRIMARY KEY,
  lead_id               INT,
  whatsapp_message_id   VARCHAR(255),
  image_url             TEXT,
  image_gcs_path        TEXT,
  description           TEXT,
  objects               JSONB,
  text_detected         TEXT,
  quality_score         FLOAT,
  processor             VARCHAR(20) DEFAULT 'claude_vision',
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at          TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_image_lead_id ON image_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_image_created  ON image_messages(created_at);

-- Extended conversation memory (30-message rolling window)
CREATE TABLE IF NOT EXISTS conversation_memory (
  id             SERIAL PRIMARY KEY,
  lead_id        INT NOT NULL,
  message_number INT NOT NULL,
  role           VARCHAR(20) NOT NULL, -- 'user' | 'assistant'
  content        TEXT NOT NULL,
  message_type   VARCHAR(20) DEFAULT 'text', -- 'text' | 'audio' | 'image' | 'system'
  timestamp      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_memory_lead_id  ON conversation_memory(lead_id);
CREATE INDEX IF NOT EXISTS idx_memory_combined ON conversation_memory(lead_id, message_number DESC);

-- LLM call audit log (multi-provider tracking)
CREATE TABLE IF NOT EXISTS llm_calls (
  id          SERIAL PRIMARY KEY,
  lead_id     INT,
  provider    VARCHAR(20) NOT NULL,  -- 'claude' | 'gpt4o' | 'gemini'
  model       VARCHAR(50),
  status      VARCHAR(20) DEFAULT 'success',
  tokens_in   INT,
  tokens_out  INT,
  latency_ms  INT,
  error_msg   TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_llm_provider ON llm_calls(provider);
CREATE INDEX IF NOT EXISTS idx_llm_created  ON llm_calls(created_at);

-- ============================================================
-- To run: psql $DATABASE_URL < 001-jarvis-enhancements.sql
-- Or via Cloud SQL proxy:
--   gcloud sql connect leads-db --user=leads_user < 001-jarvis-enhancements.sql
-- ============================================================