-- Seed default tab templates for all existing users
-- This ensures templates are available immediately without requiring users to open the Create Tab dialog

INSERT INTO tab_templates (
  id,
  user_id,
  name,
  icon,
  command,
  args,
  description,
  exit_on_close,
  sort_order,
  is_built_in,
  required_tech_stack,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid() as id,
  u.id as user_id,
  t.name,
  t.icon,
  t.command,
  t.args::jsonb,
  t.description,
  t.exit_on_close,
  t.sort_order,
  true as is_built_in,
  t.required_tech_stack,
  NOW() as created_at,
  NOW() as updated_at
FROM users u
CROSS JOIN (
  SELECT 'Claude' as name, 'claude' as icon, 'claude' as command, '[]' as args, 'Anthropic AI coding assistant' as description, true as exit_on_close, 0 as sort_order, 'claude' as required_tech_stack
  UNION ALL
  SELECT 'Gemini', 'gemini', 'gemini', '[]', 'Google AI assistant', true, 1, 'gemini'
  UNION ALL
  SELECT 'Codex', 'codex', 'codex', '[]', 'OpenAI coding assistant', true, 2, 'codex'
  UNION ALL
  SELECT 'Copilot', 'copilot', 'gh copilot', '[]', 'GitHub AI pair programmer', true, 3, 'copilot'
  UNION ALL
  SELECT 'Mistral Vibe', 'mistral', 'vibe', '[]', 'Mistral AI coding agent', true, 4, 'mistral'
  UNION ALL
  SELECT 'Cody', 'cody', 'cody', '[]', 'Sourcegraph AI code assistant', true, 5, 'cody'
  UNION ALL
  SELECT 'OpenCode', 'opencode', 'opencode', '[]', 'Open-source AI coding agent', true, 6, 'opencode'
  UNION ALL
  SELECT 'Terminal', 'terminal', '/bin/bash', '[]', 'Free terminal session', false, 99, NULL
) t
WHERE NOT EXISTS (
  SELECT 1 FROM tab_templates tt
  WHERE tt.user_id = u.id
    AND tt.command = t.command
    AND tt.is_built_in = true
);
