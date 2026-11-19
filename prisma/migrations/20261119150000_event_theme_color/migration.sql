-- Colour of an edition's theme (tints its poster and ticket artwork).
ALTER TABLE "events" ADD COLUMN "theme_color" TEXT;
ALTER TABLE "events" ADD CONSTRAINT theme_color_format CHECK ("theme_color" IS NULL OR "theme_color" ~ '^#[0-9a-fA-F]{6}$');
