# Session Loading & TRI CLI Alignment

- **Data:** 2025-12-10
- **Autore:** Codex (GPT-5.1 Codex)
- **Status:** Draft (pre-implementazione)

## Obiettivo
Uniformare il comportamento di caricamento sessioni per Claude, Codex e Gemini, eliminare l'auto-load indesiderato, distinguere le sessioni per engine e garantire continuità nativa sullo stesso engine e bridge contestuale sugli switch.

## Scope
- Frontend
  - Rimuovere auto-selezione sessione su cambio workspace; mantenere welcome screen finché l'utente non sceglie una sessione o invia il primo messaggio.
  - Mostrare icone/colori per engine in sidebar (Claude/Codex/Gemini).
- Backend
  - ConversationId stabile cross-engine; ogni engine usa il proprio sessionId ma con la stessa conversationId.
  - Resume nativo stesso engine (Claude -r, Codex exec resume, Gemini --resume) usando session_path.
  - Engine switch: creazione nuova sessione del nuovo engine con prompt bridged (summary/history) della sessione precedente.
  - Aggiornare last_used_at e message_count per tutti gli engine; indicizzazione Codex/Gemini via DB fallback (FS solo se dati affidabili).

## Perché ora
- Auto-load porta l'utente dentro sessioni sbagliate.
- Codex/Gemini non compaiono o risultano fuori ordine.
- Serve continuità tra engine diversi senza perdere contesto, conforme alla strategia TRI CLI.

## Piano sintetico
1. Backend: adattare session-manager, Message model, router chat/codex/gemini, context-bridge, workspace-manager (indicizzazione multi-engine) e cli-loader se necessario per metadata.
2. Frontend: rimuovere auto-load, reset stato su cambio workspace, icone engine sidebar.
3. Test manuali: resume stesso engine, switch engine con bridge, cambio workspace, render icone/ordinamento.

## Rischi / note
- File Codex assenti su questo host: useremo DB come fonte primaria.
- File Gemini senza `cwd`: import solo per sessioni create via NexusCLI (DB).
- Prestazioni: evitare scan profondo .gemini; limitare o usare cache.

## Test previsti
- Resume Claude/Codex/Gemini con stessa engine (storico completo).
- Switch Claude→Codex, Codex→Gemini, Gemini→Claude con bridge generato.
- Cambio workspace: resta su welcome finché non si seleziona sessione.
- Sidebar mostra icone e colori corretti.
