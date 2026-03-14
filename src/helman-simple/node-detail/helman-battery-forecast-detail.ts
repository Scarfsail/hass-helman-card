import { LitElement, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { BatteryCapacityForecastDTO, ForecastPayload } from "../../helman-api";
import { getDisplayEnergyUnit } from "../../helman/energy-unit-converter";
import { FORECAST_REFRESH_MS, loadForecast, refreshForecast } from "../../helman/forecast-loader";
import type { LocalizeFunction } from "../../localize/localize";
import {
    buildBatteryCapacityForecastModel,
    type BatteryCapacityForecastDay,
} from "./battery-capacity-forecast-detail-model";
import {
    getCachedLocalDateTimeParts,
    type LocalDateTimeParts,
} from "./local-date-time-parts-cache";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";

interface BatteryModelInputs {
    generatedAt: string | null;
    status: BatteryCapacityForecastDTO["status"] | null;
    seriesLength: number;
    coverageUntil: string | null;
    currentSoc: number | null;
    timeZone: string;
    currentDayKey: string | null;
}

const BATTERY_FORECAST_DETAIL_PANEL_ID = "battery-forecast-detail-panel";

@customElement("helman-battery-forecast-detail")
export class HelmanBatteryForecastDetail extends LitElement {
    static styles = [nodeDetailSharedStyles];

    private _forecastDays: BatteryCapacityForecastDay[] = [];
    private _currentLocalParts: LocalDateTimeParts | null = null;
    private _modelInputs?: BatteryModelInputs;
    private _forecastRefreshTimer: number | null = null;

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;

    @state() private _forecast: ForecastPayload | null = null;
    @state() private _selectedDayKey: string | null = null;

    connectedCallback(): void {
        super.connectedCallback();
        void this._loadInitialForecast();
        this._startForecastRefreshTimer();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this._clearForecastRefreshTimer();
    }

    willUpdate(changedProperties: Map<string, unknown>): void {
        super.willUpdate(changedProperties);

        const now = new Date();
        this._currentLocalParts = getCachedLocalDateTimeParts(now, this.hass?.config.time_zone ?? "UTC");

        const next = this._buildModelInputs();
        if (!this._haveModelInputsChanged(next)) {
            return;
        }

        this._forecastDays = buildBatteryCapacityForecastModel({
            series: this._batteryForecast?.series ?? [],
            currentSoc: this._batteryForecast?.currentSoc ?? null,
            timeZone: next.timeZone,
            now,
        });

        if (this._selectedDayKey !== null && !this._forecastDays.some((day) => day.dayKey === this._selectedDayKey)) {
            this._selectedDayKey = null;
        }

        this._modelInputs = next;
    }

    render() {
        if (!this.localize) return nothing;
        const batteryForecast = this._batteryForecast;
        if (!batteryForecast) return nothing;

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
                ${this._renderBody(batteryForecast)}
            </div>
        `;
    }

    private _renderBody(forecast: BatteryCapacityForecastDTO) {
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
                    ${this._renderDayCards()}
                `;
            case "available":
                return this._renderDayCards();
        }
    }

    private _renderDayCards() {
        if (this._forecastDays.length === 0) {
            return html`<div class="muted">${this.localize("node_detail.battery_forecast.no_data")}</div>`;
        }

        const selectedDay = this._forecastDays.find((day) => day.dayKey === this._selectedDayKey) ?? null;

        return html`
            <div class="forecast-detail-days">
                ${this._forecastDays.map((day) => this._renderDayCard(day))}
            </div>
            ${selectedDay !== null ? this._renderSelectedDayPanel(selectedDay) : nothing}
        `;
    }

    private _renderDayCard(day: BatteryCapacityForecastDay) {
        const isExpanded = this._selectedDayKey === day.dayKey;
        const dayLabel = this._formatDayLabel(day);
        const primaryLabel = this._getPrimaryLabel(day);
        const energyLabel = this._getEnergyLabel(day);

        return html`
            <div
                class="forecast-day-card ${day.isToday ? "today" : ""} ${isExpanded ? "expanded" : ""}"
                data-day-key=${day.dayKey}
            >
                <button
                    type="button"
                    class="forecast-day-summary"
                    @click=${() => this._toggleDay(day.dayKey)}
                    aria-expanded=${String(isExpanded)}
                    aria-controls=${isExpanded ? BATTERY_FORECAST_DETAIL_PANEL_ID : nothing}
                    aria-label=${this._buildDayCardAriaLabel(day, dayLabel, primaryLabel, energyLabel)}
                >
                    <div class="forecast-day-header">
                        <div class="forecast-day-label">${dayLabel}</div>
                        <span class="forecast-day-toggle" aria-hidden="true">${isExpanded ? "−" : "+"}</span>
                    </div>
                    <div class="forecast-day-primary-label">${primaryLabel}</div>
                    <div class="forecast-day-consumption-value">
                        ${this._formatSoc(day.endSocPct)}<span class="forecast-day-consumption-unit">%</span>
                    </div>
                    <div class="forecast-day-secondary-metric">
                        <span class="forecast-day-secondary-label">
                            ${this.localize("node_detail.battery_forecast.soc_range")}
                        </span>
                        <span class="forecast-day-secondary-value">
                            ${this._formatSocRange(day.minSocPct, day.maxSocPct)}
                        </span>
                    </div>
                    <div class="forecast-day-secondary-metric">
                        <span class="forecast-day-secondary-label">${energyLabel}</span>
                        <span class="forecast-day-secondary-value">
                            ${this._formatEnergy(day.endRemainingEnergyKwh)}
                        </span>
                    </div>
                </button>
            </div>
        `;
    }

    private _renderSelectedDayPanel(day: BatteryCapacityForecastDay) {
        const dayLabel = this._formatDayLabel(day);
        const primaryLabel = this._getPrimaryLabel(day);
        const energyLabel = this._getEnergyLabel(day);

        return html`
            <div
                id=${BATTERY_FORECAST_DETAIL_PANEL_ID}
                class="forecast-detail-panel"
                role="region"
                aria-label=${`${dayLabel}. ${this.localize("node_detail.battery_forecast.daily_summary")}`}
            >
                <div class="forecast-detail-panel-header">
                    <div class="forecast-detail-panel-heading">
                        <div class="forecast-detail-panel-title">${dayLabel}</div>
                        <div class="forecast-detail-panel-subtitle">
                            ${this.localize("node_detail.battery_forecast.daily_summary")}
                        </div>
                    </div>
                </div>
                <div class="forecast-detail-summary">
                    ${this._renderSummaryItem(
                        primaryLabel,
                        this._formatSocWithUnit(day.endSocPct),
                    )}
                    ${this._renderSummaryItem(
                        this.localize("node_detail.battery_forecast.min_soc"),
                        this._formatSocWithUnit(day.minSocPct),
                    )}
                    ${this._renderSummaryItem(
                        this.localize("node_detail.battery_forecast.max_soc"),
                        this._formatSocWithUnit(day.maxSocPct),
                    )}
                    ${this._renderSummaryItem(
                        energyLabel,
                        this._formatEnergy(day.endRemainingEnergyKwh),
                    )}
                </div>
                ${!day.coversDayEnd ? html`
                    <div class="detail-row">
                        <span class="label">${this.localize("node_detail.battery_forecast.coverage_until")}</span>
                        <span class="value">${this._formatTimestamp(day.coverageEndsAt)}</span>
                    </div>
                ` : nothing}
            </div>
        `;
    }

    private _renderSummaryItem(label: string, value: string) {
        return html`
            <div class="forecast-detail-summary-item">
                <span class="forecast-detail-summary-label">${label}</span>
                <span class="forecast-detail-summary-value">${value}</span>
            </div>
        `;
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

    private _buildModelInputs(): BatteryModelInputs {
        const batteryForecast = this._batteryForecast;

        return {
            generatedAt: batteryForecast?.generatedAt ?? null,
            status: batteryForecast?.status ?? null,
            seriesLength: batteryForecast?.series.length ?? 0,
            coverageUntil: batteryForecast?.coverageUntil ?? null,
            currentSoc: batteryForecast?.currentSoc ?? null,
            timeZone: this.hass?.config.time_zone ?? "UTC",
            currentDayKey: this._currentLocalParts?.dayKey ?? null,
        };
    }

    private _haveModelInputsChanged(next: BatteryModelInputs): boolean {
        return this._modelInputs?.generatedAt !== next.generatedAt
            || this._modelInputs?.status !== next.status
            || this._modelInputs?.seriesLength !== next.seriesLength
            || this._modelInputs?.coverageUntil !== next.coverageUntil
            || this._modelInputs?.currentSoc !== next.currentSoc
            || this._modelInputs?.timeZone !== next.timeZone
            || this._modelInputs?.currentDayKey !== next.currentDayKey;
    }

    private _toggleDay(dayKey: string): void {
        this._selectedDayKey = this._selectedDayKey === dayKey ? null : dayKey;
    }

    private _getPrimaryLabel(day: BatteryCapacityForecastDay): string {
        return day.coversDayEnd
            ? this.localize("node_detail.battery_forecast.end_soc")
            : this.localize("node_detail.battery_forecast.last_soc");
    }

    private _getEnergyLabel(day: BatteryCapacityForecastDay): string {
        return day.coversDayEnd
            ? this.localize("node_detail.battery_forecast.end_energy")
            : this.localize("node_detail.battery_forecast.last_energy");
    }

    private _formatDayLabel(day: BatteryCapacityForecastDay): string {
        if (day.isToday) {
            return this.localize("node_detail.forecast_detail.today");
        }

        if (day.isTomorrow) {
            return this.localize("node_detail.forecast_detail.tomorrow");
        }

        return new Date(`${day.dayKey}T00:00:00Z`).toLocaleDateString(
            this.hass.locale?.language || navigator.language,
            {
                timeZone: "UTC",
                weekday: "short",
                day: "numeric",
                month: "numeric",
            },
        );
    }

    private _formatSoc(value: number): string {
        return value.toFixed(0);
    }

    private _formatSocWithUnit(value: number): string {
        return `${this._formatSoc(value)} %`;
    }

    private _formatSocRange(minSoc: number, maxSoc: number): string {
        return `${this._formatSoc(minSoc)}–${this._formatSoc(maxSoc)} %`;
    }

    private _formatEnergy(valueKwh: number): string {
        const display = getDisplayEnergyUnit(valueKwh);
        const fractionDigits = display.unit === "Wh" ? 0 : 1;
        return `${display.value.toFixed(fractionDigits)} ${display.unit}`;
    }

    private _buildDayCardAriaLabel(
        day: BatteryCapacityForecastDay,
        dayLabel: string,
        primaryLabel: string,
        energyLabel: string,
    ): string {
        const parts = [
            dayLabel,
            `${primaryLabel}: ${this._formatSocWithUnit(day.endSocPct)}`,
            `${this.localize("node_detail.battery_forecast.soc_range")}: ${this._formatSocRange(day.minSocPct, day.maxSocPct)}`,
            `${energyLabel}: ${this._formatEnergy(day.endRemainingEnergyKwh)}`,
        ];

        if (!day.coversDayEnd) {
            parts.push(`${this.localize("node_detail.battery_forecast.coverage_until")}: ${this._formatTimestamp(day.coverageEndsAt)}`);
        }

        return parts.join(". ");
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
