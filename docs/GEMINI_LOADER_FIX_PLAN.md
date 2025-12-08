# 🔧 Piano di Fix: Gemini Chat Loader

**Progetto:** NexusCLI
**Componente:** `lib/server/services/cli-loader.js`
**Problema:** Caricamento sessioni Gemini fallisce completamente
**Priorità:** 🔴 ALTA
**Complessità:** ⚙️ MEDIA
**Tempo stimato:** 30-45 minuti

---

## 📋 Executive Summary

Il modulo `CliLoader` per Gemini in NexusCLI non riesce a caricare le chat perché:
1. **Cerca nel path sbagliato** (`~/.gemini/sessions/` invece di `~/.gemini/tmp/<HASH>/chats/`)
2. **Usa l'ID sbagliato** (UUID completo invece di short hash nei filename)
3. **Usa il formato sbagliato** (parser JSONL invece di JSON standard)

---

## 🔍 Root Cause Analysis Verificata

### ❌ Problema 1: Path Mismatch

**Codice attuale (riga 292):**
```javascript
const sessionFile = path.join(this.geminiPath, 'sessions', `${sessionId}.jsonl`);
```

**Path cercato:**
```
~/.gemini/sessions/ef937a63-814d-43c0-88d3-f7a6722f33b2.jsonl
```

**Path effettivo:**
```
~/.gemini/tmp/be36aa850ed33336ee9b50e53a9026eb7feb9c91da12c0a4057f4cc20da851ec/chats/session-2025-12-05T11-14-ef937a63.json
```

**Evidenza:**
```bash
$ ls -la ~/.gemini/sessions/
ls: cannot access '/data/data/com.termux/files/home/.gemini/sessions/': No such file or directory

$ ls ~/.gemini/tmp/*/chats/ | head -5
session-2025-11-12T09-44-2f32182a.json
session-2025-11-18T12-55-8d582aea.json
session-2025-11-19T13-45-c2b0dd60.json
session-2025-11-27T19-16-c31127d4.json
session-2025-11-27T19-25-56085008.json
```

---

### ❌ Problema 2: ID Mismatch

**NexusCLI passa:** `sessionId = "ef937a63-814d-43c0-88d3-f7a6722f33b2"` (UUID completo)

**Gemini salva come:** `session-2025-12-05T11-14-ef937a63.json`
- Formato: `session-<ISO_DATE>-<SHORT_HASH>.json`
- Short hash: primi 8 caratteri dell'UUID (`ef937a63`)

**Codice attuale (riga 77):**
```javascript
case 'gemini':
  result = await this.loadGeminiMessages({ sessionId, limit, before, mode });
  break;
```

**Problema:** Non passa il `nativeId` (short hash), quindi il loader non può costruire il filename corretto.

---

### ❌ Problema 3: Formato File Mismatch

**Parser attuale (riga 300):**
```javascript
const rawMessages = await this._parseJsonlFile(sessionFile);
```

**Formato atteso dal parser:**
```jsonl
{"type":"user","content":"..."}
{"type":"gemini","content":"..."}
```

**Formato effettivo Gemini:**
```json
{
  "sessionId": "ef937a63-814d-43c0-88d3-f7a6722f33b2",
  "projectHash": "be36aa850ed33336ee9b50e53a9026eb7feb9c91da12c0a4057f4cc20da851ec",
  "startTime": "2025-12-05T11:17:21.804Z",
  "lastUpdated": "2025-12-05T12:05:18.661Z",
  "messages": [
    {
      "id": "c2fbecb5-6c4a-43ee-a12e-ab3085faf206",
      "timestamp": "2025-12-05T11:17:21.805Z",
      "type": "user",
      "content": "..."
    },
    {
      "id": "d9262668-550e-4c63-bb62-403ce439273d",
      "timestamp": "2025-12-05T11:17:26.756Z",
      "type": "gemini",
      "content": "...",
      "thoughts": [...],
      "tokens": {...},
      "model": "gemini-3-pro-preview",
      "toolCalls": [...]
    }
  ]
}
```

**Conseguenza:** Anche se il file venisse trovato, `_parseJsonlFile()` fallirebbe o produrrebbe dati corrotti.

---

## 🛠️ Soluzione: 3-Step Fix

### Step 1: Passare `nativeId` al metodo Gemini

**File:** `lib/server/services/cli-loader.js`
**Riga:** 76-78

**Modifica:**
```javascript
case 'gemini':
  result = await this.loadGeminiMessages({ sessionId, nativeId, limit, before, mode });
  break;
```

**Rationale:** Il `nativeId` contiene il short hash necessario per trovare il file.

---

### Step 2: Implementare Discovery Dinamica del File

**File:** `lib/server/services/cli-loader.js`
**Metodo:** Aggiungere nuovo helper `findGeminiSessionFile()`
**Posizione:** Dopo `findCodexSessionFile()` (circa riga 285)

**Codice da aggiungere:**

```javascript
/**
 * Find Gemini session file by native ID (short hash)
 * Searches in ~/.gemini/tmp/<installation-hash>/chats/
 *
 * @param {string} nativeId - Short hash (first 8 chars of UUID)
 * @returns {string|null} - Full path to session file or null
 */
findGeminiSessionFile(nativeId) {
  const tmpDir = path.join(this.geminiPath, 'tmp');

  if (!nativeId || !fs.existsSync(tmpDir)) {
    return null;
  }

  try {
    // Extract short hash from nativeId (first 8 chars if UUID, or use as-is)
    const shortHash = nativeId.length > 8 ? nativeId.substring(0, 8) : nativeId;

    // Scan all installation hash directories
    const installations = fs.readdirSync(tmpDir);

    for (const installHash of installations) {
      const chatsDir = path.join(tmpDir, installHash, 'chats');

      if (!fs.existsSync(chatsDir)) continue;

      // List all session files
      const files = fs.readdirSync(chatsDir);

      // Find file matching pattern: session-*-<shortHash>.json
      for (const file of files) {
        if (file.endsWith(`-${shortHash}.json`)) {
          return path.join(chatsDir, file);
        }
      }
    }
  } catch (err) {
    console.warn(`[CliLoader] Failed to search Gemini session file: ${err.message}`);
  }

  return null;
}
```

**Rationale:**
- Gemini salva in directory dinamiche basate su installation hash
- Il filename contiene timestamp + short hash: `session-2025-12-05T11-14-ef937a63.json`
- Dobbiamo scansionare tutte le directory `tmp/*` e cercare il file con suffix `-<shortHash>.json`

---

### Step 3: Riscrivere `loadGeminiMessages` per JSON Standard

**File:** `lib/server/services/cli-loader.js`
**Metodo:** `loadGeminiMessages()`
**Righe:** 291-308

**Codice da sostituire:**

```javascript
async loadGeminiMessages({ sessionId, nativeId, limit, before, mode }) {
  // Use nativeId (short hash) to find the file
  const shortHash = nativeId
    ? (nativeId.length > 8 ? nativeId.substring(0, 8) : nativeId)
    : (sessionId.length > 8 ? sessionId.substring(0, 8) : sessionId);

  const sessionFile = this.findGeminiSessionFile(shortHash);

  // Gemini CLI may not save sessions - check if file exists
  if (!sessionFile || !fs.existsSync(sessionFile)) {
    console.log(`[CliLoader] Gemini session file not found (id=${shortHash})`);
    return this._emptyResult();
  }

  // Parse JSON file (NOT jsonl!)
  let sessionData;
  try {
    const fileContent = fs.readFileSync(sessionFile, 'utf8');
    sessionData = JSON.parse(fileContent);
  } catch (err) {
    console.error(`[CliLoader] Failed to parse Gemini session file: ${err.message}`);
    return this._emptyResult();
  }

  // Extract messages array from session object
  const rawMessages = Array.isArray(sessionData)
    ? sessionData
    : (sessionData.messages || []);

  // Filter and normalize
  const messages = rawMessages
    .filter(entry => entry.type === 'user' || entry.type === 'gemini')
    .map(entry => this._normalizeGeminiEntry(entry));

  return this._paginateMessages(messages, limit, before, mode);
}
```

**Modifiche chiave:**
1. Usa `nativeId` invece di `sessionId` per il lookup
2. Chiama `findGeminiSessionFile()` invece di costruire path hardcoded
3. Usa `fs.readFileSync()` + `JSON.parse()` invece di `_parseJsonlFile()`
4. Gestisce struttura `{messages: [...]}` invece di array piatto
5. Filtra solo messaggi `type: 'user'` o `type: 'gemini'`

---

### Step 4 (Opzionale): Aggiornare `_normalizeGeminiEntry`

**File:** `lib/server/services/cli-loader.js`
**Metodo:** `_normalizeGeminiEntry()`
**Righe:** 313-342

**Verifica campi aggiuntivi da mappare:**
- ✅ `entry.type` → `'user'` o `'gemini'` (già mappato come `'assistant'`)
- ✅ `entry.content` → testo del messaggio
- ✅ `entry.timestamp` → timestamp ISO
- 🆕 `entry.model` → modello usato (es. `'gemini-3-pro-preview'`)
- 🆕 `entry.thoughts` → array di thinking process (Gemini 3+)
- 🆕 `entry.tokens` → contatori token (input/output/cached/thoughts)
- 🆕 `entry.toolCalls` → chiamate funzioni

**Codice aggiornato (opzionale ma consigliato):**

```javascript
_normalizeGeminiEntry(entry) {
  // Gemini uses 'gemini' instead of 'assistant'
  const role = entry.type === 'gemini' ? 'assistant' : (entry.type || 'assistant');
  const created_at = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now();

  // Gemini content format
  let content = '';
  if (typeof entry.content === 'string') {
    content = entry.content;
  } else if (Array.isArray(entry.parts)) {
    // Gemini API uses parts array: [{text: '...'}]
    content = entry.parts
      .filter(p => p.text)
      .map(p => p.text)
      .join('\n');
  } else if (entry.text) {
    content = entry.text;
  }

  return {
    id: entry.id || `gemini-${created_at}`,
    role,
    content,
    engine: 'gemini',
    created_at,
    metadata: {
      model: entry.model,
      tokens: entry.tokens,  // Contatori token (input/output/cached/thoughts)
      thoughts: entry.thoughts,  // Thinking process (Gemini 3+)
      toolCalls: entry.toolCalls  // Tool usage tracking
    }
  };
}
```

---

## ✅ Testing Plan

### Test 1: File Discovery

```bash
# Verificare che findGeminiSessionFile() trovi il file corretto
node -e "
const CliLoader = require('./lib/server/services/cli-loader.js');
const loader = new CliLoader();
const file = loader.findGeminiSessionFile('ef937a63');
console.log('Found:', file);
"
```

**Expected output:**
```
Found: /data/data/com.termux/files/home/.gemini/tmp/be36aa850ed33336ee9b50e53a9026eb7feb9c91da12c0a4057f4cc20da851ec/chats/session-2025-12-05T11-14-ef937a63.json
```

---

### Test 2: Message Loading

```bash
# Caricare messaggi da sessione esistente
node -e "
const CliLoader = require('./lib/server/services/cli-loader.js');
const loader = new CliLoader();
loader.loadMessagesFromCLI({
  sessionId: 'ef937a63-814d-43c0-88d3-f7a6722f33b2',
  nativeId: 'ef937a63',
  engine: 'gemini',
  limit: 10
}).then(result => {
  console.log('Messages loaded:', result.messages.length);
  console.log('First message:', result.messages[0]);
});
"
```

**Expected output:**
```
Messages loaded: 10
First message: {
  id: 'c2fbecb5-6c4a-43ee-a12e-ab3085faf206',
  role: 'user',
  content: 'Ciao leggi /Dev/gemini-cli-termux/GEMINI_TEST_SUITE.md...',
  engine: 'gemini',
  created_at: 1733396241805,
  metadata: { model: undefined, tokens: undefined, ... }
}
```

---

### Test 3: Integration Test (NexusCLI UI)

1. **Avviare NexusCLI server:**
   ```bash
   cd ~/Dev/NexusCLI
   npm start
   ```

2. **Aprire UI e caricare chat Gemini esistente**

3. **Verificare:**
   - ✅ Lista sessioni mostra chat Gemini
   - ✅ Click su sessione carica messaggi
   - ✅ Messaggi visualizzati correttamente con role/content/timestamp
   - ✅ Metadata (model, tokens, thoughts) disponibili

---

## 📝 Checklist Implementazione

### Pre-implementazione
- [x] ✅ Analisi root cause completata
- [x] ✅ Struttura file Gemini verificata
- [x] ✅ Piano di fix documentato
- [ ] ⏳ Backup del file `cli-loader.js` corrente

### Implementazione
- [ ] ⏳ **Step 1:** Aggiungere `nativeId` al case 'gemini' (riga 77)
- [ ] ⏳ **Step 2:** Implementare `findGeminiSessionFile()` (dopo riga 285)
- [ ] ⏳ **Step 3:** Riscrivere `loadGeminiMessages()` (righe 291-308)
- [ ] ⏳ **Step 4 (opzionale):** Aggiornare `_normalizeGeminiEntry()` (righe 313-342)

### Testing
- [ ] ⏳ Test 1: File discovery (findGeminiSessionFile)
- [ ] ⏳ Test 2: Message loading (loadMessagesFromCLI)
- [ ] ⏳ Test 3: Integration test (NexusCLI UI)

### Post-implementazione
- [ ] ⏳ Commit con messaggio descrittivo
- [ ] ⏳ Aggiornare CHANGELOG.md
- [ ] ⏳ Testare su 3+ sessioni Gemini diverse

---

## 🔄 Rollback Plan

**Se il fix causa problemi:**

1. **Ripristinare backup:**
   ```bash
   cd ~/Dev/NexusCLI
   cp lib/server/services/cli-loader.js.backup lib/server/services/cli-loader.js
   ```

2. **Verificare che le chat Claude/Codex funzionino ancora:**
   ```bash
   npm test  # Se esiste test suite
   ```

3. **Segnalare issue con logs:**
   ```bash
   tail -f logs/server.log  # Se esiste logging
   ```

---

## 📚 Riferimenti

- **Analisi bug originale:** Gemini self-diagnosis document
- **Codice corrente:** `lib/server/services/cli-loader.js`
- **Esempio sessione Gemini:** `~/.gemini/tmp/*/chats/session-2025-12-05T11-14-ef937a63.json`
- **Gemini CLI source:** Public gemini-cli repository

---

## ⚠️ Note per il Worker

1. **Non improvvisare:** Segui il piano step-by-step
2. **Testa dopo ogni step:** Verifica che non rompa Claude/Codex loader
3. **Mantieni compatibilità:** `_parseJsonlFile()` deve restare per Claude/Codex
4. **Logging:** Aggiungi console.log utili per debugging
5. **Error handling:** Gestisci gracefully file non trovati o malformati

---

**Creato:** 2025-12-08
**Autore:** Project Team (analisi) + Gemini 3 Pro (diagnosi originale)
**Status:** ✅ PRONTO PER IMPLEMENTAZIONE
**Stimato effort:** 30-45 min
