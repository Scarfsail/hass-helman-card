import { LitElement, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { BatteryCapacityForecastDTO, ForecastPayload } from "../../helman-api";
import { FORECAST_REFRESH_MS, loadForecast, refreshForecast } from "../../helman/forecast-loader";
import type { LocalizeFunction } from "../../localize/localize";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";

@customElement("helman-battery-forecast-detail")
export class HelmanBatteryForecastDetail extends LitElement {
    static styles = [nodeDetailSharedStyles];

    private _forecastRefreshTimer: number | null = null;

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;

    @state() private _forecast: ForecastPayload | null = null;

    connectedCallback(): void {
        super.connectedCallback();
        void this._loadInitialForecast();
        this._startForecastRefreshTimer();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this._clearForecastRefreshTimer();
    }

    render() {
        if (!this.localize) return nothing;
        const batteryForecast = this._batteryForecast;
        if (!batteryForecast) return nothing;

        const hasSeries = batteryForecast.series.length > 0;

        return html`
            <div class="forecast-section">
                <div class="section-title">${this.localize("node_detail.battery_forecast.title")}</div>
                <div class="detail-row">
                    <span class="label">${this.localize("node_detail.battery_forecast.status_label")}</span>
                    <span class="value">${this._getStatusLabel(batteryForecast.status)}</span>
                </div>
                ${batteryForecast.status === "partial" && batteryForecast.coverageUntil ? html`
                    <div class="detail-row">
                        <span class="label">${this.localize("node_detail.battery_forecast.coverage_until")}</span>
                        <span class="value">${this._formatTimestamp(batteryForecast.coverageUntil)}</span>
                    </div>
                ` : nothing}
                ${this._renderBody(batteryForecast, hasSeries)}
            </div>
        `;
    }

    private _renderBody(forecast: BatteryCapacityForecastDTO, hasSeries: boolean) {
        switch (forecast.status) {
            case "not_configured":
                return html`<div class="muted">${this.localize("node_detail.battery_forecast.not_configured")}</div>`;
            case "insufficient_history":
                return html`<div class="muted">${this.localize("node_detail.battery_forecast.insufficient_history")}</div>`;
            case "unavailable":
                return html`<div class="muted">${this.localize("node_detail.battery_forecast.unavailable")}</div>`;
            case "partial":
                return html`
                    <div class="forecast-status-note">${this._getPartialNote(forecast.partialReason)}</div>
                    <div class="muted">
                        ${hasSeries
                            ? this.localize("node_detail.battery_forecast.detail_coming_soon")
                            : this.localize("node_detail.battery_forecast.no_data")}
                    </div>
                `;
            case "available":
                return html`
                    <div class="muted">
                        ${hasSeries
                            ? this.localize("node_detail.battery_forecast.detail_coming_soon")
                            : this.localize("node_detail.battery_forecast.no_data")}
                    </div>
                `;
        }
    }

    private _getStatusLabel(status: BatteryCapacityForecastDTO["status"]): string {
        return this.localize(`node_detail.battery_forecast.status_${status}`);
    }

    private _getPartialNote(partialReason: string | null): string {
        switch (partialReason) {
            case "missing_current_hour_solar":
                return this.localize("node_detail.battery_forecast.partial_reason_missing_current_hour_solar");
            case "solar_forecast_ended":
                return this.localize("node_detail.battery_forecast.partial_reason_solar_forecast_ended");
            default:
                return this.localize("node_detail.battery_forecast.partial_note");
        }
    }

    private _formatTimestamp(value: string): string {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return new Intl.DateTimeFormat(this.hass.locale?.language ?? this.hass.language ?? "cs", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: this.hass.config.time_zone ?? "UTC",
        }).format(date);
    }

    private get _batteryForecast(): BatteryCapacityForecastDTO | null {
        return this._forecast?.battery_capacity ?? null;
    }

    private async _loadInitialForecast(): Promise<void> {
        if (!this.hass) return;

        try {
            this._forecast = await loadForecast(this.hass);
        } catch (err) {
            console.error("helman-battery-forecast-detail: failed to load forecast", err);
        }
    }

    private _startForecastRefreshTimer(): void {
        this._clearForecastRefreshTimer();
        this._forecastRefreshTimer = window.setInterval(() => {
            if (!this.hass) return;
            void this._refreshForecast();
        }, FORECAST_REFRESH_MS);
    }

    private _clearForecastRefreshTimer(): void {
        if (this._forecastRefreshTimer !== null) {
            window.clearInterval(this._forecastRefreshTimer);
            this._forecastRefreshTimer = null;
        }
    }

    private async _refreshForecast(): Promise<void> {
        this._forecast = await refreshForecast(this.hass, this._forecast);
    }
}
