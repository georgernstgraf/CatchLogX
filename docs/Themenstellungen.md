# Themenstellungen des Diplomteams (Jahrgang 2027)

Kurzfassung der individuellen Themenstellungen des Teams, das CatchLogX seit
2026-09 weiterentwickelt. Zweck: **Tickets zuweisen** — welches Thema deckt
welchen Code-Bereich, und wer ist zuständig.

Die verbindliche Fassung (Einreichung vom 2026-09-25 mit Untersuchungsanliegen,
geplantem Ergebnis und Meilensteinen) liegt im **privaten** Repo
`georgernstgraf/matura-diplom-koll`, Ordner
`2027_schmidinger_cezawa_biegel_bal_zdroba-fisteag/` (`da_einreichung_CatchLogX.md`).
Hier steht bewusst nur die Kurzfassung — dieses Repo ist public.

Schreibweise: **Biegel**. Die Einreichung schreibt „Biegl"; WebUntis belegt
Biegel (Treffer `id=19357`, 5AAIF), „Biegl" liefert keinen Treffer.

## Team und Themenstellungen

| Schüler | GitHub | Rolle | Themenstellung (sinngemäß) | Liefert konkret | Code-Bereich |
|---|---|---|---|---|---|
| Dominic Daniel Schmidinger | [@DominicSchmidinger](https://github.com/DominicSchmidinger) | Backend, Projekt-/Dokumentationskoordination | Evaluierung und Umsetzung einer wartbaren Backend-Architektur mit differenziertem Rollen- und Rechtekonzept für eine mehrstufige Benutzerverwaltung | durchgängige Service-Schicht, typsichere Schnittstellen, mehrstufige Rollen, Absicherung des Passwort-Resets | `services/`, `lib/auth-middleware.ts`, `lib/admin-middleware.ts`, `app/api/**`, `prisma/schema.prisma` (`UserRoles`) |
| Rodion Bal | [@esquze](https://github.com/esquze) | Datenbank | Entwicklung und Evaluierung automatisierter Verfahren zur Sicherstellung von Datenqualität und Datenintegrität in einer wissenschaftlichen Messdatenbank für Fangdaten | Plausibilitätsprüfung von Koordinaten, Fischarten-Stammdaten, Duplikaterkennung, kontrolliertes Entfernen fehlerhafter Importe | `services/uploadService.ts`, `services/importService.ts`, `services/queryService.ts`, `scripts/data/`, `prisma/migrations/` |
| Alexander Biegel | [@evictedI](https://github.com/evictedI) | Frontend | Analyse und Neugestaltung des Datei-Upload-Workflows zur Verbesserung von Nutzerführung, Fehlerrückmeldung und Übersichtlichkeit für fachfremde Anwender/innen | übersichtliche Import-Liste, sofortige Zusammenfassung von Ergebnissen und Fehlern, Dateiname und importierende Person | `app/upload/`, `app/my-uploads/`, `components/UploadPageComponent.tsx`, `components/MyUploadsPageComponent.tsx`, `lib/uploadReport.ts` |
| Jakob Cezawa | [@HJakobTL](https://github.com/HJakobTL) | Testing, Sicherheit & Betrieb | Konzeption und Umsetzung einer automatisierten Qualitätssicherung inklusive Testautomatisierung, Sicherheitsprüfung von Abhängigkeiten und Backup-Strategie für eine produktive Webanwendung | Testinfrastruktur (Vitest), Dependency-Management, Backup-Konzept | `vitest.config.ts`, `services/*.test.ts`, `lib/*.test.ts`, `.github/workflows/`, `.githooks/`, `package.json`, `deploy/prod/backup/` |
| Armin-Rafael Zdroba-Fisteag | [@Zdroba-Fisteag](https://github.com/Zdroba-Fisteag) | Frontend — **aus dem Projekt ausgeschieden** | Untersuchung und Umsetzung einer interaktiven Abfrage- und Visualisierungsoberfläche für Fachdaten, inklusive KI-gestützter Unterstützung bei der Formulierung von Datenbankabfragen | Spaltenübersicht, Diagrammvorschläge, KI-Query-Generator | `components/SqlQueryComponent.tsx`, `components/DashboardComponent.tsx`, `services/queryService.ts`, `lib/queryPrisma.ts` — **Strang derzeit unbesetzt** |

## Wer bekommt welches Ticket

- **`diplomarbeit`** markiert Thesis-Scope: das Ticket gehört zum Aufgabenzuschnitt
  der Diplomanden (Label-Beschreibung: „Reserviert für Diplomanden"). Agenten und
  Dritte lassen es liegen.
- **Assignee** = wer das Ticket tatsächlich übernommen hat. Ein Thesis-Ticket
  ohne Assignee ist offen und kann vom Team gezogen werden.
- **`needs-clarification`** heißt: offene Frage an die BOKU (Lena, Martin), nicht
  ans Team — nicht bauen, erst klären.
- **Prod-Zugang, Infra und BOKU-Kontakt** (Deploy-Pipeline, Host, TLS,
  Vor-Ort-Termine) macht der Betreuer; diese Tickets tragen kein `diplomarbeit`.
- Unklare Zuordnung entscheidet der Betreuer, nicht das Team.
- **Handle-Falle:** `Zdroba-Fisteag` ist Armin (ausgeschieden), **nicht** Rodion —
  Rodion Bal ist `@esquze`.

## Meilensteine (sinngemäß aus der Einreichung)

| Meilenstein | Datum |
|---|---|
| Anforderungsklärung mit der BOKU, Aufgabenverteilung bestätigt | 15.10.2026 |
| Konzept für Datenqualität, Rollen-/Rechtemodell und Testautomatisierung | 15.12.2026 |
| Umsetzung der Datenbank- und Backend-Anpassungen | 28.02.2027 |
| Umsetzung der Frontend-Bereiche (Import & Abfrageoberfläche) | 15.04.2027 |
| Testautomatisierung, Sicherheits- und Backup-Konzept produktiv | 31.05.2027 |
| Dokumentation und Präsentation | 01.07.2027 |

## Offene Tickets (Stand 2026-11-19)

Snapshot der Triage vom 2026-11-19. Die Wahrheit über Zuweisungen steht in den
GitHub-Issues, nicht hier.

### Betreuer (kein `diplomarbeit`)

| # | Thema | Assignee |
|---|---|---|
| 122 | Vor-Ort-Wartungstermin BOKU-Server | Georg |
| 114 | LaTeX-Workflow nach `docs/Diplomarbeit` | Georg |
| 144 | Gated Deploy-Pipeline | Georg (`ready-for-agent` entfernt) |
| 165 | TLS vor Port 80 | Georg |
| 166 | Postgres-Rollen `clx_app` / `clx_migrate` | — (Betreiber-Arbeit, braucht Prod-Zugang) |
| 200 | Cutover: Produktions-DB neu aufbauen | Georg (offen bis #205, #208 und der M-Nachfolger zu sind) |
| 207 | Juni-23-Lieferung importieren | Georg + Lena — **offen, strittig** (Lena: superseded; Messung: 45 380 Zeilen ohne Überlappung) |
| 86 | Vollbackup + inkrementelle Sicherung | Georg (BOKU-Drive-Daten von Martin übernommen) |
| 220 | Docker-Reste auf dem Prod-Host | Georg |
| 236 | Epic: Import-Vertrag — Code spezifiziert, DB konfiguriert, Vorlage ist ein Artefakt | — (Epic) |

### Übernommen (`diplomarbeit` + Assignee)

| # | Thema | Assignee |
|---|---|---|
| 160 | Passwort-Reset in der Produktion (`NODEMAILER_*`) | Dominic |
| 153 | In-App-Data-Access-Seite (Inhalt wird ein FAQ-Eintrag in #154) | Georg + Dominic |
| 157 | About-Seite: Team-Historie | Alex |
| 98 | Auth-HOCs einführen (oder löschen) | Alex |
| 81 | Validierung der Koordinaten-Verortung | Rodion |
| 227 | Admin-Rollen: `SUPER_ADMIN` entfernen, Selbst-Aussperrung verhindern | Rodion |
| 205 | Offizielle Listen: eine Quelle, Prüfstrenge hart vs. weich | Rodion |
| 208 | Adoptionspfad ist toter Code | Dominic |
| 233 | Flussnamen-Vokabular: `assets/river_name.json` → DB | Rodion |
| 234 | Referenzdaten-Export: `species.json` aus der DB + Snapshot im Datenrepo | Rodion |
| 235 | Dev-Copy der Produktions-DB als Release-Asset | Jakob |

### Offen (`diplomarbeit`, kein Assignee)

| # | Thema | Themenstrang |
|---|---|---|
| 219 | Inhaltliche Duplikaterkennung beim Import | Rodion |
| 231 | Bug: Validierung liest das `List`-Blatt der hochgeladenen Datei | Backend (Dominic) |
| 232 | Spaltenkatalog im Code als einzige Spezifikation | Backend (Dominic) |
| 194 | Mailwege auf Dev belegen und härten | Dominic |
| 185 | Vorlage + Legend aus dem Katalog generieren | Rodion |
| 182 | Import-Validierung akzeptiert leeres `project` | Alex |
| 175 | Dependency-Upgrade Stufe 2 | Jakob |
| 174 | Dependency-Upgrade Stufe 3 (Majors) | Jakob |
| 173 | react-hooks v6: 8 Lint-Fehler | Jakob |

### Offen, Strang unbesetzt (Armin, ausgeschieden)

| # | Thema |
|---|---|
| 154 | FAQ in der Sidebar (camelCase-Spalten in SQL) |
| 103 | Toter SQL-Drilldown |
| 97 | Client-Helfer aus server-only `lib/` auslagern |
| 90 | SQL-Seite: Spalten, Diagrammvorschläge, KI-Abfrage-Generator |
| 85 | Längen-/Gewichtstabelle zum Download |

## Alt-Team (2025/26, abgeschlossen)

| Schüler | Themenstellung |
|---|---|
| Arman Sarrafi-Nour | Konzeption und Implementierung der Businesslogik für ein ökologisches Monitoringsystem |
| Burak Bingöl | Vergleich dokumentbasierter und relationaler Datenbanken am Beispiel einer Befischungsdatenbank |
| Tadeas Reindl | Vergleich zwischen Utility-First- und komponentenbasiertem Designansatz |
| Maxima Simons | Evaluierung von Authentifizierungsmethoden (Sicherheit, Usability, Implementierungsaufwand) |
