/**
 * nexuscli api - Manage API keys for AI providers
 *
 * Usage:
 *   nexuscli api list              - List configured providers
 *   nexuscli api set <provider> <key>  - Set API key
 *   nexuscli api delete <provider>     - Delete API key
 *
 * Providers:
 *   - deepseek   (DeepSeek Chat/Reasoner)
 *   - openai     (GPT models)
 *   - anthropic  (Claude models - usually via OAuth)
 */

const { initDb, setApiKey, deleteApiKey, listApiKeyProviders, getApiKey } = require('../server/db');

const SUPPORTED_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    description: 'DeepSeek Chat & Reasoner models',
    keyFormat: 'sk-*',
    url: 'https://platform.deepseek.com/api_keys'
  },
  openai: {
    name: 'OpenAI',
    description: 'GPT-4, STT/TTS (Whisper)',
    keyFormat: 'sk-*',
    url: 'https://platform.openai.com/api-keys'
  },
  openrouter: {
    name: 'OpenRouter',
    description: 'Multi-provider gateway',
    keyFormat: 'sk-or-*',
    url: 'https://openrouter.ai/keys'
  },
  zai: {
    name: 'Z.ai',
    description: 'GLM-4.6 (Chinese/English Multilingual)',
    keyFormat: 'starts with alphanumeric + dot',
    url: 'https://z.ai'
  }
};

async function apiCommand(action, provider, key) {
  // Initialize database
  await initDb({ skipMigrationCheck: true });

  if (!action || action === 'list') {
    // List configured providers
    const providers = listApiKeyProviders();

    console.log('\n🔑 Configured API Keys:\n');

    if (providers.length === 0) {
      console.log('  No API keys configured.\n');
      console.log('  To add a key:');
      console.log('    nexuscli api set deepseek sk-your-api-key\n');
    } else {
      providers.forEach(p => {
        const info = SUPPORTED_PROVIDERS[p.provider] || { name: p.provider };
        const date = new Date(p.updated_at).toLocaleDateString();
        console.log(`  ✅ ${info.name || p.provider} (${p.provider})`);
        console.log(`     Updated: ${date}\n`);
      });
    }

    console.log('Supported providers:');
    Object.entries(SUPPORTED_PROVIDERS).forEach(([id, info]) => {
      const configured = providers.find(p => p.provider === id) ? '✅' : '⬚';
      console.log(`  ${configured} ${id.padEnd(12)} - ${info.description}`);
    });
    console.log('');
    process.exit(0);
  }

  if (action === 'set') {
    if (!provider || !key) {
      console.error('\n❌ Usage: nexuscli api set <provider> <key>\n');
      console.log('Example:');
      console.log('  nexuscli api set deepseek sk-7cb389cf4f8d421a977d9ec5daf7457b\n');
      process.exit(1);
    }

    const providerLower = provider.toLowerCase();
    const info = SUPPORTED_PROVIDERS[providerLower];

    if (!info) {
      console.error(`\n❌ Unknown provider: ${provider}`);
      console.log('\nSupported providers:');
      Object.keys(SUPPORTED_PROVIDERS).forEach(p => console.log(`  - ${p}`));
      console.log('');
      process.exit(1);
    }

    // Basic key validation
    if (key.length < 10) {
      console.error('\n❌ API key seems too short. Please check and try again.\n');
      process.exit(1);
    }

    const success = setApiKey(providerLower, key);

    if (success) {
      console.log(`\n✅ ${info.name} API key saved successfully!\n`);
      console.log(`   Provider: ${providerLower}`);
      console.log(`   Key: ${key.substring(0, 8)}${'*'.repeat(key.length - 12)}${key.slice(-4)}\n`);
      process.exit(0);
    } else {
      console.error('\n❌ Failed to save API key. Check database.\n');
      process.exit(1);
    }
  }

  if (action === 'delete' || action === 'remove') {
    if (!provider) {
      console.error('\n❌ Usage: nexuscli api delete <provider>\n');
      process.exit(1);
    }

    const providerLower = provider.toLowerCase();
    const success = deleteApiKey(providerLower);

    if (success) {
      console.log(`\n✅ API key for ${providerLower} deleted.\n`);
      process.exit(0);
    } else {
      console.error(`\n❌ Failed to delete API key for ${providerLower}.\n`);
      process.exit(1);
    }
  }

  if (action === 'test') {
    if (!provider) {
      console.error('\n❌ Usage: nexuscli api test <provider>\n');
      process.exit(1);
    }

    const providerLower = provider.toLowerCase();
    const apiKey = getApiKey(providerLower);

    if (!apiKey) {
      console.error(`\n❌ No API key configured for ${providerLower}`);
      console.log(`\n   Run: nexuscli api set ${providerLower} <your-key>\n`);
      process.exit(1);
    }

    console.log(`\n🔑 ${providerLower} API key found: ${apiKey.substring(0, 8)}...${apiKey.slice(-4)}\n`);
    // TODO: Add actual API test call
    process.exit(0);
  }

  // Unknown action
  console.error(`\n❌ Unknown action: ${action}`);
  console.log('\nUsage:');
  console.log('  nexuscli api list              - List configured providers');
  console.log('  nexuscli api set <provider> <key>  - Set API key');
  console.log('  nexuscli api delete <provider>     - Delete API key');
  console.log('  nexuscli api test <provider>       - Test API key\n');
  process.exit(1);
}

module.exports = apiCommand;
