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

type HouseConsumptionMetric = "baseline" | "total";
type HouseView = HouseConsumptionMetric | "breakdown";
type HouseForecastLabelKey = "node_detail.house_forecast.baseline" | "node_detail.house_forecast.total";

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

interface ConsumerDetailColumnModel {
    timestamp: string;
    valueKwh: number;
    heightPercent: number;
    isPast: boolean;
}

interface ConsumerDetailRowModel {
    entityId: string;
    label: string;
    colorMix: string;
    isPrimary: boolean;
    columns: ConsumerDetailColumnModel[];
}

interface HouseConsumptionPresentation {
    labelKey: HouseForecastLabelKey;
    getDayValue(day: HouseForecastDay): number;
    getHourValue(hour: HouseForecastHour): number;
    getLowerValue(hour: HouseForecastHour): number;
    getUpperValue(hour: HouseForecastHour): number;
    miniChartToneClass: string;
}

interface HouseModelInputs {
    generatedAt: string | null;
    seriesLength: number;
    timeZone: string;
    currentDayKey: string | null;
}

const HOUSE_FORECAST_DETAIL_PANEL_ID = "house-forecast-detail-panel";
const MAX_BAR_HEIGHT = 78;
const CONSUMER_COLOR_PERCENTS = [95, 70, 50, 35] as const;
const PRIMARY_HOUSE_METRIC: HouseConsumptionMetric = "baseline";
const HOUSE_METRIC_ORDER = [PRIMARY_HOUSE_METRIC, "total"] as const;
const HOUSE_VIEW_ORDER: readonly HouseView[] = [...HOUSE_METRIC_ORDER, "breakdown"] as const;
const HOUSE_PRESENTATIONS: Record<HouseConsumptionMetric, HouseConsumptionPresentation> = {
    baseline: {
        labelKey: "node_detail.house_forecast.baseline",
        getDayValue: (day) => day.baselineDayKwh,
        getHourValue: (hour) => hour.baselineKwh,
        getLowerValue: (hour) => hour.baselineLowerKwh,
        getUpperValue: (hour) => hour.baselineUpperKwh,
        miniChartToneClass: "house-baseline",
    },
    total: {
        labelKey: "node_detail.house_forecast.total",
        getDayValue: (day) => day.totalDayKwh,
        getHourValue: (hour) => hour.totalKwh,
        getLowerValue: (hour) => hour.totalLowerKwh,
        getUpperValue: (hour) => hour.totalUpperKwh,
        miniChartToneClass: "house-total",
    },
};

@customElement("helman-house-forecast-detail")
export class HelmanHouseForecastDetail extends LitElement {

    static styles = [nodeDetailSharedStyles];

    private _forecastDays: HouseForecastDay[] = [];
    private _miniChartMaxByMetric: Record<HouseConsumptionMetric, number> = {
        baseline: 0,
        total: 0,
    };
    private _currentLocalParts: LocalDateTimeParts | null = null;
    private _modelInputs?: HouseModelInputs;
    private _forecastRefreshTimer: number | null = null;

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;

    @state() private _forecast: ForecastPayload | null = null;
    @state() private _selectedDayKey: string | null = null;
    @state() private _activeView: HouseView = PRIMARY_HOUSE_METRIC;

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
        this._miniChartMaxByMetric = {
            baseline: this._computeMiniChartMax(this._forecastDays, "baseline"),
            total: this._computeMiniChartMax(this._forecastDays, "total"),
        };
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
        const primaryPresentation = this._getPrimaryPresentation();
        const energyDisplay = this._getEnergyDisplay(primaryPresentation.getDayValue(day));

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
                    aria-label=${this._buildDayCardAriaLabel(day, dayLabel)}
                >
                    <div class="forecast-day-header">
                        <div class="forecast-day-label">${dayLabel}</div>
                        <span class="forecast-day-toggle" aria-hidden="true">${isExpanded ? "−" : "+"}</span>
                    </div>
                    <div class="forecast-day-consumption-value">
                        ${energyDisplay.value}<span class="forecast-day-consumption-unit">${energyDisplay.unit}</span>
                    </div>
                    <div class="forecast-day-mini-charts" aria-hidden="true">
                        ${HOUSE_METRIC_ORDER.map((metric) => this._renderMiniChartRow(day, metric))}
                    </div>
                </button>
            </div>
        `;
    }

    private _renderMiniChartRow(day: HouseForecastDay, metric: HouseConsumptionMetric) {
        const bars = this._buildMiniChartBars(day, metric);
        const toneClass = this._getPresentation(metric).miniChartToneClass;
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
        const isBreakdown = this._activeView === "breakdown";

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
                    ${isBreakdown
                        ? this._renderBreakdownSummary(day)
                        : this._renderStandardSummary(day)}
                </div>
                <div
                    class="forecast-view-toggle"
                    role="group"
                    aria-label=${this.localize("node_detail.house_forecast.hourly_detail")}
                >
                    ${HOUSE_VIEW_ORDER.map((view) => this._renderViewToggleButton(view))}
                </div>
                ${isBreakdown
                    ? this._renderBreakdownChart(day, columns)
                    : this._renderSingleRowChart(columns, hasData)}
            </div>
        `;
    }

    private _renderStandardSummary(day: HouseForecastDay) {
        return html`
            <div class="forecast-detail-summary">
                ${HOUSE_METRIC_ORDER.map((metric) => {
                    const presentation = this._getPresentation(metric);
                    return html`
                        <div class="forecast-detail-summary-item">
                            <span class="forecast-detail-summary-label">
                                ${this.localize(presentation.labelKey)}
                            </span>
                            <span class="forecast-detail-summary-value">
                                ${this._formatEnergy(presentation.getDayValue(day))}
                            </span>
                        </div>
                    `;
                })}
            </div>
        `;
    }

    private _renderBreakdownSummary(day: HouseForecastDay) {
        return html`
            <div class="forecast-detail-summary">
                <div class="forecast-detail-summary-item">
                    <span class="forecast-detail-summary-label">
                        ${this.localize("node_detail.house_forecast.baseline")}
                    </span>
                    <span class="forecast-detail-summary-value">
                        ${this._formatEnergy(day.baselineDayKwh)}
                    </span>
                </div>
                ${day.consumerDaySums.map((consumer) => html`
                    <div class="forecast-detail-summary-item">
                        <span class="forecast-detail-summary-label">
                            ${consumer.label}
                        </span>
                        <span class="forecast-detail-summary-value">
                            ${this._formatEnergy(consumer.totalKwh)}
                        </span>
                    </div>
                `)}
            </div>
        `;
    }

    private _renderSingleRowChart(columns: HouseDetailColumnModel[], hasData: boolean) {
        return html`
            <div
                class="forecast-detail-chart"
                style=${`--forecast-column-count:${Math.max(columns.length, 1)};`}
                aria-hidden="true"
            >
                <div class="forecast-detail-row">
                    <div class="forecast-detail-row-label">
                        ${this.localize(this._getPresentation(this._getSelectedMetric()).labelKey)}
                    </div>
                    <div class="forecast-detail-track ${!hasData ? "empty" : ""}">
                        ${columns.map((col) => this._renderDetailColumn(col))}
                    </div>
                </div>
                ${this._renderDetailAxis(columns)}
            </div>
        `;
    }

    private _renderBreakdownChart(day: HouseForecastDay, axisColumns: HouseDetailColumnModel[]) {
        const rows = this._buildBreakdownRows(day);
        const hasData = axisColumns.length > 0;

        return html`
            <div
                class="forecast-detail-chart"
                style=${`--forecast-column-count:${Math.max(axisColumns.length, 1)};`}
                aria-hidden="true"
            >
                ${rows.map((row) => html`
                    <div class="forecast-detail-row ${row.isPrimary ? "primary" : ""}">
                        <div class="forecast-detail-row-label">${row.label}</div>
                        <div class="forecast-detail-track ${!hasData ? "empty" : ""}">
                            ${row.columns.map((col) => this._renderConsumerDetailColumn(col, row.colorMix))}
                        </div>
                    </div>
                `)}
                ${this._renderDetailAxis(axisColumns)}
            </div>
        `;
    }

    private _renderDetailAxis(columns: HouseDetailColumnModel[]) {
        return html`
            <div class="forecast-detail-axis">
                <div class="forecast-detail-axis-spacer" aria-hidden="true"></div>
                <div class="forecast-detail-axis-grid">
                    ${columns.map((col) => html`
                        <span class="forecast-detail-axis-tick ${col.isPast ? "past" : ""}">${col.hourLabel ?? ""}</span>
                    `)}
                </div>
            </div>
        `;
    }

    private _renderViewToggleButton(view: HouseView) {
        const label = view === "breakdown"
            ? this.localize("node_detail.house_forecast.breakdown")
            : this.localize(this._getPresentation(view).labelKey);

        return html`
            <button
                type="button"
                aria-pressed=${String(this._activeView === view)}
                class="forecast-view-toggle-btn ${this._activeView === view ? "active" : ""}"
                @click=${() => this._setActiveView(view)}
            >
                ${label}
            </button>
        `;
    }

    private _renderConsumerDetailColumn(col: ConsumerDetailColumnModel, colorMix: string) {
        return html`
            <div
                class="forecast-detail-column ${col.isPast ? "past" : ""}"
                title=${`${this._formatHour(col.timestamp)} · ${this._formatEnergy(col.valueKwh)}`}
            >
                ${col.valueKwh > 0 ? html`
                    <span
                        class="forecast-detail-bar"
                        style=${`color:${colorMix}; --forecast-bar-height:${col.heightPercent}%; --forecast-bar-offset:0%;`}
                    ></span>
                ` : nothing}
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

    private _computeMiniChartMax(days: HouseForecastDay[], metric: HouseConsumptionMetric): number {
        const presentation = this._getPresentation(metric);
        return Math.max(
            ...days.flatMap((day) => day.hours.map((h) => presentation.getHourValue(h))),
            0,
        );
    }

    private _buildMiniChartBars(day: HouseForecastDay, metric: HouseConsumptionMetric): HouseMiniChartBar[] {
        const presentation = this._getPresentation(metric);
        const maxValue = this._miniChartMaxByMetric[metric];

        return day.hours.map((hour) => ({
            heightPercent: this._normalizeBarHeight(
                Math.max(presentation.getHourValue(hour), 0),
                maxValue,
                100,
            ),
            isPast: this._isPastTimestamp(hour.timestamp, day),
        }));
    }

    private _buildDetailColumns(day: HouseForecastDay): HouseDetailColumnModel[] {
        const selectedMetric = this._getSelectedMetric();
        const presentation = this._getPresentation(selectedMetric);
        const hours = day.hours;
        if (hours.length === 0) {
            return [];
        }

        const maxValue = Math.max(
            ...hours.map((h) => Math.max(presentation.getHourValue(h), 0)),
            0,
        );
        const sparseLabels = this._buildSparseHourLabelMap(hours);

        let maxIndex = 0;
        let maxKwh = 0;
        for (let i = 0; i < hours.length; i++) {
            const v = presentation.getHourValue(hours[i]);
            if (v > maxKwh) {
                maxKwh = v;
                maxIndex = i;
            }
        }

        return hours.map((hour, index) => {
            const valueKwh = presentation.getHourValue(hour);
            const lowerKwh = presentation.getLowerValue(hour);
            const upperKwh = presentation.getUpperValue(hour);

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

    private _buildBreakdownRows(day: HouseForecastDay): ConsumerDetailRowModel[] {
        const hours = day.hours;
        if (hours.length === 0) {
            return [];
        }

        const allValues = hours.flatMap((h) => [
            h.baselineKwh,
            ...h.consumers.map((c) => c.valueKwh),
        ]);
        const maxValue = Math.max(...allValues.map((v) => Math.max(v, 0)), 0);

        const rows: ConsumerDetailRowModel[] = [];

        const baselineColumns: ConsumerDetailColumnModel[] = hours.map((hour) => ({
            timestamp: hour.timestamp,
            valueKwh: hour.baselineKwh,
            heightPercent: this._normalizeBarHeight(Math.max(hour.baselineKwh, 0), maxValue, MAX_BAR_HEIGHT),
            isPast: this._isPastTimestamp(hour.timestamp, day),
        }));
        rows.push({
            entityId: "__baseline__",
            label: this.localize("node_detail.house_forecast.baseline"),
            colorMix: "var(--primary-color)",
            isPrimary: true,
            columns: baselineColumns,
        });

        for (let i = 0; i < day.consumerDaySums.length; i++) {
            const { entityId, label } = day.consumerDaySums[i];
            const pct = CONSUMER_COLOR_PERCENTS[i % CONSUMER_COLOR_PERCENTS.length];
            const colorMix = `color-mix(in srgb, var(--primary-color) ${pct}%, transparent)`;

            const columns: ConsumerDetailColumnModel[] = hours.map((hour) => {
                const valueKwh = hour.consumers.find((c) => c.entityId === entityId)?.valueKwh ?? 0;
                return {
                    timestamp: hour.timestamp,
                    valueKwh,
                    heightPercent: this._normalizeBarHeight(Math.max(valueKwh, 0), maxValue, MAX_BAR_HEIGHT),
                    isPast: this._isPastTimestamp(hour.timestamp, day),
                };
            });

            rows.push({ entityId, label, colorMix, isPrimary: false, columns });
        }

        return rows;
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

    private _getPrimaryPresentation(): HouseConsumptionPresentation {
        return this._getPresentation(PRIMARY_HOUSE_METRIC);
    }

    private _getSelectedMetric(): HouseConsumptionMetric {
        return this._activeView === "total" ? "total" : PRIMARY_HOUSE_METRIC;
    }

    private _getPresentation(metric: HouseConsumptionMetric): HouseConsumptionPresentation {
        return HOUSE_PRESENTATIONS[metric];
    }

    private _buildDayCardAriaLabel(day: HouseForecastDay, dayLabel: string): string {
        const values = HOUSE_METRIC_ORDER
            .map((metric) => {
                const presentation = this._getPresentation(metric);
                return `${this.localize(presentation.labelKey)} ${this._formatEnergy(presentation.getDayValue(day))}`;
            })
            .join(". ");

        return `${this.localize("node_detail.house_forecast.title")}: ${dayLabel}. ${values}`;
    }

    private _setActiveView(view: HouseView): void {
        this._activeView = view;
    }

    private async _toggleDay(dayKey: string): Promise<void> {
        const nextDayKey = this._selectedDayKey === dayKey ? null : dayKey;
        const isOpeningDay = nextDayKey !== null && nextDayKey !== this._selectedDayKey;
        this._selectedDayKey = nextDayKey;
        if (isOpeningDay) {
            this._activeView = PRIMARY_HOUSE_METRIC;
        }

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
