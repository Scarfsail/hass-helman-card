import type { LovelaceCardConfig } from "../../hass-frontend/src/data/lovelace/config/card";

export interface HelmanSchedulingCardConfig extends LovelaceCardConfig {
    /** Optional custom title shown in the card header. */
    title?: string;
    /** When true, the card background is transparent. Default: false. */
    transparent_background?: boolean;
}
