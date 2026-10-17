# History

Append-only archive of superseded knowledge entries.
Each entry keeps its date, title, origin file, reason, and original text.

## 2026-10-17: Privates Datenrepo CatchLogX-Data angelegt (#125)
- Neues privates Schwesterrepo `georgernstgraf/CatchLogX-Data` mit dem Datenbestand aus `Bulk import.zip` (39 Dateien, 282,1 MiB, 9 Commits, inkrementell gepusht).
- Struktur 1:1 wie geliefert (`Bulk import/`), Scaffolding (`README.md`, `.gitignore`, `AGENTS.md`, `docs/ai/`).
- Einladungen an 7 Personen: `lenagraf` und `Fishknut` mit Commit-Rechten, die übrigen fünf (noch) mit Schreibrecht.
- Verweis im README dieses Repos (Commit `566cbc9`, `dev`).
- **Origin**: `docs/ai/ARCHITECTURE.md`, `docs/ai/DECISIONS.md`
- **Reason**: Neuer struktureller Bestandteil des Projekts; die Datenablage ist jetzt ein eigenes Repo.

## 2026-10-17: MinIO als Dateispeicher abgelöst (#131)
- **Original**: `DECISIONS.md` „MinIO for File Storage" (2026-04-27) — Dateien in MinIO (S3-kompatibler Container) statt lokalem Dateisystem oder DB; Tradeoff: zweite Infrastruktur-Abhängigkeit neben PostgreSQL. Ergänzend „Dev-Instanz selbstgebautes MinIO, mc aus apt" (2026-10-17) — MinIO-Server als aus Source gebautes Binary, `mc` aus dem Ubuntu-Paket.
- **Superceded by**: `DECISIONS.md` 2026-10-17 „PostgreSQL-Blobs statt MinIO (#131)".
- **Origin**: `docs/ai/DECISIONS.md`, `docs/ai/ARCHITECTURE.md`, `AGENTS.md`, `README.md`
- **Reason**: MinIO bot keine gemeinsame Transaktion mit der DB; der atomare Bulk-Import (#88) braucht Blobs in der Datenbank. `lib/minio.ts`, die Compose-Services `minio`/`minio-init`, die `minio`-Dependency und (auf der Dev-Instanz) `minio.service`/`mc` entfallen.
