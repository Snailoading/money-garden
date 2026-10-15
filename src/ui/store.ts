/*
 * The one storage adapter instance the UI shares (CLAUDE.md: storage goes
 * through one adapter). A module-level singleton — like a Python module
 * attribute, it's created once on first import and every importer gets the
 * same object, so the App and the crash screen read the same tiers
 * (including the same in-memory fallback, if that's where data lives).
 */
import { createStore } from "../engine/storage";

export const store = createStore();
