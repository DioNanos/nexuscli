ALTER TABLE sessions ADD COLUMN lane TEXT;

ALTER TABLE sessions ADD COLUMN runtime_id TEXT;

ALTER TABLE sessions ADD COLUMN provider_id TEXT;

ALTER TABLE sessions ADD COLUMN model_id TEXT;

ALTER TABLE messages ADD COLUMN lane TEXT;

ALTER TABLE messages ADD COLUMN runtime_id TEXT;

ALTER TABLE messages ADD COLUMN provider_id TEXT;

ALTER TABLE messages ADD COLUMN model_id TEXT;

UPDATE sessions
SET engine = 'claude'
WHERE lower(engine) = 'claude-code';

UPDATE messages
SET engine = 'claude'
WHERE lower(engine) = 'claude-code';

UPDATE sessions
SET
  lane = COALESCE(lane, 'native'),
  runtime_id = COALESCE(runtime_id,
    CASE
      WHEN lower(engine) LIKE '%codex%' OR lower(engine) LIKE '%openai%' THEN 'codex-native'
      WHEN lower(engine) LIKE '%gemini%' OR lower(engine) LIKE '%google%' THEN 'gemini-native'
      WHEN lower(engine) LIKE '%qwen%' THEN 'qwen-native'
      ELSE 'claude-native'
    END
  ),
  provider_id = COALESCE(provider_id,
    CASE
      WHEN lower(engine) LIKE '%codex%' OR lower(engine) LIKE '%openai%' THEN 'openai'
      WHEN lower(engine) LIKE '%gemini%' OR lower(engine) LIKE '%google%' THEN 'google'
      WHEN lower(engine) LIKE '%qwen%' THEN 'qwen'
      ELSE 'anthropic'
    END
  ),
  model_id = COALESCE(model_id,
    CASE
      WHEN lower(engine) LIKE '%codex%' OR lower(engine) LIKE '%openai%' THEN 'gpt-5.3-codex'
      WHEN lower(engine) LIKE '%gemini%' OR lower(engine) LIKE '%google%' THEN 'gemini-3-pro-preview'
      WHEN lower(engine) LIKE '%qwen%' THEN 'qwen3-coder-plus'
      ELSE 'sonnet'
    END
  );

UPDATE messages
SET
  lane = COALESCE(lane, 'native'),
  runtime_id = COALESCE(runtime_id,
    CASE
      WHEN lower(engine) LIKE '%codex%' OR lower(engine) LIKE '%openai%' THEN 'codex-native'
      WHEN lower(engine) LIKE '%gemini%' OR lower(engine) LIKE '%google%' THEN 'gemini-native'
      WHEN lower(engine) LIKE '%qwen%' THEN 'qwen-native'
      ELSE 'claude-native'
    END
  ),
  provider_id = COALESCE(provider_id,
    CASE
      WHEN lower(engine) LIKE '%codex%' OR lower(engine) LIKE '%openai%' THEN 'openai'
      WHEN lower(engine) LIKE '%gemini%' OR lower(engine) LIKE '%google%' THEN 'google'
      WHEN lower(engine) LIKE '%qwen%' THEN 'qwen'
      ELSE 'anthropic'
    END
  ),
  model_id = COALESCE(model_id,
    CASE
      WHEN lower(engine) LIKE '%codex%' OR lower(engine) LIKE '%openai%' THEN 'gpt-5.3-codex'
      WHEN lower(engine) LIKE '%gemini%' OR lower(engine) LIKE '%google%' THEN 'gemini-3-pro-preview'
      WHEN lower(engine) LIKE '%qwen%' THEN 'qwen3-coder-plus'
      ELSE 'sonnet'
    END
  );
