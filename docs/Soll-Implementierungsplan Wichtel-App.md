---
title: "Soll-Implementierungsplan Wichtel-App"
date: "2026-11-12"
document_type: "Technischer Soll-Implementierungsplan"
target_state: "Zielbild; keine Statusbeschreibung des aktuellen Prototyps"
repository: "https://github.com/LeanScope/angular-example-3d-voice-chat"
purpose: >-
   Eigenständig lesbare Arbeitsanweisung zum Neuaufsetzen der App im Main-Repo,
   ohne den lokalen Voice-Prototyp oder dessen bisherige Änderungen vorauszusetzen.
basis:
   structure: "Implementierungsplan.md"
   corrections: "Thomas: can-you-please-revise-synchronous-waterfall.md, Teil A und B"
scope:
   angular_leanscope_team: "Abschnitte 1-8: App und LeanScope-Modellierung"
   agent_server_team: "Abschnitt 9: Erweiterungen im eigenen Agent-Server-Repository"
publication: "Vom Nutzer zur Veröffentlichung im eigenen Fork freigegeben"
do_not_commit: false
do_not_publish: false
---
# Soll-Implementierungsplan Wichtel-App

Technischer Sollzustand zum Neuaufsetzen im Main-Repo. Stand: 12.11.2026.
Dieses Dokument beschreibt das Zielbild, nicht den Umsetzungsstand des aktuellen Prototyps.

## 1. Ziel

Baue eine deutschsprachige Web-App auf Basis von
`https://github.com/LeanScope/angular-example-3d-voice-chat`. Die Person scannt einen
QR-Code auf einer Weihnachtskarte und spricht im **Push-to-Talk-/Walkie-Talkie-Stil**
mit einem mittig dargestellten **3D-Weihnachtswichtel**. Three.js rendert den Wichtel
im Browser; eine LeanScope-Choreo steuert das Gespräch.

Die technische Strecke lautet: Aufnahme im Browser -> **Agent Server mit ElevenLabs
STT -> Mistral -> ElevenLabs TTS mit Persona-Stimme** -> Audio per SSE zurück zum
Browser. Es gibt **kein eigenes Backend/BFF und keinen Realtime-Call**.

Die Person kann jederzeit den verfügbaren Textmodus statt Sprache verwenden. Der
Wichtel fragt nach, wartet auf Antworten und merkt sich die benötigten Angaben in
Inventory-Slots. Erst nach geklärtem Termininteresse und einem Abschied endet das
Gespräch. Ein Name wie „Mara“ ist ausschließlich Platzhalter, keine Nutzeridentität.

## 2. Ausgangslage, Projektregeln und Werkzeuge

- **Arbeite im Main-Repo** `angular-example-3d-voice-chat`. Kein neues Angular-Projekt,
   kein zusätzlicher Fork und kein automatischer Branch-/Merge-/Commit-Schritt.
- **Bestandsaufnahme zuerst:** Prüfe `git status`, `git log`, `package.json`,
   `angular.json`, `AGENTS.md` und `CLAUDE.md`. Vorhandene Arbeit erhalten und passende
   Bausteine erweitern. Nicht davon ausgehen, dass spätere Prototyp-Dateien existieren.
- **Template-Basis:** Prüfe `src/app/leanscope/` auf `LeanScopeSessionService`,
   `agent-server.types.ts`, `sse-parser`, `answer-fields`, `ls-transcript` und
   `ls-pending-step-form`. Die bisherigen Home-/Session-Seiten unter `src/app/pages/`
   dienen als Referenz; App-Features kommen nach `src/app/features/`.
- **Angular:** Angular 22, standalone, zoneless, Signals, `OnPush`, `inject()`,
   `input()`/`output()`, `@if`/`@for` und reaktive Formulare. Keine UI-Bibliothek ohne
   Auftrag. Deutsche Texte und Wichtel-Logik bleiben auf Feature-Ebene.
- **Session-Zugriff:** REST und SSE ausschließlich über den generischen
   `LeanScopeSessionService`. Kein zweiter Voice-Session-Service mit eigener Pipeline.
   MCP dient nur der Entwicklung/Modellierung, niemals der laufenden Browser-App.
- **Zielstruktur:** `features/voice/` für Gesprächsseite, Aufnahme und Wiedergabe;
   `features/character/` für CharacterConfig, Mapper, Three.js und Mundsteuerung;
   Routen in `src/app/app.routes.ts`. Bestehende geeignete Dateien wiederverwenden.
- **Abhängigkeiten:** Zuerst `npm install`, `npm test -- --watch=false` und
   `npm run build`. Falls noch nicht vorhanden: Three.js installieren und passende
   Typen ergänzen. `three` und `GLTFLoader` dynamisch laden; initiales Bundle und
   Komponenten-Styles innerhalb der Budgets in `angular.json` halten.
- **LeanScope Agent Kit:** Zuerst `leanscope-quickstart` für Verbindung und Repository
   aus dem Token. Modelländerungen nur über `model-a-choreo`: Schema prüfen,
   Vorschau -> Anwenden -> Zurücklesen; nie `action: "UPDATE"`, Arrays vollständig
   erhalten. `run-a-choreo` für den späteren Laufzeittest. Fehlende Tools benennen.
- **Secrets:** `.env` nie öffnen, lesen, ausgeben oder ändern. Bei Bedarf zeigt
   `node scripts/sync-env.mjs` nur Namen/Status. Keine Schlüssel in Komponenten,
   Tests, Build-Artefakten oder Commits. Vorhandene Secret-Bündelung des Starters
   ist keine Grundlage für den öffentlichen Kartenstart.
- **Versionierung:** Repository-Regeln für Paketversion und Release-Notizen bei
   tatsächlichen Implementierungs-/Release-Schritten beachten. Ein Planauftrag ist
   kein Commit-, Deployment- oder Versionsänderungsauftrag.

### Architekturprinzip für alle Phasen

Halte fünf Schichten getrennt: **Session/Persona, Audio, Zustands-Mapper,
Asset-Konfiguration und Rendering**. Der Avatar kennt keine Choreo und ruft keine
Session-Endpunkte auf.

`CharacterConfig` beschreibt Modell-URL, optionale Texturen, Skalierung/Ausrichtung,
Animationsnamen, Shader-Mundparameter, Blinksteuerung und Emotion->Clip-Zuordnung.
Die effektiven Ressourcenparameter der Persona liefern die Konfiguration. Namen von
Clips und modellspezifische Mundkoordinaten gehören in diese Konfiguration, nicht in
den Renderer. Die Stimme wird separat vom Agent Server aus der Persona aufgelöst;
der Browser wählt keine Voice-ID und erzeugt kein TTS.

## 3. Feste Vorgaben

1. **Einstieg:** Karten-QR ist ein direkter Link `https://<app>/?code=<sessionCode>`.
    Kein QR-Scanner in der App. Session erst nach bewusstem Start erstellen. Fehlender,
    unbekannter oder abgelaufener Code führt zu einem verständlichen Zustand.
2. **Look:** Centigrade-Gestaltung, weiße Schrift, blaue Controls, dunkler Hintergrund;
    Noi Grotesk, sofern als verwendbares Asset vorhanden, sonst definierter Fallback.
    Die später bestätigte UI gilt: „Dein Jahresrückblick“, Wichtel/Status/Startbutton
    zentriert, runder PTT-Button, auf Desktop nur Einleitungstext linksbündig.
3. **Sprache:** Deutsch. Persona-, Schritt-, Facet- und Ressourcentexte dürfen keinen
    festen Nutzernamen voraussetzen. Personenbezug erst nach tatsächlicher Angabe.
4. **Eingabe:** Halten -> `MediaRecorder` -> Loslassen -> rohe Audio-Bytes an
    `POST /api/v1/sessions/{token}/stt?language=de`. Server verwendet ElevenLabs Scribe,
    Modell `scribe_v2`. Kein Multipart-Upload vom Browser; Multipart ist Sache des
    serverseitigen ElevenLabs-Adapters. Text verwendet denselben Submit-Weg ohne STT.
5. **Dialog:** Transkript passend zum Schema des offenen Schritts an `/submit`
    senden. Mistral führt einen turn-basierten Slot-Dialog. Der Schritt bleibt bei
    Nachfragen `asking`, bis benötigte Slots geklärt sind. Ein Fragezeichen im Text
    allein erzeugt keinen menschlichen Eingabe-Turn. Schnelles Mistral Small/Medium
    prüfen; Magistral nicht als Standard für latenzarme Sprach-Turns einsetzen.
6. **Keine Realtime-Abhängigkeit:** OpenAI Realtime vom Gesprächsschritt **und** vom
    Szenario lösen. Kein OpenAI, kein Mistral Voice Agents SDK, keine kontinuierlich
    offene Mikrofonverbindung. Tatsächlichen STT-/TTS-Anbieter im Live-Test nachweisen.
7. **TTS:** Nach SSE-Verbindung `/tts {active:true}` senden, da natives TTS zunächst
    aus ist. Der Agent Server löst die Speech-Synthesis-/Voice-Ressource der Persona
    auf und sendet Satz-Chunks über `tts_audio`, danach `tts_audio_end`. Angular spielt
    sie geordnet ab. Keine zusätzliche lokale ElevenLabs-Pipeline.
8. **Schlüssel:** Der gehostete Agent Server hält LeanScope-Zugang und Anbieter-Keys.
    App erstellt Sessions über `POST /api/v1/sessions {sessionCode}` ohne Bearer und
    ohne Anbieter-Keys. Der zurückgegebene Session-Token autorisiert Session-Routen;
    auch diese Capability-URL nicht unnötig protokollieren oder weitergeben.
9. **Avatar:** Three.js im Browser. Modell aus Persona-Ressourcen im `actors`-Frame,
    Ressourcentyp über `kind` = 3D Model, Datei über `mimeType=model/gltf-binary`.
    Bis zur geprüften Auslieferung ist `public/wichtel-2026-03.glb` ein Fallback.
10. **Lipsync:** Primär Zeichen-Alignment des TTS-Chunks relativ zu dessen
      AudioContext-Abspielzeit, sekundär RMS vom tatsächlich abgespielten Audio.
      Mund per Shader/Material/Textur-Offset, keine Morph-Targets oder Jaw-Bones.
      Alignment liefert Timing, keine fertigen phonetischen Mundformen.
11. **Inhalt:** Die 18 Schritte des Soll-Szenarios sind die fachliche Referenz:
      Einstieg, Rückblick, berufliche Themen, KI, Herausforderung, Wunsch, optionaler
      Unternehmenskontext, passende Success Story, Zusammenfassung und Terminangebot.
      UI-Schritte nicht als unnötige Agent-Turns nachbauen. Bekannte Angaben nicht
      wiederholt erfragen; unklare Angaben nicht als beantwortet erfinden.
12. **Termin und Abschluss im MVP:** `appointment` als Ja/Nein-Slot für
   Termininteresse. Bei Ja den bestehenden Microsoft-Bookings-Link als klickbare
   Aktion anzeigen; die Person wählt und bucht ihren Termin selbst. Keine
   Verfügbarkeitsabfrage, Kontaktdatenerfassung oder automatische Buchung. Bei Nein
   keinen Terminlink anzeigen. Unklare Antworten nachfragen. Siehe Abschnitt 5.4.

## 4. LeanScope-Referenzen für die Umsetzung

Die IDs sind Referenzen des Xmas-Elf-Repositories, keine fest verdrahtete
Browserkonfiguration. Beim Neuaufsetzen mit dem eigenen MCP-Token prüfen, vorhandene
Datensätze wiederverwenden und keine Duplikate anlegen.

| Objekt | Referenz / Verwendung |
|---|---|
| Repository | `1677`, Xmas Elf; tatsächlichen Zugriff aus dem Token ermitteln. |
| Soll-Szenario | `550e8400-e29b-41d4-a716-446655440001`, Typ `ShouldBe`; unverändert lassen. Schritte `…440101` bis `…440118`; `…440115` Story-Check, `…440118` Terminabschluss. |
| Ausführbare Choreo | `cff8981b-8751-457b-a953-141255449f79`; vorhandenen Ablauf vor Umbau lesen. |
| Gesprächseinstieg | `5d3a635f-84a3-4700-a223-bde1ae723516`; dessen Beziehungen sowie Szenario-Beziehungen prüfen. |
| Persona | `550e8400-e29b-41d4-a716-446655440099`, Weihnachtswichtel. |
| Inventory | `4d47f62d-1f73-4b84-b96c-32b2a1cc0c9f`; Slots `challenge`, `wish2027`, `company`, `industry`, `appointment`. Firma/Branche optional. |
| Facet-Typ | `f20aa3bd-0b1a-4770-89f1-bd3b5bd0fa61`; Feldressourcen über `IS` typisieren. |
| STT | ElevenLabs Scribe, Hersteller ElevenLabs, Modell `scribe_v2`, Parameter `language=de`; vorhandene Ressource suchen, sonst korrekt modellieren. |
| TTS | ElevenLabs V3: `2c2e26e7-f062-4c91-9991-6db025123264`. |
| Stimme | Rupert: `164214c1-1f9d-4f23-8520-43f0d6a1afde`; effektive Voice-ID aus Ressource/Bindung prüfen, nicht aus App-Code. |
| Sprachmodell | Schnelle Mistral-Ressource suchen. Bisherige Magistral-Referenz `951f430d-442d-4661-a6e2-a97f102a0c5e` ist kein Zielmodell für die Sprachlatenz. |
| Avatar | `5bdd8325-e79f-49f7-9b26-0a171baa46c0`, Ressourcentyp 3D Model, an Persona binden. |
| GLB-Datei | `d7175cf0-12b1-45da-9f85-5761f66d2225`, `wichtel-2026-03.glb`, `model/gltf-binary`, 18,477,444 Bytes, `PUBLIC_DOWNLOADABLE`. |
| Slot-Opt-in | `slotDialogue=conversation`; verbindliche Parameter-GUID und Auflösung liefert das Agent-Server-Team (B2). Nicht selbst eine zweite Definition erfinden. |

- **Bookings-Link:** `https://bookings.cloud.microsoft/book/CentigradeMeeting@centigrade.de/s/DMT6H-2uT0-xpKu3CiELUQ2`.
- **Success-Story-Quelle:** `https://www.centigrade.de/de/projekte`. Kuratierten Bestand
   mit Titel, Kurzbeschreibung und offiziellem Direktlink verwenden; keine Treffer erfinden.
- **Agent Server:** `https://dev.api.agents.leanscope.ai`;
   Dokumentation `/api/v1/docs`, maschinenlesbar `/api/v1/openapi.json`.
- **Vorlagen im Agent-Server-Repository:** `ui/src/transport/agent-client.ts`,
   `ui/src/components/phone/use-push-to-talk.ts` (`transcriptKey`) und
   `ui/src/audio/tts-player.ts`. Bestehende Implementierungen spiegeln, keine zweite
   eigenständige Engine schreiben. Pfade beim Umsetzungsbeginn prüfen.

## 5. Voraussetzungen und technische Prüfungen

### 5.1 Stopp-Punkte vor der Integration

1. **Server-Release:** B1–B5 aus Abschnitt 9 sind deployed und vom Server-Team
    bestätigt. Vorher nur App-Phasen 0–2 und Avatar-Arbeit mit lokaler GLB bearbeiten.
    Einzelne vorhandene Endpunkte oder eine Versionsnummer ersetzen diese Freigabe nicht.
2. **Operator-Keys:** Betrieb bestätigt `MISTRAL_API_KEY`, `ELEVENLABS_API_KEY` und
    passenden LeanScope-Zugang am gehosteten Server. Keine Werte in Chat oder App.
3. **SessionCode:** Betrieb richtet den Kartencode in `~/.leanscope/session-codes.json`
    für Repository/Choreo aus Abschnitt 4 ein, **ohne `sessionScenarioGuid`**, damit
    jeder Scan eine frische Session erhält. Ablauf und Limits nach B5 setzen.
4. **Modell und Latenz:** Effektives Mistral-Modell am Szenario/Schritt prüfen.
    Kurze Antworten und frühe erste Audio-Chunks; Ziel unter drei Sekunden vom
    Loslassen bis zum ersten Audio. Messbedingungen im Abnahmeprotokoll festhalten.
5. **GLB:** Ressource -> `files_` mit echten Laufzeitberechtigungen prüfen. Öffentliche
    GLB über Session-Files-Route laden, ETag/Cache prüfen. Bei gescheitertem Datei-Spike
    stoppen und mit dem Server-Team klären; bis dahin lokaler GLB-Fallback.

Native STT-Route, TTS-Relay, Persona-Stimmenauflösung und SessionCode-Erstellung sind
laut Thomas' Ausgangsstand schon vorhanden. **Neu** sind insbesondere ElevenLabs
als STT-Anbieter, Slot-Dialog ohne Realtime, Alignment, Ressourcenmetadaten und Limits.
Beim Umsetzen aktuellen Stand prüfen, nichts davon nur wegen eines alten Dokuments
als fehlend oder fertig behandeln.

### 5.2 API-Verträge vor dem Anschluss prüfen

| Aufruf / Event | Erwarteter Vertrag |
|---|---|
| `POST /api/v1/sessions` | `{sessionCode}`; Antwort mit `controllerUrl` und Session-Token. Kein Credential-Zwang des bisherigen Template-Starts für diesen Pfad. |
| `GET {controllerUrl}/events` | SSE verbinden, Listener vor Freigabe des Gesprächs registrieren. Start-Gate-Unterstützung prüfen, damit die Begrüßung nicht vor aktiver TTS-Verbindung verloren geht. |
| `GET {controllerUrl}/steps/pending` | `asking`, `working` oder `ended`; bei `asking` offener Schritt mit GUID, `schema`, `fieldKeys`, `required`. |
| `POST {controllerUrl}/stt?language=de` | Rohes Audio, korrekter MIME-Typ; `{text}` zurück. V5-Limit 25 MB, tatsächlich ausgeliefertes Limit prüfen. |
| `POST {controllerUrl}/submit` | Text als schema-konforme Antwort. Schlüssel aus Pending-Schema ableiten, kein global festes `message` voraussetzen. |
| `POST {controllerUrl}/tts` | `{active:true}` nach SSE-Connect. TTS ist standardmäßig deaktiviert. |
| `tts_audio` | `{stepGuid,audioBase64,mimeType,alignment?}`; pro Satz/Chunk. |
| `alignment` | `{characters,character_start_times_seconds,character_end_times_seconds}`; Sekunden relativ zum Audio-Chunk. |
| `tts_audio_end` | `{stepGuid,chunks}`; gesamte Satzfolge geliefert, nicht automatisch bereits abgespielt. |
| `actors` | `{actors:[...]}`; Actor enthält optional `resources` mit effektiven Parametern und Dateien. |
| `inventory` | Aktuelle Slot-Werte/Zustände; genaue Hülle anhand der Server-Implementierung bestätigen. |
| `session_ending` | Endgrund, ggf. Fehlerdetails; Audio-Warteschlange vor UI-Abschluss ausspielen. |

Ressourcenvertrag aus B4:

```ts
interface PersonaResource {
   guid: string;
   name: string;
   kind: { guid: string; name: string };
   parameters: Record<string, string>;
   files: { guid: string; name: string; mimeType: string; url: string }[];
}
```

Dateipfad: `/api/v1/sessions/{token}/files/leanscope/{fileGuid}`. Relative URLs gegen
den Agent-Server-Origin auflösen, nicht gegen den Angular-Origin. Die OpenAPI des
Ausgangsstands nennt bei TTS teils `base64`/`audioUrl`, während der Hosted-Client
`audioBase64`/`mimeType` nutzt. Server-Team muss Vertrag und Fixture bestätigen;
keine geratenen Payload-Varianten implementieren.

### 5.3 Dialog und Darstellungssemantik

- Slot-Dialog ist **ein über mehrere Antworten offener Gesprächsschritt**, nicht
   eine Serie automatisch weiterlaufender Ausgabeschritte. `record_answer` aktualisiert
   Werte, `open_slots` nennt die offenen Angaben. Mehrere Slots pro Antwort und
   nachträgliche Korrekturen müssen funktionieren.
- Frühere Rückblickfragen bleiben Teil des fachlichen Gesprächsbogens, auch wenn sie
   keine der fünf Inventory-Angaben sind. Deren Instruktionen und Eingabe-Turns bei
   der Modellierung explizit berücksichtigen.
- Optional angefragte oder abgelehnte Angaben dürfen ohne Wert abgeschlossen werden.
   Nach einer tatsächlich gestellten Frage muss die Person trotzdem Gelegenheit zur
   Antwort erhalten. „Gefragt“ darf nicht mehrere unbeantwortete Fragen überspringen.
- `kind: review` mit `schema`, `data`, `note` ist nicht automatisch ein neuer
   Eingabe-Turn. Review-Daten getrennt darstellen, nie `Object.values(...).map(String)`
   als Nachricht verwenden. Ob etwas gefragt wird, entscheidet der Pending-Zustand.
- Wenn Schritte durchlaufen: Facet-Bindungen, Vorbelegung/erinnerte Werte, Inventory-
   Parameter und Engine-Pfad prüfen. Aus einem fehlenden Wartepunkt allein folgt nicht,
   dass eine Facet-Beziehung fehlt. Platzhalter auch in Facet-Texten und Ressourcen suchen.

### 5.4 Termin-Szenario im MVP: Link zur Selbstbuchung

1. Der Wichtel fasst das Gespräch zusammen und fragt, ob die Person mit Thomas einen
   Termin vereinbaren möchte. Die Frage muss einen echten Ja-/Nein-Eingabe-Turn öffnen.
2. Bei **Ja** zeigt der Wichtel den vorhandenen Bookings-Link als klickbare Aktion:
   `https://bookings.cloud.microsoft/book/CentigradeMeeting@centigrade.de/s/DMT6H-2uT0-xpKu3CiELUQ2`.
   Die Person wählt dort selbst einen freien Termin und schließt die Buchung ab.
3. Bei **Nein** verabschiedet sich der Wichtel freundlich, ohne den Terminlink
   einzublenden. Bei unklarer Antwort fragt er nach und wartet auf die Antwort.
4. Die App fragt nicht nach Name, E-Mail oder Telefonnummer und behauptet weder,
   einen freien Slot geprüft zu haben, noch, dass eine Buchung erfolgt sei.

Für diesen MVP sind weder Microsoft-Graph-Zugang noch ein Bookings-Connector,
zusätzliche Booking-Slots oder Schreibrechte erforderlich. Die Buchungsseite selbst
zeigt die aktuelle Verfügbarkeit. Eine spätere automatische Buchung ist ausdrücklich
aus dem MVP herausgenommen; siehe optionalen Ausbau B6 nach Abschnitt 9.

## 6. Phasen mit Abnahmekriterien

Die folgende Reihenfolge ist der Arbeitsplan für das **Angular-/LeanScope-Team**.
Sie beschreibt die Umsetzung von der Template-Basis aus, keine Liste bereits
erledigter Prototyp-Arbeiten. Geeignete vorhandene Bausteine jeweils wiederverwenden.

| # | Umsetzung | Abnahme |
|---|---|---|
| 0 | **Basis aufsetzen:** Repository-Regeln und Arbeitsbaum prüfen, Abhängigkeiten installieren, Template-Tests/Build laufen lassen, MCP verbinden und Repository-Zugriff ermitteln. Nur Namen fehlender Konfiguration anzeigen. | Ausgangsstand dokumentiert, Tests und Build grün; keine Secrets gelesen. |
| 1 | **LeanScope-Modell:** Soll-Szenario, ausführbare Choreo, Persona, Inventory und fünf Slot-Ressourcen lesen. Realtime-Kanten an Szenario und Schritt lösen. Scribe-Modell (`scribe_v2`, `language=de`) am Szenario, ElevenLabs V3/Rupert an Persona, schnelles Mistral anbinden. Slot-Opt-in nach bestätigter B2-GUID setzen. Dialogbogen und Abschlussinstruktion modellieren. | Vorschau -> Anwenden -> Zurücklesen; korrekte `IS`-Typisierung, keine Duplikate/Platzhalternamen. Slot-Opt-in nicht ohne bestätigten Vertrag aktivieren. |
| 2 | **Generischen Transport bauen:** `LeanScopeSessionService` um `transcribe(blob, language)` und `setTtsActive(active)` sowie typisierte Audio-/Actor-/Ending-Events in `onFrame` erweitern. Bestehende start/submit/pending- und allgemeine Frame-API erhalten. Alte Session-Antworten nach Stop/Neustart ignorieren. | Mock-Tests für HTTP-Body/MIME, Fehler, fragmentierte SSE-Frames, optionale Felder, unbekannte Events und Abmeldung. Keine Wichtel-Logik im Service. |
| 3 | **Gesprächsseite und PTT:** Feature-Route und bewussten Start erstellen. Für Entwicklung nach Server-Freigabe bereits den Code-Start aus Phase 9 verwenden, keine Keys im Browser überbrücken. `getUserMedia` -> MediaRecorder nur beim Halten, beim Loslassen Blob an `/stt`, gültiges Transkript an offenen Turn. `plain` = PTT, `structured` = reaktives Formular, `idle` = keine Eingabe. Transkript als Untertitel, Textfallback verfügbar. | Halten/Loslassen per Pointer und Tastatur; WebM/Opus und Safari-MP4; Mikro verweigert, Stille, Aufnahmegrenze, Abbruch, Retry und schema-konforme Antworten geprüft. |
| 4 | **Native Wiedergabe:** Start-Geste entsperrt AudioContext. Session-Gate/SSE/TTS-Aktivierung koordinieren, dann Gespräch freigeben. MP3-Chunks pro `stepGuid` in einer Queue abspielen; `tts_audio_end` beendet die Lieferung. Für MVP PTT während Audio sperren. Kein automatisches Ersetzen laufender Audioquelle durch nächsten Chunk. | Begrüßung und Rupert hörbar; geordnete lückenarme Wiedergabe, kein Replay alter Chunks bei Reconnect, leere Audiofolge/Fehler behandelt, letzte Antwort vor UI-Ende ausgespielt. |
| 5 | **Zustands-Mapper:** Die Übergänge nach dem Zustandsvertrag 6.1 implementieren. Session/Pending, echte Recorder- und Audio-Playback-Ereignisse auswerten; PTT-Halten und Textantwort unterscheiden. Blinzeln unabhängig vom Gesprächsturn takten, Emotion/Action erst bei bestätigtem Server-Event ergänzen. | Sequenztests für Sprache, Text, Playback-Ende, Pause, Abbruch, Session-Ende und verspätete Events; keine Timer/Animationen nach Zerstörung; Avatar kennt nur Zustände. |
| 6 | **Avatar-Runtime:** Three.js, GLTFLoader, Renderer, Licht, Kamera und AnimationMixer aufsetzen. CharacterConfig aus Actor-Ressource/GLB/Parametern erstellen; `idleClip`, `laughClip`, `mouthParam`, Emotion->Clip konfigurierbar. Relative Datei-URLs korrekt auflösen; lokale GLB als definierter Fallback. | Modell sichtbar, passend skaliert und zentriert; Idle/Laugh und Lade-/Fehlerzustände funktionieren auf Desktop/Mobil. Parameter nur an Avatar-Ressource bzw. ihrer `IS`-Bindung pflegen. |
| 7 | **Shader-Lipsync:** Geeignete Materialfläche und konfigurierbaren Mundparameter aufbauen. Shader-Maske mit animiertem Modell stabil halten, keine Knochen/Morphs ergänzen. Zeichen-/Vokal-Alignment an tatsächliche Chunkzeit koppeln, ohne Alignment RMS. Bei Pause/Fehler/Ende Mund schließen. | Sichtbar synchrone Mundbewegung, unveränderte übrige Materialdarstellung, Reduced Motion und Reset getestet. Grenzen dokumentiert. |
| 8 | **Success Story und Termin:** Kuratierte Projektliste integrieren, nur bei klarer Passung eine Story nennen. Terminablauf nach 5.4: Termininteresse erfragen; bei Ja ausschließlich den bestehenden Bookings-Link anzeigen, bei Nein ohne Link verabschieden. Die Person bucht selbst auf Microsoft Bookings. | Story-Treffer/kein Treffer, Termininteresse Ja/Nein/unklar, klickbarer Link nur bei Ja, keine erfundenen Termine oder Buchungsbestätigungen. |
| 9 | **Öffentlicher Betrieb:** `/?code=...` vollständig behandeln, Query-Parameter beim Routing erhalten. SessionRequest/Startvalidierung für Code-only erweitern, keine Browser-Keys voraussetzen. Fehlende/ungültige/abgelaufene/limitierte Codes behandeln. HTTPS-Hosting und Asset-Auslieferung prüfen; GLB ggf. Draco/Meshopt-komprimieren. `npm start` muss die Angular-App ohne eigenen Voice-Server starten. | Frische Session je Kartenaufruf, Betreiber-Limits greifen, keine Secrets im Bundle, mobiler HTTPS-Test erfolgreich. |
| 10 | **Gesamtabnahme:** Tests, Build und reale vollständige PTT-Gespräche mit beiden Termin-Zweigen. Anbieter, Stimme, Inventory-Werte, Endreason und Latenz pro Turn dokumentieren. | Kriterien aus Abschnitt 8 erfüllt; nicht nur einzelne Audio-Turns oder Unit-Tests grün. |

### 6.1 Zustands-Mapper-Vertrag

Der Mapper ist die einzige Stelle, die Session-/Audiozustände in Avatarzustände umsetzt.
`asking` und `working` sind Sessionzustände; sie sind nicht automatisch gleichbedeutend mit
`listening` oder `speaking`.

| Zustand | Eintritt | Austritt |
|---|---|---|
| `idle` | Noch keine aktive Session oder die Session ist beendet/abgebrochen. | Beim Start einer neuen Session nach `thinking`; nicht schon beim Öffnen der Texteingabe. |
| `listening` | PTT ist gehalten **und** der `MediaRecorder` läuft tatsächlich. | Beim Loslassen sofort zu `transcribing`/`thinking`; bei leerer oder verworfener Aufnahme zurück zum vorherigen Eingabezustand. Ein geöffnetes Textformular ist nicht `listening`. |
| `thinking` | Sessionstart, STT/Submit oder Agent-Verarbeitung nach akzeptierter Eingabe. Bleibt aktiv bis zur tatsächlichen Wiedergabe; ein `tts_audio`-Frame allein reicht nicht. | Zu `speaking` beim `play`-Ereignis des Audioelements; bei Eingabeaufforderung ohne Audio zu `asking`/`idle` nach Pending-Status. |
| `speaking` | Audio wird im Browser tatsächlich abgespielt. Bereits empfangene/gequeue-te TTS-Chunks zählen noch nicht als Wiedergabe. | Erst wenn `tts_audio_end` die Lieferung beendet **und** die Queue vollständig abgespielt ist. Danach `asking`, wenn der Server auf Eingabe wartet, sonst `thinking` oder `idle` bei Sessionende. |
| Pausiert | Nutzer drückt Pause: Audio pausieren, Eingabe sperren, weitere eintreffende TTS-Chunks puffern; Status „Pausiert“. | Fortsetzen startet dieselbe Audioposition/Queue weiter. Pausieren behauptet nicht, die Agent-Server-Generierung anzuhalten. |
| Abgebrochen | Nutzer bricht ab: Aufnahme verwerfen, Audio stoppen, Session schließen, Timer/Events der Session abmelden. | Terminaler UI-Zustand; verspätete Antworten der alten Session ignorieren. Transcript darf bis zum Neustart sichtbar bleiben. |

**Blinzeln:** Separater Timer, nicht an `listening`/`speaking` gekoppelt. Für den aktuellen
Avatar zufälliger Abstand von ca. 2,2–5,2 Sekunden und ca. 180 ms Blinkdauer; bei
`prefers-reduced-motion` deaktiviert. Alle Timer mit dem Avatar aufräumen.

**Emotion/Action:** Kein LLM-Text parsen und keine Aktion aus Formulierungen erraten. Erst
einen bestätigten strukturierten Agent-Server-Frame (z. B. `voice_direction`, falls für
das deployed Release vereinbart) in konfigurierte Emotion-/Clipnamen übersetzen. Bis dahin
bleibt die einfache Zustandsanimation aktiv.

**Priorität bei gleichzeitigen Ereignissen:** Abbruch/Sessionende > Pause > laufende
Wiedergabe > Aufnahme > Verarbeitung > Eingabebereitschaft. So können ein später SSE-Status
oder ein verspäteter HTTP-Response eine pausierte oder beendete Session nicht überschreiben.

Falls eine weitergehende dynamische Success-Story-Suche später nötig wird, zuerst
Auftrag und vorhandene Möglichkeiten prüfen. Ein eigener Worker ist **keine
Voraussetzung** für dieses MVP. Bei gesonderter Freigabe `write-a-worker` verwenden.

### Risiken

- STT + LLM + erster TTS-Chunk bestimmen die Sprachlatenz; Modell und Antwortlänge messen.
- iOS Safari benötigt passende Aufnahmeformate und nutzergestartetes Audio-Unlock.
- 18-MB-GLB, Audio und Rendering belasten Mobilgeräte; Ladezeit und Bildrate prüfen.
- Alignment steuert Timing, nicht die vollständige Artikulation eines Gesichts.
- Weitergegebene Karten-Codes erzeugen Kosten; Ablauf und Limits sind Betriebsanforderungen.
- Audio-Reconnect-/Replay-Semantik muss der Server verbindlich dokumentieren; ein
   lokaler SSE-Cursor aus einem anderen Prototyp ist dafür kein Nachweis.

## 7. Nicht im Umfang

Kein eigenes Backend/BFF und keine Implementierung der Server-Engine im Angular-Repo.
Kein OpenAI, kein Mistral Voice Agents SDK, kein Realtime-Call oder Freihandmodus im MVP.
Kein QR-Scanner in der App, kein Scraping der Bookings-Seite, keine Kalenderzugriffe
und keine automatische Buchung im MVP. Die Person bucht über den Link selbst.
Kein Live-Scraping, keine vorgerenderten/gestreamten Avatare und keine Morph-/Jaw-Lösung.
Soll-Szenario nicht verändern. TypeSafe bleibt zurückgestellt. Keine Keys im Browser.

## 8. Abnahme

`npm test -- --watch=false` und `npm run build` müssen im Angular-Repo grün sein.
Danach `npm start` und die App am ausgegebenen lokalen Port testen (üblicherweise
`http://localhost:4200`; belegte Ports nicht ungefragt beenden). Mikrofon auf echten
Mobilgeräten über HTTPS prüfen, nicht nur im Desktop-Emulator.

Ein kompletter Turn: **Halten -> Aufnahme -> Loslassen -> natives ElevenLabs-STT ->
schema-konformes Submit -> Mistral-Antwort -> native TTS-Chunks -> Wiedergabe mit
Shader-Mund -> nächste tatsächlich offene Eingabe**.

| Prüfung | Erwartung |
|---|---|
| Nachfragen und Schlussfragen | Jede noch unbeantwortete Frage hat einen offenen Turn; kein Durchlauf mehrerer Fragen bis `terminal`. |
| Slot-Dialog | Mehrere Slots pro Antwort, Korrekturen und unklare Angaben korrekt behandelt; keine erfundenen Werte. |
| Optionaler Kontext | Firma/Branche dürfen abgelehnt oder übersprungen werden; kein Wiederholungszwang. |
| Termininteresse Nein/Ja/unklar | Nein: kein Buchungslink. Ja: den bestehenden Microsoft-Bookings-Link als klickbare Aktion anzeigen. Unklarheit: echte Rückfrage. |
| Selbstbuchung | Die Person kann den Link öffnen und selbst ihren Termin in Bookings auswählen. Die App behauptet nicht, einen Slot geprüft oder gebucht zu haben. |
| Umfang | Keine Verfügbarkeitsabfrage, Kontaktdatenerfassung, Microsoft-Graph-Berechtigung oder automatische Buchung im MVP. |
| Ende | Abschied enthält keine neue Frage; Audio wird nicht abgeschnitten. Fehler/Ablauf sind kein erfolgreicher Gesprächsabschluss. |
| Review und Namen | Kein `[object Object]`, kein JSON-Schema in TTS, kein vorausgesetztes „Mara“. Alle Quellen der angezeigten Fragen prüfen. |
| Eingabe-/Verbindungsfehler | Mikro erlaubt/verweigert, Stille, STT-/TTS-Fehler, Doppelsubmit und Reconnect ohne Verlust oder Wiederholung behandelt. |
| Avatar und Audio | Desktop/Mobil nicht leer, korrekt eingerahmt, keine Überlagerungen, reale Audioansteuerung und Reduced Motion geprüft. |
| Kartenstart | Code-only, frische Session je Scan, HTTPS, Ablauf/Limitfehler und keine Secrets im Build. |

Protokolliere Server-Release, effektives Mistral-Modell, `[stt] elevenlabs`, Persona-
Stimme, Slot-Füllstand, Endreason und Turn-Latenzen. Ziel: unter drei Sekunden bis
zum ersten hörbaren Audio nach Loslassen; STT-, LLM-, TTS- und Browseranteil getrennt
messen. Keine Tokens, Keys oder unnötigen personenbezogenen Daten ins Protokoll.
Ein einzelner funktionierender Turn ist keine Abnahme des ganzen Gesprächs.

## 9. Agent-Server-Erweiterungen (Auftrag an das Server-Team)

Dieser Abschnitt entspricht Thomas' Teil B. Er wird **im Agent-Server-Repository**
umgesetzt, nicht als Ersatzbackend im Angular-Repo. Pfade und vorhandene Abstraktionen
vor Änderungen gegen den dortigen aktuellen `dev`-Stand prüfen.

### B0. Vorbereitung und Regression

Vor B2 einen Headless-Engine-Test mit Fake-LLM erstellen, der den bestehenden
Realtime-Slot- und Facet-Form-Ablauf festhält. Er muss während des Umbaus grün bleiben.
Arbeit im vorgesehenen Server-Branch `feat/xmas-elf-voice-turns` nach dortigem Workflow.
Für das Release die nächste freie Minor-Version verwenden (V5 nannte 0.151.0 bzw.
0.152.0, nicht blind übernehmen); Root- und UI-Paket gemeinsam aktualisieren.

### B1. ElevenLabs Scribe als STT-Anbieter

- `'elevenlabs'` in `src/stt/types.ts` zu `STTProvider`/`STT_PROVIDERS` ergänzen.
- `src/stt/elevenlabs-transcriber.ts` als `Transcriber` implementieren:
   `POST https://api.elevenlabs.io/v1/speech-to-text`, Multipart `file`,
   `model_id` (Standard `scribe_v2`), `language_code`; Header `xi-api-key`;
   Antwort `{text}`. Vorhandenen Multipart-Helfer nur bei passender Form wiederverwenden.
- Factory in `src/stt/stt-factory.ts` und Provider-Erkennung im
   `EquipmentResolver` erweitern; vorhandene ElevenLabs-TTS-Herstellerzuordnung nutzen.
- Tests: Multipart-Felder, Key-Header, Anbieterfehler -> `STTError`, Factory und
   Ressourcenauflösung. Die Browser-Route bleibt der vorhandene rohe `/stt`-Upload.

### B2. Turn-basierter Slot-Dialog ohne Realtime

- Inventory-Opt-in `slotDialogue: conversation | form`, Standard `form`, mit expliziter
   Parameter-GUID an der Inventory-Spezies deklarieren und zurücklesen. Keine Änderung
   eines verteilten Basistyps. GUID über `INVENTORY_PARAM_GUID` neben `slotFillingMode`
   auflösen und dem Angular-/Modellteam übergeben.
- `SlotConversationTransport` als gemeinsame Strategie: vorhandene
   `RealtimeSlotSession` und neue `TurnBasedSlotSession` unter
   `src/engine/slots/turn-based-slot-session.ts`.
- Transportneutrale Slot-Tools, SlotState und Abschlussinstruktionen nach
   `src/shared/slots/` verschieben, Re-Exports für bisherige Aufrufer erhalten.
   `buildSlotTools`, `derivePredefinedSlots`, `CLOSING_INSTRUCTION` und
   `KeyedSubmitFacade` wiederverwenden.
- Engine-Dispatch neben `tryStartRealtimeCall()` um `tryRunSlotConversationTurn()`
   ergänzen: Realtime -> Slot-Dialog -> erinnerte Facet -> normale Narration.
   Opt-in und kein Realtime Model bestimmen den neuen Pfad.
- Jedes menschliche `/submit` führt einen Mistral-Turn mit `record_answer` und
   `open_slots` aus. Werte ersetzen den aktuellen Slotwert; Antwort wird Persona-
   Nachricht und löst normales TTS aus. Bis zum Abschluss bleibt der Schritt
   `asking` mit Freitextschema, danach folgt Abschlussinstruktion und Transition.
- Optionale Slots (`company`, `industry`) nach Frage/Ablehnung ohne Zwang schließen;
   tatsächlichen Antwortturn nicht durch bloße Ausgabe überspringen. Max-Turns-
   Circuit-Breaker gemäß vorhandener Infinite-Loop-Strategie. Werte in `inventory`
   veröffentlichen. Bereits bekannte Werte dürfen keine unbeantwortbaren Reviews erzeugen.
- Tests: mehrere Slots pro Antwort, Korrektur, optionale Ablehnung, Abschluss,
   Terminentscheidung, Engine mit Fake-Toolcalls und unveränderte Bestandsregression.
   Dispatch-Dokumentation `docs/choreo-decision-strategy.md` aktualisieren.

### B3. ElevenLabs-Zeitstempel für TTS

- `ElevenLabsTtsSynthesizer` verwendet
   `/v1/text-to-speech/{voice}/with-timestamps` und liest
   `{audio_base64,alignment:{characters,character_start_times_seconds,character_end_times_seconds}}`.
- `SynthesisResult.alignment` optional ergänzen; `TtsAudioRelay` reicht es unverändert
   an `tts_audio` weiter. Andere Anbieter und bestehende Clients bleiben kompatibel.
- SSE-Schema in `src/channels/http/schemas.ts` und OpenAPI mit
   `npm run openapi:emit` aktualisieren; fehlende `theme`-/`mcp_settings`-Beschreibung
   ergänzen. Audio-Feldnamen zwischen Laufzeit, Hosted-Client und OpenAPI angleichen.
- Tests für JSON-Syntheseantwort, Alignment im Relay und Frame-Schema. Zusätzlich
   letzte Audiofolge/`tts_audio_end`/`session_ending` und Replay-Semantik dokumentieren,
   damit der Client weder doppelt abspielt noch den Abschied abschneidet.

### B4. Persona-Ressourcen und öffentlich downloadbare Dateien

- `ActorRef.resources?: PersonaResource[]` gemäß Abschnitt 5.2 ergänzen. Server kennt
   keine spezielle „Avatar“-Logik; Angular wählt selbst die 3D-Model-Ressource.
- `EquipmentResolver.resolvePersonaResources(personaGuid)` nutzt direkte Beziehungen
   der Persona, Ressourcentyp über `IS`, effektive Ressourcenparameter plus
   `parameterOverrides` der Bindung (GUID-Zuordnung, Ausgabe nach Label).
- Dateien über `Equipment.files_` lesen, nicht `imageRef`. Nur Dateien mit
   `visibility=PUBLIC_DOWNLOADABLE` im Actor veröffentlichen. URLs mit vorhandenen
   `leanScopeFileKey`-Hilfen als Session-Dateipfad bilden.
- Vor Umbau mit echtem Laufzeittoken prüfen: Persona -> Avatar -> `files_` liefert
   Dateien; `base64DataUrl` liefert die GLB und Transferzeit ist gemessen. Scheitert
   das, stoppen und Backend-Ursache bzw. expliziten Fallback abstimmen.
- Bestehende Route in `src/channels/http/files-route.ts` und Abruf über
   `LeanScopeFileUploadStrategy.retrieve`/`readLeanScopeFile` aus dem Choreo-Repo nutzen.
   Datei nur bei öffentlicher Freigabe oder wenn die Session selbst sie geschrieben
   hat ausliefern. Sonst 404, auch bei Kenntnis einer fremden Datei-GUID.
- Begrenzten LRU-Cache um `readLeanScopeFile`, Schlüssel GUID plus
   `modifiedUtcTimestamp`, Invalidierung und ETag implementieren. Öffentliche
   Cache-Header nur für öffentlich freigegebene Assets, nicht private Session-Dateien.
- Tests: Typauflösung, Overrides, Sichtbarkeit, realer Dateipfad, Cache-Hit/Miss und
   Invalidierung. Actor-Schema und Datei-Fehlerfälle in OpenAPI ergänzen.

### B5. Karten-SessionCode absichern

- `SessionCodeMapping` um `validUntil`, `maxSessionMinutes` und
   `maxSessionsPerHour` erweitern. Abgelaufen -> 410; Rate-Limit -> 429.
- Sessiondauer über vorhandenen `session-expiry-scheduler.ts` begrenzen.
   Pro Code zunächst prozesslokalen In-Memory-Token-Bucket gemäß Thomas' Plan nutzen;
   Neustart-/Mehrinstanzgrenzen dokumentieren.
- Mapping bleibt serverseitig mit Operator-Zugangsdaten; keine feste Session-Scenario-
   GUID für die Karte. Tests für Resolver, Code-Start, Ablauf und Limits; OpenAPI ergänzen.

### B6. Optionaler Ausbau nach dem MVP: Microsoft-Bookings-Integration

**Nicht Teil des MVP und kein Release-Gate.** Im MVP öffnet die Person den bestehenden
Bookings-Link und wählt dort selbst einen Termin (Abschnitte 5.4, 6 und 8). Die
folgende technische Skizze ist nur relevant, falls automatische Verfügbarkeitsabfrage
und Buchung später ausdrücklich beauftragt werden. Umsetzung und Betrieb gehörten
dann dem Agent-Server-Team bzw. einem vorhandenen gehosteten Connector, nicht dem
Angular-BFF.

- **Zugriff:** Entra-Anwendung und Admin-Consent im zuständigen Microsoft-365-Tenant.
   Für `getStaffAvailability` nennt Microsoft Graph die Application-Berechtigung
   `Bookings.Read.All`; für das Erstellen von Terminen
   `BookingsAppointment.ReadWrite.All`. Tatsächlich benötigte Rechte aller genutzten
   Lese-/Schreibendpunkte und deren Tenant-Beschränkung vor Freigabe prüfen. Secrets
   nur in der gehosteten Laufzeit, bevorzugt Zertifikat/verwaltete Identität soweit
   unterstützt. Keine Microsoft-Anmeldung der Kartenempfänger voraussetzen.
- **Konfiguration:** Bookings-Business, Service-ID, Thomas' Staff-ID und Zeitzone
   administrativ bestätigen. Service aus Abschnitt 4 zuordnen; Staff-/Service-IDs
   nicht aus dem öffentlichen Link raten. Dauer, Vor-/Nachpuffer, Vorlaufzeit,
   Buchungshorizont, Zeitraster, Geschäfts-/Personalzeiten, Service-Verfügbarkeit,
   Kapazität und erforderliche Kundenfragen aus Bookings berücksichtigen.
- **Lesen:** `POST /v1.0/solutions/bookingBusinesses/{id}/getStaffAvailability`
   mit `staffIds`, `startDateTime`, `endDateTime`. API liefert Verfügbarkeitsintervalle,
   keine fertig validierte Liste buchbarer Service-Termine. Daraus nach den effektiven
   Buchungsregeln den frühesten Kandidaten im begrenzten Suchhorizont bestimmen;
   UTC/Zeitzonen/Sommerzeit korrekt behandeln und gegen die Bookings-Seite abgleichen.
- **Angebotsvertrag (zu implementieren):** Ergebniszustände `available`, `none`,
   `unavailable`; bei `available` serverseitige Angebots-ID, Start, Ende, Zeitzone,
   Service-/Staff-Zuordnung, Ablaufzeit sowie überprüfter Buchungslink. Keine Kalender-
   Details anderer Personen ausgeben. Angebot und Zustand an die aktuelle Session
   binden. Der Browser darf weder Geschäft noch Mitarbeiter beliebig bestimmen.
- **Buchen:** Nach bestätigtem Angebot und Datenvalidierung
   `POST /v1.0/solutions/bookingBusinesses/{id}/appointments` mit dem richtigen Service,
   Thomas' `staffMemberIds`, Start/Ende, Kundendaten und Service-Pflichtfeldern.
   Microsofts Business-Rules-Validation ist auch bei App-only-Zugriff umzusetzen.
   Namen/E-Mail prüfen, nicht benötigte Telefon-/Rückblickdaten weglassen. Bei
   Gruppenangeboten ggf. erforderlichen Bookings-Kunden zuerst korrekt anlegen.
- **Sicherheit:** Freigabe an Session, Angebot und bestätigten Datenstand binden;
   serverseitige Idempotenz und Sperre gegen Doppelsubmit, begrenzte Rate und
   Missbrauchsschutz für öffentliche Karten-Codes. Direkt vor dem Write erneut prüfen;
   Read-then-Write allein garantiert keine atomare Reservierung. Konkurrenzverhalten
   mit Bookings testen und Konflikte behandeln. Nach Timeout keine blinden Write-Retries;
   Ergebnis mittels gespeicherter Operationskennung/Zuordnung abgleichen. Unklarheit
   als eigener Status, nicht als Erfolg oder sicherer Fehlschlag behandeln.
- **Buchungsvertrag (zu implementieren):** `confirmed` mit verifizierter Buchungs-ID,
   tatsächlicher Zeit und nur von Microsoft gelieferten Folgelinks; alternativ
   `conflict`, `failed` oder `unknown`. Connector-Writes sind durch deterministische
   Freigabeprüfung geschützt, nicht allein durch Persona-Instruktionen.
- **Datenschutz:** Datennutzung für die Buchung vor Bestätigung erklären, notwendige
   Angaben minimieren, Aufbewahrung/Löschung festlegen. Kein Credential-/E-Mail-/
   Kalenderdetail-Logging; keine persistente Freigabe im allgemeinen Inventory.
- **Tests/Übergabe:** Mock-Tests für Nein-Zweige ohne Write, mehrere Intervalle,
   Puffer/Vorlauf/Sommerzeit, Angebot abgelaufen, Datenkorrektur, Freigabe-Abbruch,
   erfolgreicher Write, Konflikt, 401/403/429, Timeout und Doppelsubmit. Danach
   freigegebener Testkalender, keine ungefragten Termine bei Thomas. Connector-Vertrag,
   Rechte, Ressourcenbindung und Consent-Gates dokumentieren und alle Wartepunkte
   durchspielen. Erst dann aktive Choreo und Angular-Darstellung anbinden.

Offizielle API-Referenzen:
- [Verfügbarkeit](https://learn.microsoft.com/en-us/graph/api/bookingbusiness-getstaffavailability?view=graph-rest-1.0)
- [Service und Buchungsregeln](https://learn.microsoft.com/en-us/graph/api/resources/bookingservice?view=graph-rest-1.0)
- [Termin anlegen](https://learn.microsoft.com/en-us/graph/api/bookingbusiness-post-appointments?view=graph-rest-1.0)
- [Business-Rules-Validation](https://learn.microsoft.com/en-us/graph/bookingsbusiness-business-rules)

### Reihenfolge und Übergabe

1. B1 -> B3 -> B4; diese Erweiterungen sind unabhängig vom Engine-Slot-Umbau.
2. Headless-Bestandsregression sichern, dann B2 -> B5.
3. Server-Tests (`npx vitest run`) einschließlich `uxm-write-action-guard` grün.
4. Live-Test mit Repository/Choreo aus Abschnitt 4: Code-Start, TTS aktivieren,
    deutsche Aufnahme -> `[stt] elevenlabs`, Mistral-Nachfragen, sichtbare Slot-Werte,
    Alignment, echte Wartepunkte und regulärer Abschied. Öffentliche GLB/ETag/Cache
    und verweigerter Privatdateiabruf geprüft. Keine OpenAI-Nutzung im Gespräch.
5. An App-Team übergeben: deployed Release, Slot-Parameter-GUID, bestätigte Event-
    Fixtures/OpenAPI, Datei-Spike-Ergebnis, Code/Key-Bestätigung ohne Secret-Werte.
    Erst danach Integration gemäß Abschnitt 6 freigeben.
6. Nach Nutzerabnahme Server-Dokumentation `docs/turn-based-slot-conversation.md`,
    Release-Notizen und README pflegen. Kein Server-Commit oder Deployment durch
    diesen Dokumentauftrag im Angular-Repository.

### Spätere Optionen

ElevenLabs-EU-Data-Residency mit konfigurierbarer Basis-URL und Scribe v2 Realtime
als eigener Freihandmodus sind spätere Ausbaustufen. Eine generische Anbieter-
Allowlist wegen möglicher OpenAI-Fallbacks gesondert bewerten; die MVP-Abnahme muss
unabhängig davon nachweisen, dass tatsächlich nur die vereinbarten Anbieter liefen.