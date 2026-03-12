import { LitElement, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { ForecastPayload, HouseConsumptionForecastDTO } from "../../helman-api";
import { FORECAST_REFRESH_MS, loadForecast, refreshForecast } from "../../helman/forecast-loader";
import type { LocalizeFunction } from "../../localize/localize";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";

@customElement("helman-house-forecast-detail")
export class HelmanHouseForecastDetail extends LitElement {

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
        const hc = this._houseConsumption;
        if (!hc || hc.status === "not_configured") {
            return nothing;
        }

        if (hc.status === "insufficient_history") {
            const msg = this.localize("node_detail.house_forecast.insufficient_history")
                .replace("%d", String(hc.requiredHistoryDays ?? 14));
            return html`
                <div class="forecast-section">
                    <div class="section-title">${this.localize("node_detail.house_forecast.title")}</div>
                    <div class="muted">${msg}</div>
                </div>
            `;
        }

        if (hc.status === "unavailable") {
            return html`
                <div class="forecast-section">
                    <div class="section-title">${this.localize("node_detail.house_forecast.title")}</div>
                    <div class="muted">${this.localize("node_detail.house_forecast.unavailable")}</div>
                </div>
            `;
        }

        if (!hc.series.length) {
            return html`
                <div class="forecast-section">
                    <div class="section-title">${this.localize("node_detail.house_forecast.title")}</div>
                    <div class="muted">${this.localize("node_detail.house_forecast.no_data")}</div>
                </div>
            `;
        }

        // Increment 4+ will render the actual forecast chart here.
        return html`
            <div class="forecast-section">
                <div class="section-title">${this.localize("node_detail.house_forecast.title")}</div>
            </div>
        `;
    }

    private get _houseConsumption(): HouseConsumptionForecastDTO | null {
        return this._forecast?.house_consumption ?? null;
    }

    private async _loadInitialForecast(): Promise<void> {
        if (!this.hass) return;
        try {
            this._forecast = await loadForecast(this.hass);
        } catch (err) {
            console.error("helman-house-forecast-detail: failed to load forecast", err);
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
