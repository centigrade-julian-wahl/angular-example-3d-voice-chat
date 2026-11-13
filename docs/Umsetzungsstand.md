---
title: "Umsetzungsstand Wichtel-App"
date: "2026-11-13"
document_type: "Technische Bestandsaufnahme"
reference_plan: "Soll-Implementierungsplan Wichtel-App.md"
repository: "https://github.com/centigrade-julian-wahl/angular-example-3d-voice-chat"
commit: "80d42c6"
version: "0.3.1"
---

# Umsetzungsstand Wichtel-App

Stichtag: 13.11.2026. Diese Datei hält den lokal geprüften Implementierungsstand fest.
Sie ergänzt den [Soll-Implementierungsplan](Soll-Implementierungsplan%20Wichtel-App.md),
ersetzt ihn aber nicht. „Vorhanden“ beschreibt Code oder Daten; es bedeutet nicht automatisch,
dass die native Zielarchitektur live abgenommen ist.

## Kurzfazit

Die App ist ein funktionierender **lokaler Push-to-Talk-Prototyp** mit Three.js-Wichtel,
Textalternative, lokalem Voice-BFF sowie ElevenLabs STT/TTS. Der Avatar wurde auf das neue
rigged Blender-Modell umgestellt und hat Shader-Mund, Zähne und Blinzeln.

Die Zielarchitektur läuft noch nicht durchgängig: Die geroutete Sessionseite verwendet weiter
den lokalen BFF. Native Agent-Server-STT/TTS, der turn-basierte Slot-Dialog, TTS-Ausrichtung
und serverseitige Persona-Ressourcen sind nicht als integrierter End-to-End-Lauf bestätigt.

## Stand nach Phasen

| Phase | Stand am Stichtag | Nachweis / Lücke |
|---|---|---|
| 0. Basis | **Erledigt** | Angular-Projekt baut; `npm test -- --watch=false` und `npm run build` bestehen. Arbeitsbaum war sauber, `main` auf `80d42c6`, Version `0.3.1`. |
| 1. LeanScope-Modell | **Teilweise** | Ausführbare Choreo, Persona und Inventory sind vorhanden. Terminabschluss ist auf Ja → Selbstbuchungslink und Nein → kein Link begrenzt. Das ausführbare Szenario referenziert weiterhin `Mistral Magistral` (`magistral-small-latest`), nicht das für niedrige Latenz geplante Modell. |
| 2. Generischer Transport | **Code vorhanden, nicht in der Voice-Seite verdrahtet** | `LeanScopeSessionService` enthält `transcribe`, `setTtsActive` und typisierte Frames. Die Sessionseite nutzt diese Methoden noch nicht. |
| 3. PTT-Eingabe | **Lokal vorhanden** | Halten/Loslassen, Mikrofonaufnahme und Texteingabe laufen über `PttVoiceService` und `/api/voice`. Es ist noch nicht der native Agent-Server-PTT-Pfad. |
| 4. Sprachausgabe | **Lokal vorhanden; native Wiedergabe offen** | Der lokale BFF vertont abgeschlossene Agent-Turns mit ElevenLabs. Eine lokale Race-Korrektur wartet auf `message_complete`. Native `tts_audio`-Queue, Audio-Unlock und `tts_audio_end`-Koordination sind nicht in der gerouteten Seite umgesetzt. |
| 5. Zustands-Mapper | **Teilweise** | Sessionstatus und Avatarzustände sind vorhanden; Audio-RMS steuert den Mund. Emotion-/Gestenereignisse sind nicht vollständig aus Agent-Server-Frames verdrahtet. |
| 6. Avatar | **Lokal integriert** | `public/wichtel-rigged.glb` ist die Default-Figur; exportiert mit 65-bone-Rig und 11 Actions. Idle-/Wait- sowie Gestenclips sind in `CharacterConfig` zugeordnet. Server-Actor-/Dateiressourcen sind nicht angeschlossen. |
| 7. Mund und Blinzeln | **Shader-Prototyp vorhanden** | Mundmaske und drei kleine Zähne laufen im Materialshader; zufälliges shaderbasiertes Blinzeln ist ergänzt und respektiert `prefers-reduced-motion`. Die aktuelle Mundbewegung nutzt RMS, nicht TTS-Alignment oder Phoneme. |
| 8. Success Story und Termin | **Termin-MVP festgelegt** | Bei Termininteresse zeigt die Choreo den Microsoft-Bookings-Link zur Selbstbuchung; keine Verfügbarkeitssuche oder automatische Buchung. Eine kuratierte Success-Story-Auswahl ist noch nicht als fertiger Bestand abgenommen. |
| 9. Öffentlicher Betrieb | **Offen** | Kein vollständiger `/?code=...`-SessionCode-Start, kein bestätigter HTTPS-/Mobilgeräte-Abnahmelauf. `npm start` startet lokal den Angular-Devserver plus den BFF. |
| 10. Gesamtabnahme | **Offen** | Lokale Unit-/Backendtests und Build sind grün; eine native Agent-Server-End-to-End-Abnahme mit echter Voice-Auflösung und allen Gesprächszweigen fehlt. |

## Voice und Persona

Die Persona „Weihnachtswichtel 2.0“ (`550e8400-e29b-41d4-a716-446655440099`) hat die Voice-
Resource „Rebecca“ (`7b4ca6fe-4074-485c-bb0b-b05d1e873341`) mit `voiceId` gebunden. Das ist
im LeanScope-Repo bestätigt.

Die aktive lokale Route liest diese Persona-Bindung **nicht**. `server/voice-api.mjs` verwendet
`LEANSCOPE_ELEVENLABS_VOICE_ID` beziehungsweise eine lokale Fallback-ID und ruft ElevenLabs
direkt auf. Eine Änderung der Voice-Resource in LeanScope ändert daher aktuell nicht die
Stimme des lokalen BFF-Prototyps.

Der öffentliche Agent-Server-Vertrag (`dev.api.agents.leanscope.ai`, OpenAPI `0.150.0`)
dokumentiert TTS-Aktivierung über `/tts` sowie `tts_audio`-/`tts_audio_end`-SSE-Events. Ein
kurzer direkter Testlauf erreichte den ersten menschlichen Eingabe-Turn, lieferte uns aber kein
verwertbares Audioereignis, bevor die kurzlebige Testsession endete. **Die tatsächliche
serverseitige Auflösung der Rebecca-Voice-ID ist damit unbestätigt.** Bei der letzten
read-only Umgebungsprüfung war `LEANSCOPE_MISTRAL_API_KEY` für Copilot verfügbar,
`LEANSCOPE_ELEVENLABS_API_KEY` jedoch nicht. `.env` wurde nicht geöffnet oder gelesen.

## Lokal vorhandene Bedienung

- Gesprächsbeginn über bewussten Start, runder Push-to-Talk-Button und optionale Texteingabe.
- Pause/Fortsetzen hält lokale Wiedergabe und Eingabe an; bereits laufende Serverarbeit wird
  dadurch nicht notwendigerweise gestoppt.
- Abbrechen beendet die lokale Session, stoppt Audio und verwirft eine laufende Aufnahme.
- Die Startseite zeigt wieder den 3D-Wichtel; die separate Geschenkbilddatei ist vorhanden,
  wird aber nicht als Startscreen verwendet.
- TTS-Audio wird lokal weiterhin je Antwortquelle gesetzt; eine allgemeine Queue für
  verschiedene unmittelbar aufeinanderfolgende Sätze ist noch offen.

## Agent-Server-Abhängigkeiten

Der Agent-Server liegt außerhalb dieses Repositories. B1–B5 aus dem Soll-Plan (ElevenLabs
Scribe, turn-basierter Slot-Dialog, TTS-Alignment, Actor-Ressourcen/Dateien und SessionCode-
Limits) wurden hier nicht implementiert und sind für den aktuellen Live-Stand nicht als
bereitgestellt/veröffentlicht bestätigt. Dokumentierte API-Endpunkte allein belegen nicht,
dass diese Erweiterungen im gehosteten Release aktiv sind.

Die Bookings-Verfügbarkeits- und Buchungsintegration B6 ist **aus dem MVP ausgenommen**.
Die Person bucht über den Link selbst.

## Verifikation und offene Punkte

- Zuletzt geprüft: **54 Tests bestanden**, `npm run build` ohne Fehler.
- Im Browser geprüft: neuer GLB lädt; Shader-Mundposition wurde anhand der Modelloberfläche
  korrigiert; Mund-/Zahn- und Blinkshader wurden visuell kontrolliert.
- Kein echter Spracheingabe-/TTS-End-to-End-Lauf auf dem nativen Agent-Server bestätigt.
- Nächste technische Hauptaufgabe: die geroutete PTT-Seite vom lokalen BFF auf den nativen
  `LeanScopeSessionService` umstellen, dann mit verfügbarer Mistral- und ElevenLabs-
  Berechtigung die Persona-Voice-Auflösung live verifizieren.
- Für den lokalen Prototyp separat offen: Audio-Queue zwischen verschiedenen Antworten,
  Success-Story-Kuration sowie SessionCode-/HTTPS-Betrieb.

Die Änderungen an dieser Bestandsaufnahme und weitere lokale Character-/Voice-Anpassungen sind
nicht automatisch veröffentlicht. Git- und Push-Stand vor einer Veröffentlichung neu prüfen.
