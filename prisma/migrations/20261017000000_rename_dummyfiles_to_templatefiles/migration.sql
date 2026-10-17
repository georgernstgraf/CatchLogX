-- Rename the template file table: "dummy file" was renamed to "template file"
-- (issue #128). Data is preserved.
ALTER TABLE "DummyFiles" RENAME TO "TemplateFiles";
