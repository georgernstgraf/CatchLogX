-- Drop fish_species.latinName (#183): it always duplicated speciesName
-- (the binding scientific name from the Artliste) and is redundant.
ALTER TABLE "fish_species" DROP COLUMN "latinName";
