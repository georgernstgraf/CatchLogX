# samples/

Vorlagen und Beispieldaten für den Excel-Upload. `services/samples.test.ts` schickt die
Dateien durch die Upload-Validierung und den Admin-Import: Ändert sich das Schema, ohne
dass die Dateien mitziehen, wird der Test rot.

| Datei | Zweck | Über `/upload` hochladbar |
|---|---|---|
| `import-template.xlsx` | Vorlage zum Befüllen: Sheet `DATA` mit allen Spalten und einer vollständig ausgefüllten Beispielzeile, Sheet `List` mit den erlaubten Werten | ja |
| `data.xlsx` | Beispieldatensatz mit 18 Fängen (Traisen, 2020), um Upload und Admin-Accept durchzuspielen | ja |
| `import-template.csv` | Spaltenreferenz mit derselben Beispielzeile (`;` als Trenner, Dezimalkomma, UTF-8 mit BOM) | nein, der Upload nimmt nur Excel-Dateien mit einem Sheet `DATA` |
| `IHG-Fish_V2024.accdb` | Access-Datenbank aus dem ersten Prototyp, wird vom Code nicht verwendet | nein |

`npm run seed:demo` legt `import-template.xlsx` und `import-template.csv` als Template-Files
an, die Dateinamen müssen also bleiben. Eine bereits vorhandene Datei gleichen Namens ersetzt
der Seed nicht: Nach einer Änderung hier die alte Version im Admin-Bereich löschen und neu seeden.

## Format

- **Sheet `DATA`** ist Pflicht, die erste Zeile enthält die Spaltennamen. Die Pflichtspalten
  stehen in `REQUIRED_COLUMNS`, die Regeln je Spalte in `buildSchema`
  (beide in `services/uploadService.ts`).
- **Sheet `List`** ist optional, aber empfohlen: `country`, `method`, `sampling_time`,
  `assessment` und `species` werden nur gegen eine vorhandene Listenspalte geprüft
  (`country`, `method`, `sampling time`, `assessment`, `name of species`). Fehlt sie, gilt
  jeder nicht-leere Text als gültig.
- **`species`** muss exakt wie in `fish_species` geschrieben sein. Die Listenprüfung ignoriert
  Groß-/Kleinschreibung, der Import beim Admin-Accept nicht.
- **`approval_required`** ist genau `yes` oder `no`.
- **Spalte `site_code`** gehört nicht in neue Dateien: Sie schaltet den Import auf das alte
  Format um.
- **Beispielzeile** vor dem Hochladen echter Daten ersetzen, sonst wird sie mit importiert.

## Inhalt von `data.xlsx`

Konvertiert aus dem Prototyp-Format, die Spalten wurden auf die aktuellen Namen umbenannt.
Das alte Format enthielt nicht alles, was der Validator heute verlangt, deshalb weichen diese
Werte vom Original ab:

| Spalte | Wert | Grund |
|---|---|---|
| `country` | `Austria` | neu, abgeleitet aus dem Site-Code `ATTRAI182` |
| `approval_required` | `yes` | im Original leer, zurückhaltender Standardwert |
| `site_name` | `ATTRAI182` | im Original leer, der alte `site_code` |
| `lat_up`, `long_up` | `48.37`, `15.85` | im Original leer, **Platzhalter** nahe der Traisen-Mündung |
| `method` | `e-rake large boat` | `boat large` ist kein Listenwert |
| `sampling_time` | `day` | neu, die alte Strategie `Partialprop` ist keine Tageszeit |
| `species` (Fish ID 58) | `Leuciscus aspius` | `Aspius aspius` steht unter diesem Namen in `fish_species` |

`Run/Strip` steht jetzt in `sample_id`. `sampling strategy` und `Number of Subsections` haben
keine Spalte mehr, ihre Werte stehen in `remark_import`.
