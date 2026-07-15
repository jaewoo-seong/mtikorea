-- Admin-managed pool of LLM API keys for sub-agent dispatch, spanning multiple
-- providers (OpenRouter, NVIDIA NIM free tier, ...). Each key can serve one or
-- more models; the worker rotates across healthy (key, model) pairs when
-- dispatching sub-agents, skipping any key flagged unhealthy.
CREATE TABLE IF NOT EXISTS llm_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openrouter', 'nvidia')),
  label TEXT NOT NULL,
  api_key TEXT NOT NULL,
  models TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'healthy', 'unhealthy')),
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_llm_api_keys_org ON llm_api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_llm_api_keys_active_healthy ON llm_api_keys(org_id, active, status);
