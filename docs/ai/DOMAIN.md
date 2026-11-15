---
type: Domain Notes
title: Domain Knowledge
description: Fachliche Regeln und Domaenenzusammenhaenge, die nicht aus dem Code hervorgehen.
tags: [catchlogx, domain-notes]
generated: { by: opencode/knowledge-persistence, at: 2026-11-15T18:01:00Z }
status: stable
---

# Domain Knowledge

Business rules and domain relationships not obvious from code.

## Entities
- **RiverSite**: A fishing locality on a river, identified by siteCode. Has GPS coordinates (upstream required, downstream optional), locality dimensions (length × width in meters)
- **Sampling**: A single field sampling event at a RiverSite in a given year. Captures environmental data (water temp, conductivity, pH, oxygen content/saturation), fishing methodology (boat/wading, strip/point, anodes, dimensions), and catch efficiency percentage. Belongs to exactly one **Import** (the delivery it arrived in)
- **FishCatch**: An individual fish caught during a Sampling, linked to a FishSpecies with measurements (length in mm, total weight in grams). Contains PIT tag data (pitDec, pitHex) and recapture flag
- **FishSpecies**: A fish species identified by unique speciesName, with optional German name, Latin name, and family classification. The master is maintained in the admin GUI (tab "Fish Species"); `assets/species.json` is only the demo/bootstrap master for `db:init`
- **Imports**: One row per imported delivery — batchId, user, original filename, sha256, rowCount, blobId. There is no review state machine any more: an upload imports directly, and deleting an import deletes its catches, its samplings and the stored original (hard delete, one journal line as the only trace)
- **TemplateFiles**: A template file (German: **Vorlage**) provided by an admin — an Excel/CSV users download, fill in, and re-upload. Replaces the misleading "dummy file" term and the legacy "Eingabemaske" concept. Visibility is admin-controlled; soft deletes keep the underlying `FileBlob`.
- **UserQueries**: Saved SQL queries per user, with optional names for the query list

## Parties & Roles (infrastructure, non-obvious from code)
- **Georg Graf**: teacher (room B1.16a is his staff room at the school, NOT a BOKU location), supervisor of the diploma project, and effectively the external maintenance vendor for the BOKU server
- **Martin Seebacher** (`@Fishknut`): institute IT at the BOKU hydrobiology department — the OE-level IT responsible who operates the production server. He is NOT part of the central BOKU-IT
- **BOKU-IT** (`boku-it@boku.ac.at`): central university IT — responsible for topology, formal accreditation, VPN/Funktionsaccount, network-wide rules. Address of the general maintenance inquiry (see #115, `docs/boku-it-auskunft-mail.md`)
- **Production server**: desktop-class hardware ("Schuhschachtel") on Martin's desk in the BOKUnet, productive since June 2026, accredited only informally via email. Institute IT decided to self-host because the central BOKU-IT does not provide managed hosting (no LAMP/VM offering)
- **VPS instance** `catchlogx.graf.priv.at`: Georg's own VPS, deploy target for the students' copy of the app; the second self-hosted GitHub-Actions-Runner runs there (as a systemd user unit under `catchlogx`, label `vps`, #123) — unproblematic governance-wise because it is Georg's own network
- **Prior diploma team** ran a GitHub-Actions-Runner on a BOKU-internal server — technically a backdoor pattern (outbound persistent connection enabling remote code execution); this is why the inquiry mail asks whether self-hosted runners are permitted in the BOKUnet

## Rules
- A RiverSite must have a unique siteCode
- A Sampling belongs to exactly one RiverSite and exactly one Import
- A FishCatch belongs to exactly one Sampling and one FishSpecies
- FishSpecies names are unique; a species cannot be deleted while catches reference it (`onDelete: Restrict`)
- User sessions expire after 30 days
- User roles: `USER`, `ADMIN`, `SUPER_ADMIN` (`UserRoles` enum); only `SUPER_ADMIN` may create or remove `ADMIN`s
- Users with `isFirstLogin: true` are forced to change password before accessing the app
- Admin panel is only accessible to users with role `ADMIN` or `SUPER_ADMIN`
- An Import owns its Samplings: deleting it deletes its catches, its samplings, the original file and the row itself; `river_sites` and `fish_species` stay
- Upload validation checks `species` against the `fish_species` master, never against the `List` sheet of the uploaded file; one unknown name rejects the whole file
- PIT numbers (pitDec) can be validated for uniqueness and also checked across files
- Recapture flag marks fish that were caught and tagged previously
