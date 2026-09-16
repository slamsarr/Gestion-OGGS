#!/usr/bin/env node
/**
 * Génère icon-192.png, icon-512.png et apple-touch-icon.png.
 * Usage : node scripts/generate-pwa-icons.js
 */
import { generatePwaIcons } from "./lib/pwa-icons.js";

for (const file of generatePwaIcons()) console.log(`OK ${file}`);
