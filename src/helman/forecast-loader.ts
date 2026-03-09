import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { ForecastPayload } from "../helman-api";

export const FORECAST_REFRESH_MS = 5 * 60 * 1000;

export function loadForecast(hass: HomeAssistant): Promise<ForecastPayload> {
    return hass.connection.sendMessagePromise<ForecastPayload>({
        type: "helman/get_forecast",
    });
}

export async function refreshForecast(
    hass: HomeAssistant,
    previous: ForecastPayload | null,
): Promise<ForecastPayload | null> {
    try {
        return await loadForecast(hass);
    } catch (err) {
        console.error("helman: failed to refresh forecast", err);
        return previous;
    }
}
