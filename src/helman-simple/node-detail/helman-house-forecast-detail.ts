import { LitElement, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { ForecastPayload, HouseConsumptionForecastDTO } from "../../helman-api";
import { getDisplayEnergyUnit } from "../../helman/energy-unit-converter";
import { FORECAST_REFRESH_MS, loadForecast, refreshForecast } from "../../helman/forecast-loader";
import type { LocalizeFunction } from "../../localize/localize";
import {
    buildHouseForecastModel,
    type HouseForecastDay,
    type HouseForecastHour,
} from "./house-forecast-detail-model";
import {
    getCachedLocalDateTimeParts,
    type LocalDateTimeParts,
} from "./local-date-time-parts-cache";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";

type HouseView = "total" | "baseline";

interface HouseMiniChartBar {
    heightPercent: number;
    isPast: boolean;
}

interface HouseDetailColumnModel {
    timestamp: string;
    valueKwh: number;
    heightPercent: number;
    bandLowerPercent: number;
    bandUpperPercent: number;
    hourLabel: string | null;
    isMax: boolean;
    isPast: boolean;
}

interface HouseModelInputs {
    generatedAt: string | null;
    seriesLength: number;
    timeZone: string;
    currentDayKey: string | null;
}

const HOUSE_FORECAST_DETAIL_PANEL_ID = "house-forecast-detail-panel";
const MAX_BAR_HEIGHT = 78;

@customElement("helman-house-forecast-detail")
export class HelmanHouseForecastDetail extends LitElement {

    static styles = [nodeDetailSharedStyles];

    private _forecastDays: HouseForecastDay[] = [];
    private _miniChartMaxTotalKwh = 0;
    private _miniChartMaxBaselineKwh = 0;
    private _currentLocalParts: LocalDateTimeParts | null = null;
    private _modelInputs?: HouseModelInputs;
    private _forecastRefreshTimer: number | null = null;

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;

    @state() private _forecast: ForecastPayload | null = null;
    @state() private _selectedDayKey: string | null = null;
    @state() private _activeView: HouseView = "total";

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

        this._forecastDays = buildHouseForecastModel({
            series: this._houseConsumption?.series ?? [],
            timeZone: next.timeZone,
            now,
        });
        this._miniChartMaxTotalKwh = this._computeMiniChartMax(this._forecastDays, "total");
        this._miniChartMaxBaselineKwh = this._computeMiniChartMax(this._forecastDays, "baseline");
        this._modelInputs = next;
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

        const days = this._forecastDays;
        if (days.length === 0) {
            return html`
                <div class="forecast-section">
                    <div class="section-title">${this.localize("node_detail.house_forecast.title")}</div>
                    <div class="muted">${this.localize("node_detail.house_forecast.no_data")}</div>
                </div>
            `;
        }

        const selectedDay = days.find((d) => d.dayKey === this._selectedDayKey) ?? null;

        return html`
            <div class="forecast-section">
                <div class="section-title">${this.localize("node_detail.house_forecast.title")}</div>
                <div class="forecast-detail-days">
                    ${days.map((day) => this._renderDayCard(day))}
                </div>
                ${selectedDay !== null ? this._renderDetailPanel(selectedDay) : nothing}
            </div>
        `;
    }

    private _renderDayCard(day: HouseForecastDay) {
        const isExpanded = this._selectedDayKey === day.dayKey;
        const dayLabel = this._formatDayLabel(day);
        const energyDisplay = this._getEnergyDisplay(day.totalDayKwh);

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
                    aria-controls=${isExpanded ? HOUSE_FORECAST_DETAIL_PANEL_ID : nothing}
                    aria-label=${`${this.localize("node_detail.house_forecast.title")}: ${dayLabel}. ${this._formatEnergy(day.totalDayKwh)}`}
                >
                    <div class="forecast-day-header">
                        <div class="forecast-day-label">${dayLabel}</div>
                        <span class="forecast-day-toggle" aria-hidden="true">${isExpanded ? "−" : "+"}</span>
                    </div>
                    <div class="forecast-day-consumption-value">
                        ${energyDisplay.value}<span class="forecast-day-consumption-unit">${energyDisplay.unit}</span>
                    </div>
                    <div class="forecast-day-mini-charts" aria-hidden="true">
                        ${this._renderMiniChartRow(day, "total")}
                        ${this._renderMiniChartRow(day, "baseline")}
                    </div>
                </button>
            </div>
        `;
    }

    private _renderMiniChartRow(day: HouseForecastDay, view: HouseView) {
        const bars = this._buildMiniChartBars(day, view);
        const toneClass = view === "total" ? "house-total" : "house-baseline";
        const isEmpty = bars.length === 0;

        return html`
            <div class="forecast-day-chart-row">
                <div class="forecast-day-chart-track ${isEmpty ? "empty" : ""}">
                    ${bars.map((bar) => html`
                        <span
                            class="forecast-day-chart-bar ${toneClass} ${bar.isPast ? "past" : ""}"
                            style=${`--forecast-bar-height:${bar.heightPercent}%;`}
                        ></span>
                    `)}
                </div>
            </div>
        `;
    }

    private _renderDetailPanel(day: HouseForecastDay) {
        const dayLabel = this._formatDayLabel(day);
        const columns = this._buildDetailColumns(day);
        const hasData = columns.length > 0;

        return html`
            <div
                id=${HOUSE_FORECAST_DETAIL_PANEL_ID}
                class="forecast-detail-panel"
                role="region"
                aria-label=${`${dayLabel}. ${this.localize("node_detail.house_forecast.hourly_detail")}`}
            >
                <div class="forecast-detail-panel-header">
                    <div class="forecast-detail-panel-heading">
                        <div class="forecast-detail-panel-title">${dayLabel}</div>
                        <div class="forecast-detail-panel-subtitle">
                            ${this.localize("node_detail.house_forecast.hourly_detail")}
                        </div>
                    </div>
                    <div class="forecast-detail-summary">
                        <div class="forecast-detail-summary-item">
                            <span class="forecast-detail-summary-label">
                                ${this.localize("node_detail.house_forecast.total")}
                            </span>
                            <span class="forecast-detail-summary-value">
                                ${this._formatEnergy(day.totalDayKwh)}
                            </span>
                        </div>
                        <div class="forecast-detail-summary-item">
                            <span class="forecast-detail-summary-label">
                                ${this.localize("node_detail.house_forecast.baseline")}
                            </span>
                            <span class="forecast-detail-summary-value">
                                ${this._formatEnergy(day.baselineDayKwh)}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="forecast-view-toggle">
                    <button
                        type="button"
                        class="forecast-view-toggle-btn ${this._activeView === "total" ? "active" : ""}"
                        @click=${() => this._setActiveView("total")}
                    >
                        ${this.localize("node_detail.house_forecast.total")}
                    </button>
                    <button
                        type="button"
                        class="forecast-view-toggle-btn ${this._activeView === "baseline" ? "active" : ""}"
                        @click=${() => this._setActiveView("baseline")}
                    >
                        ${this.localize("node_detail.house_forecast.baseline")}
                    </button>
                </div>
                <div
                    class="forecast-detail-chart"
                    style=${`--forecast-column-count:${Math.max(columns.length, 1)};`}
                    aria-hidden="true"
                >
                    <div class="forecast-detail-row">
                        <div class="forecast-detail-row-label">
                            ${this._activeView === "total"
                                ? this.localize("node_detail.house_forecast.total")
                                : this.localize("node_detail.house_forecast.baseline")}
                        </div>
                        <div class="forecast-detail-track ${!hasData ? "empty" : ""}">
                            ${columns.map((col) => this._renderDetailColumn(col))}
                        </div>
                    </div>
                    <div class="forecast-detail-axis">
                        <div class="forecast-detail-axis-spacer" aria-hidden="true"></div>
                        <div class="forecast-detail-axis-grid">
                            ${columns.map((col) => html`
                                <span class="forecast-detail-axis-tick ${col.isPast ? "past" : ""}">${col.hourLabel ?? ""}</span>
                            `)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private _renderDetailColumn(col: HouseDetailColumnModel) {
        return html`
            <div
                class="forecast-detail-column ${col.isPast ? "past" : ""}"
                title=${`${this._formatHour(col.timestamp)} · ${this._formatEnergy(col.valueKwh)}`}
            >
                ${col.isMax && col.valueKwh > 0 ? html`
                    <span class="forecast-detail-highlight top">
                        ↑ ${this._formatEnergy(col.valueKwh)}
                    </span>
                ` : nothing}
                ${col.valueKwh > 0 ? html`
                    <span
                        class="forecast-detail-bar house-consumption"
                        style=${`--forecast-bar-height:${col.heightPercent}%; --forecast-bar-offset:0%;`}
                    ></span>
                ` : nothing}
                ${col.bandLowerPercent > 0 ? html`
                    <span
                        class="forecast-detail-band lower"
                        style=${`--forecast-band-offset:${col.bandLowerPercent}%;`}
                    ></span>
                ` : nothing}
                ${col.bandUpperPercent > 0 ? html`
                    <span
                        class="forecast-detail-band upper"
                        style=${`--forecast-band-offset:${col.bandUpperPercent}%;`}
                    ></span>
                ` : nothing}
            </div>
        `;
    }

    private get _houseConsumption(): HouseConsumptionForecastDTO | null {
        return this._forecast?.house_consumption ?? null;
    }

    private _buildModelInputs(): HouseModelInputs {
        const hc = this._houseConsumption;
        return {
            generatedAt: hc?.generatedAt ?? null,
            seriesLength: hc?.series.length ?? 0,
            timeZone: this.hass?.config.time_zone ?? "UTC",
            currentDayKey: this._currentLocalParts?.dayKey ?? null,
        };
    }

    private _haveModelInputsChanged(next: HouseModelInputs): boolean {
        return this._modelInputs?.generatedAt !== next.generatedAt
            || this._modelInputs?.seriesLength !== next.seriesLength
            || this._modelInputs?.timeZone !== next.timeZone
            || this._modelInputs?.currentDayKey !== next.currentDayKey;
    }

    private _computeMiniChartMax(days: HouseForecastDay[], view: HouseView): number {
        return Math.max(
            ...days.flatMap((day) => day.hours.map((h) =>
                view === "total" ? h.totalKwh : h.baselineKwh,
            )),
            0,
        );
    }

    private _buildMiniChartBars(day: HouseForecastDay, view: HouseView): HouseMiniChartBar[] {
        const maxValue = view === "total" ? this._miniChartMaxTotalKwh : this._miniChartMaxBaselineKwh;

        return day.hours.map((hour) => ({
            heightPercent: this._normalizeBarHeight(
                Math.max(view === "total" ? hour.totalKwh : hour.baselineKwh, 0),
                maxValue,
                100,
            ),
            isPast: this._isPastTimestamp(hour.timestamp, day),
        }));
    }

    private _buildDetailColumns(day: HouseForecastDay): HouseDetailColumnModel[] {
        const isTotal = this._activeView === "total";
        const hours = day.hours;
        if (hours.length === 0) {
            return [];
        }

        const maxValue = Math.max(
            ...hours.map((h) => Math.max(isTotal ? h.totalKwh : h.baselineKwh, 0)),
            0,
        );
        const sparseLabels = this._buildSparseHourLabelMap(hours);

        let maxIndex = 0;
        let maxKwh = 0;
        for (let i = 0; i < hours.length; i++) {
            const v = isTotal ? hours[i].totalKwh : hours[i].baselineKwh;
            if (v > maxKwh) {
                maxKwh = v;
                maxIndex = i;
            }
        }

        return hours.map((hour, index) => {
            const valueKwh = isTotal ? hour.totalKwh : hour.baselineKwh;
            const lowerKwh = isTotal ? hour.totalLowerKwh : hour.baselineLowerKwh;
            const upperKwh = isTotal ? hour.totalUpperKwh : hour.baselineUpperKwh;

            return {
                timestamp: hour.timestamp,
                valueKwh,
                heightPercent: this._normalizeBarHeight(Math.max(valueKwh, 0), maxValue, MAX_BAR_HEIGHT),
                bandLowerPercent: maxValue > 0 ? Math.min((Math.max(lowerKwh, 0) / maxValue) * MAX_BAR_HEIGHT, MAX_BAR_HEIGHT) : 0,
                bandUpperPercent: maxValue > 0 ? Math.min((Math.max(upperKwh, 0) / maxValue) * MAX_BAR_HEIGHT, MAX_BAR_HEIGHT) : 0,
                hourLabel: sparseLabels.get(index) ?? null,
                isMax: index === maxIndex && maxKwh > 0,
                isPast: this._isPastTimestamp(hour.timestamp, day),
            };
        });
    }

    private _normalizeBarHeight(value: number, maxValue: number, maxHeightPercent: number): number {
        if (value <= 0 || maxValue <= 0) {
            return 0;
        }

        return Math.max((value / maxValue) * maxHeightPercent, maxHeightPercent * 0.12);
    }

    private _buildSparseHourLabelMap(hours: HouseForecastHour[]): Map<number, string> {
        if (hours.length === 0) {
            return new Map();
        }

        const targetIndices = hours.length <= 6
            ? hours.map((_, index) => index)
            : [
                0,
                Math.round((hours.length - 1) / 3),
                Math.round(((hours.length - 1) * 2) / 3),
                hours.length - 1,
            ];
        const labelIndices = new Set<number>();

        for (const targetIndex of targetIndices) {
            let bestIndex = targetIndex;
            let bestDistance = Number.POSITIVE_INFINITY;

            for (let index = 0; index < hours.length; index++) {
                if (labelIndices.has(index)) {
                    continue;
                }

                const parts = this._getLocalDateTimeParts(hours[index].timestamp);
                if (parts === null || parts.hour % 6 !== 0) {
                    continue;
                }

                const distance = Math.abs(index - targetIndex);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestIndex = index;
                }
            }

            labelIndices.add(bestIndex);
        }

        for (const targetIndex of targetIndices) {
            if (labelIndices.size >= Math.min(targetIndices.length, hours.length)) {
                break;
            }

            labelIndices.add(targetIndex);
        }

        return new Map(
            Array.from(labelIndices)
                .sort((a, b) => a - b)
                .map((index) => [index, this._formatHourAxisLabel(hours[index].timestamp)]),
        );
    }

    private _isPastTimestamp(timestamp: string, day: HouseForecastDay): boolean {
        if (!day.isToday || this._currentLocalParts === null) {
            return false;
        }

        const parts = this._getLocalDateTimeParts(timestamp);
        if (parts === null) {
            return false;
        }

        return parts.dayKey === this._currentLocalParts.dayKey && parts.hour < this._currentLocalParts.hour;
    }

    private _formatDayLabel(day: HouseForecastDay): string {
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

    private _formatEnergy(valueKwh: number): string {
        const display = this._getEnergyDisplay(valueKwh);
        return `${display.value} ${display.unit}`;
    }

    private _getEnergyDisplay(valueKwh: number): { value: string; unit: string } {
        const display = getDisplayEnergyUnit(valueKwh);
        const fractionDigits = display.unit === "Wh" ? 0 : 1;
        return {
            value: display.value.toFixed(fractionDigits),
            unit: display.unit,
        };
    }

    private _formatHour(timestamp: string): string {
        return new Date(timestamp).toLocaleTimeString(
            this.hass.locale?.language || navigator.language,
            {
                timeZone: this.hass.config.time_zone,
                hour: "2-digit",
                minute: "2-digit",
            },
        );
    }

    private _formatHourAxisLabel(timestamp: string): string {
        return new Date(timestamp).toLocaleTimeString(
            this.hass.locale?.language || navigator.language,
            {
                timeZone: this.hass.config.time_zone,
                hour: "2-digit",
                hourCycle: "h23",
            },
        );
    }

    private _getLocalDateTimeParts(value: Date | string): LocalDateTimeParts | null {
        return getCachedLocalDateTimeParts(value, this.hass.config.time_zone);
    }

    private _setActiveView(view: HouseView): void {
        this._activeView = view;
    }

    private async _toggleDay(dayKey: string): Promise<void> {
        this._selectedDayKey = this._selectedDayKey === dayKey ? null : dayKey;
        if (this._selectedDayKey === null) {
            return;
        }

        await this.updateComplete;
        this.renderRoot.querySelector<HTMLElement>(`#${HOUSE_FORECAST_DETAIL_PANEL_ID}`)?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
        });
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
