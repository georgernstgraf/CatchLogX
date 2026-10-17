# Handoff

Offene Aufgaben für die nächste Session.

1. [ ] **`dev` → `master` mergen** (PR + eine zweite Approval; `master` hat `enforce_admins`, also kann auch der Owner nicht allein mergen). Der Merge ist seit #137 sicher: er nimmt `production-deploy.yml` den push-Trigger, ein `master`-Push deployt also nichts auf die BOKU-Maschine. **Bis zum Cutover (#141) `production-deploy.yml` auf keinen Fall dispatchen** — die aktuelle Compose führt `migrate deploy` gegen die db-push-Datenbank aus und legt Produktion lahm.
2. [ ] See #138 — **Production-Audit auslösen**, sobald er auf `master` liegt: `gh workflow run production-maintenance.yml --ref master` (oder Actions-UI). Der Workflow ist read-only, legt ein verifiziertes DB-Dump + MinIO-Export auf der Maschine ab und liefert Drift-Report, Row-Counts und `_prisma_migrations`-Zustand als Artefakte. Erwartung: `_prisma_migrations` fehlt oder ist veraltet, Drift-Report zeigt den `DummyFiles`/MinIO-Stand.
3. [ ] See `CatchLogX-Data#2` — read-only-Rollen für `esquze`, `Zdroba-Fisteag`, `evictedI`, `HJakobTL`, `DominicSchmidinger` setzen. Geht erst nach Annahme der Einladungen und nur über die Web-UI (Settings → Collaborators and teams → Read), siehe `PITFALLS.md`. Danach `README.md` und `docs/ai/STATE.md` im Datenrepo nachziehen.

Kontext: Das Epic #125 bleibt offen, solange `CatchLogX-Data#2` offen ist. Der Produktions-Upgrade-Pfad ist #137–#145; #139 (Adoptionsskript) ist blockiert durch den Audit-Befund aus #138.
