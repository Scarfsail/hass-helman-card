import type { ReactiveController, ReactiveControllerHost } from "lit";

import { getLocalHourKey } from "./local-day-hour-axis";

const HOUR_MS = 3600000;
const BOUNDARY_BUFFER_MS = 50;

export class LocalHourBoundaryController implements ReactiveController {
    private _timer: number | null = null;
    private _timeZone: string | null = null;

    constructor(
        private readonly _host: ReactiveControllerHost,
        private readonly _getTimeZone: () => string | null | undefined,
        private readonly _onBoundary?: () => void | Promise<void>,
    ) {
        this._host.addController(this);
    }

    hostConnected(): void {
        this._scheduleNextBoundary();
    }

    hostUpdated(): void {
        const nextTimeZone = _normalizeTimeZone(this._getTimeZone());
        if (nextTimeZone !== this._timeZone) {
            this._scheduleNextBoundary();
        }
    }

    hostDisconnected(): void {
        this._clearTimer();
    }

    private _scheduleNextBoundary(): void {
        this._clearTimer();

        const timeZone = _normalizeTimeZone(this._getTimeZone());
        this._timeZone = timeZone;
        if (timeZone === null || typeof window === "undefined") {
            return;
        }

        const currentHourKey = getLocalHourKey(new Date(), timeZone);
        if (currentHourKey === null) {
            return;
        }

        const currentHourStartMs = new Date(currentHourKey).getTime();
        if (Number.isNaN(currentHourStartMs)) {
            return;
        }

        const delay = Math.max(currentHourStartMs + HOUR_MS - Date.now(), 0) + BOUNDARY_BUFFER_MS;
        this._timer = window.setTimeout(async () => {
            this._timer = null;
            await this._onBoundary?.();
            this._host.requestUpdate();
            this._scheduleNextBoundary();
        }, delay);
    }

    private _clearTimer(): void {
        if (this._timer !== null && typeof window !== "undefined") {
            window.clearTimeout(this._timer);
            this._timer = null;
        }
    }
}

function _normalizeTimeZone(rawTimeZone: string | null | undefined): string | null {
    return typeof rawTimeZone === "string" && rawTimeZone
        ? rawTimeZone
        : null;
}
