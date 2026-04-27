# Domain Knowledge

Business rules and domain relationships not obvious from code.

## Entities
- **RiverSite**: A fishing locality on a river, identified by siteCode. Has GPS coordinates (upstream required, downstream optional), locality dimensions (length × width in meters)
- **Sampling**: A single field sampling event at a RiverSite in a given year. Captures environmental data (water temp, conductivity, pH, oxygen content/saturation), fishing methodology (boat/wading, strip/point, anodes, dimensions), and catch efficiency percentage
- **FishCatch**: An individual fish caught during a Sampling, linked to a FishSpecies with measurements (length in mm, total weight in grams). Contains PIT tag data (pitDec, pitHex) and recapture flag
- **FishSpecies**: A fish species identified by unique speciesName, with optional German name, Latin name, and family classification
- **Uploads**: Tracks Excel file uploads through a state machine: UPLOADED → ACCEPTED/REJECTED/DB_ERROR → SAVED_IN_DB
- **UserQueries**: Saved SQL queries per user, with optional names for the query list

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
