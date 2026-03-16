import type { LovelaceCardConfig } from "../../hass-frontend/src/data/lovelace/config/card";

export type HelmanForecastMobileDensity = "comfortable" | "compact";

export interface HelmanForecastSectionVisibility {
    solar: boolean;
    battery: boolean;
    house: boolean;
    price: boolean;
}

export interface HelmanForecastCardConfig extends LovelaceCardConfig {
    /** When true, the card background is transparent. Default: false. */
    transparent_background?: boolean;
    /** Layout density used on narrow screens. Default: "comfortable". */
    mobile_density?: HelmanForecastMobileDensity;
    /** Show the solar section in each unified day card. Default: true. */
    show_solar?: boolean;
    /** Show the battery section in each unified day card. Default: true. */
    show_battery?: boolean;
    /** Show the house section in each unified day card. Default: true. */
    show_house?: boolean;
    /** Show the price section in each unified day card. Default: true. */
    show_price?: boolean;
}
