import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generatePwaIcons, makePng } from "../scripts/lib/pwa-icons.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe("Icônes PWA PNG", () => {
  it("makePng produit un PNG valide", () => {
    const buf = makePng(32);
    expect(buf.subarray(0, 8).equals(PNG)).toBe(true);
    expect(buf.length).toBeGreaterThan(50);
  });

  it("écrit icon-192, icon-512 et apple-touch-icon dans public/", () => {
    generatePwaIcons(join(ROOT, "public"));
    for (const name of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
      const file = join(ROOT, "public", name);
      expect(existsSync(file)).toBe(true);
      const buf = readFileSync(file);
      expect(buf.subarray(0, 8).equals(PNG)).toBe(true);
    }
  });
});
