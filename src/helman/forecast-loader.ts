import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { ForecastPayload } from "../helman-api";

export const FORECAST_REFRESH_MS = 5 * 60 * 1000;
const FORECAST_REQUEST_CACHE_MS = 2000;

type ForecastConnection = HomeAssistant["connection"];

type ForecastRequestCache = {
    inFlight: Promise<ForecastPayload> | null;
    inFlightHourKey: string | null;
    payload: ForecastPayload | null;
    payloadHourKey: string | null;
    fetchedAt: number;
};

const forecastRequestCache = new WeakMap<ForecastConnection, ForecastRequestCache>();

function getRequestCache(hass: HomeAssistant): ForecastRequestCache {
    let cache = forecastRequestCache.get(hass.connection);
    if (cache !== undefined) {
        return cache;
    }

    cache = {
        inFlight: null,
        inFlightHourKey: null,
        payload: null,
        payloadHourKey: null,
        fetchedAt: 0,
    };
    forecastRequestCache.set(hass.connection, cache);
    return cache;
}

function getLocalHourRequestKey(now: Date): string {
    return [
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getTimezoneOffset(),
    ].join(":");
}

export function loadForecast(hass: HomeAssistant): Promise<ForecastPayload> {
    const now = new Date();
    const requestHourKey = getLocalHourRequestKey(now);
    const cache = getRequestCache(hass);

    if (
        cache.payload !== null &&
        cache.payloadHourKey === requestHourKey &&
        now.getTime() - cache.fetchedAt <= FORECAST_REQUEST_CACHE_MS
    ) {
        return Promise.resolve(cache.payload);
    }

    if (cache.inFlight !== null && cache.inFlightHourKey === requestHourKey) {
        return cache.inFlight;
    }

    const request = hass.connection.sendMessagePromise<ForecastPayload>({
        type: "helman/get_forecast",
    }).then((payload) => {
        cache.payload = payload;
        cache.payloadHourKey = requestHourKey;
        cache.fetchedAt = Date.now();
        return payload;
    }).finally(() => {
        if (cache.inFlight === request) {
            cache.inFlight = null;
            cache.inFlightHourKey = null;
        }
    });

    cache.inFlight = request;
    cache.inFlightHourKey = requestHourKey;
    return request;
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
