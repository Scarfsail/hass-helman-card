import type { LovelaceCardConfig } from "../hass-frontend/src/data/lovelace/config/card";

// No entity config required — all entity IDs are discovered from the helman backend.
export interface HelmanSimpleCardConfig extends LovelaceCardConfig {}
