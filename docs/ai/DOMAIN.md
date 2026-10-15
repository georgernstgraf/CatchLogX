# Domain Knowledge

Business rules and domain relationships not obvious from code.

## Entities
- **RiverSite**: A fishing locality on a river, identified by siteCode. Has GPS coordinates (upstream required, downstream optional), locality dimensions (length × width in meters)
- **Sampling**: A single field sampling event at a RiverSite in a given year. Captures environmental data (water temp, conductivity, pH, oxygen content/saturation), fishing methodology (boat/wading, strip/point, anodes, dimensions), and catch efficiency percentage
- **FishCatch**: An individual fish caught during a Sampling, linked to a FishSpecies with measurements (length in mm, total weight in grams). Contains PIT tag data (pitDec, pitHex) and recapture flag
- **FishSpecies**: A fish species identified by unique speciesName, with optional German name, Latin name, and family classification
- **Uploads**: Tracks Excel file uploads through a state machine: UPLOADED → ACCEPTED/REJECTED/DB_ERROR → SAVED_IN_DB
- **UserQueries**: Saved SQL queries per user, with optional names for the query list

## Parties & Roles (infrastructure, non-obvious from code)
- **Georg Graf**: teacher (room B1.16a is his staff room at the school, NOT a BOKU location), supervisor of the diploma project, and effectively the external maintenance vendor for the BOKU server
- **Martin Seebacher** (`@Fishknut`): institute IT at the BOKU hydrobiology department — the OE-level IT responsible who operates the production server. He is NOT part of the central BOKU-IT
- **BOKU-IT** (`boku-it@boku.ac.at`): central university IT — responsible for topology, formal accreditation, VPN/Funktionsaccount, network-wide rules. Address of the general maintenance inquiry (see #115, `docs/boku-it-auskunft-mail.md`)
- **Production server**: desktop-class hardware ("Schuhschachtel") on Martin's desk in the BOKUnet, productive since June 2026, accredited only informally via email. Institute IT decided to self-host because the central BOKU-IT does not provide managed hosting (no LAMP/VM offering)
- **VPS instance** `catchlogx.graf.priv.at`: Georg's own VPS, deploy target for the students' copy of the app; a second self-hosted GitHub-Actions-Runner is planned there (#123) — unproblematic governance-wise because it is Georg's own network
- **Prior diploma team** ran a GitHub-Actions-Runner on a BOKU-internal server — technically a backdoor pattern (outbound persistent connection enabling remote code execution); this is why the inquiry mail asks whether self-hosted runners are permitted in the BOKUnet

## Rules
- A RiverSite must have a unique siteCode
- A Sampling belongs to exactly one RiverSite
- A FishCatch belongs to exactly one Sampling and one FishSpecies
- FishSpecies names are unique
- User sessions expire after 30 days
- User roles: "admin" (full access) or "viewer" (limited access)
- Users with `isFirstLogin: true` are forced to change password before accessing the app
- Admin panel is only accessible to users with role "admin"
- Upload states follow a strict progression; uploads in SAVED_IN_DB state are excluded from some queries
- PIT numbers (pitDec) can be validated for uniqueness and also checked across files
- Recapture flag marks fish that were caught and tagged previously
