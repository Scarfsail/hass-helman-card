import { LitElement, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { ForecastPayload, HouseConsumptionForecastDTO } from "../../helman-api";
import { getDisplayEnergyUnit } from "../../helman/energy-unit-converter";
import { FORECAST_REFRESH_MS, loadForecast, refreshForecast } from "../../helman/forecast-loader";
import type { LocalizeFunction } from "../../localize/localize";
import {
    buildHouseDeferrableBreakdownRows,
    buildHouseDetailColumns,
    buildHouseMiniChartBars,
    computeHouseMetricMax,
    type HouseChartBuildContext,
    type HouseDetailColumnModel,
    type HouseMetricAccessors,
} from "./house-forecast-chart-model";
import {
    buildHouseForecastModel,
    type HouseForecastDay,
} from "./house-forecast-detail-model";
import {
    getCachedLocalDateTimeParts,
    type LocalDateTimeParts,
} from "./local-date-time-parts-cache";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";

type HouseConsumptionMetric = "baseline" | "deferrable";
type HouseForecastLabelKey =
    | "node_detail.house_forecast.baseline"
    | "node_detail.house_forecast.deferrables";

interface HouseConsumptionPresentation {
    labelKey: HouseForecastLabelKey;
    getDayValue(day: HouseForecastDay): number;
    accessors: HouseMetricAccessors;
    miniChartToneClass: string;
}

interface HouseModelInputs {
    generatedAt: string | null;
    seriesLength: number;
    actualHistoryLength: number;
    actualHistoryLastTimestamp: string | null;
    currentHourTimestamp: string | null;
    timeZone: string;
    currentDayKey: string | null;
}

const HOUSE_FORECAST_DETAIL_PANEL_ID = "house-forecast-detail-panel";
const CONSUMER_COLOR_PERCENTS = [95, 70, 50, 35] as const;
const PRIMARY_HOUSE_METRIC: HouseConsumptionMetric = "baseline";
const HOUSE_OVERVIEW_ORDER: readonly HouseConsumptionMetric[] = [PRIMARY_HOUSE_METRIC, "deferrable"] as const;
const HOUSE_PRESENTATIONS: Record<HouseConsumptionMetric, HouseConsumptionPresentation> = {
    baseline: {
        labelKey: "node_detail.house_forecast.baseline",
        getDayValue: (day) => day.baselineDayKwh,
        accessors: {
            getHourValue: (hour) => hour.baselineKwh,
            getLowerValue: (hour) => hour.baselineLowerKwh,
            getUpperValue: (hour) => hour.baselineUpperKwh,
        },
        miniChartToneClass: "house-baseline",
    },
    deferrable: {
        labelKey: "node_detail.house_forecast.deferrables",
        getDayValue: (day) => day.deferrableDayKwh,
        accessors: {
            getHourValue: (hour) => hour.deferrableKwh,
            getLowerValue: (hour) => hour.deferrableLowerKwh,
            getUpperValue: (hour) => hour.deferrableUpperKwh,
        },
        miniChartToneClass: "house-deferrable",
    },
};

@customElement("helman-house-forecast-detail")
export class HelmanHouseForecastDetail extends LitElement {
    static styles = [nodeDetailSharedStyles];

    private _forecastDays: HouseForecastDay[] = [];
    private _miniChartMaxByMetric: Record<HouseConsumptionMetric, number> = {
        baseline: 0,
        deferrable: 0,
    };
    private _currentLocalParts: LocalDateTimeParts | null = null;
    private _modelInputs?: HouseModelInputs;
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

        this._forecastDays = buildHouseForecastModel({
            actualHistory: this._houseConsumption?.actualHistory ?? [],
            currentHour: this._houseConsumption?.currentHour ?? null,
            series: this._houseConsumption?.series ?? [],
            timeZone: next.timeZone,
            now,
        });
        this._miniChartMaxByMetric = {
            baseline: this._computeMiniChartMax(this._forecastDays, "baseline"),
            deferrable: this._computeMiniChartMax(this._forecastDays, "deferrable"),
        };
        this._modelInputs = next;
    }

    render() {
        if (!this.localize) return nothing;
        const houseConsumption = this._houseConsumption;
        if (!houseConsumption || houseConsumption.status === "not_configured") {
            return nothing;
        }

        if (houseConsumption.status === "insufficient_history") {
            const message = this.localize("node_detail.house_forecast.insufficient_history")
                .replace("%d", String(houseConsumption.requiredHistoryDays ?? 14));
            return html`
                <div class="forecast-section">
                    <div class="section-title">${this.localize("node_detail.house_forecast.title")}</div>
                    <div class="muted">${message}</div>
                </div>
            `;
        }

        if (houseConsumption.status === "unavailable") {
            return html`
                <div class="forecast-section">
                    <div class="section-title">${this.localize("node_detail.house_forecast.title")}</div>
                    <div class="muted">${this.localize("node_detail.house_forecast.unavailable")}</div>
                </div>
            `;
        }

        if (!houseConsumption.series.length
            && !houseConsumption.actualHistory.length
            && houseConsumption.currentHour === undefined
        ) {
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

        const selectedDay = days.find((day) => day.dayKey === this._selectedDayKey) ?? null;

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
        const primaryDisplay = this._getEnergyDisplay(primaryPresentation.getDayValue(day));
        const deferrablePresentation = this._getPresentation("deferrable");

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
                    <div class="forecast-day-primary-label">
                        ${this.localize(primaryPresentation.labelKey)}
                    </div>
                    <div class="forecast-day-consumption-value">
                        ${primaryDisplay.value}<span class="forecast-day-consumption-unit">${primaryDisplay.unit}</span>
                    </div>
                    <div class="forecast-day-secondary-metric">
                        <span class="forecast-day-secondary-label">
                            ${this.localize(deferrablePresentation.labelKey)}
                        </span>
                        <span class="forecast-day-secondary-value">
                            ${this._formatEnergy(deferrablePresentation.getDayValue(day))}
                        </span>
                    </div>
                    <div class="forecast-day-mini-charts" aria-hidden="true">
                        ${HOUSE_OVERVIEW_ORDER.map((metric) => this._renderMiniChartRow(day, metric))}
                    </div>
                </button>
            </div>
        `;
    }

    private _renderMiniChartRow(day: HouseForecastDay, metric: HouseConsumptionMetric) {
        const presentation = this._getPresentation(metric);
        const bars = buildHouseMiniChartBars(
            day,
            presentation.accessors,
            this._miniChartMaxByMetric[metric],
            this._buildChartContext(),
        );
        const toneClass = presentation.miniChartToneClass;
        const isEmpty = bars.length === 0;

        return html`
            <div class="forecast-day-chart-row">
                <div class="forecast-day-chart-track ${isEmpty ? "empty" : ""}">
                    ${bars.map((bar) => html`
                        <span
                            class="forecast-day-chart-bar ${toneClass} ${bar.isPast ? "past" : ""} ${bar.isGap ? "gap" : ""}"
                            style=${`--forecast-bar-height:${bar.heightPercent}%;`}
                        ></span>
                    `)}
                </div>
            </div>
        `;
    }

    private _renderDetailPanel(day: HouseForecastDay) {
        const dayLabel = this._formatDayLabel(day);
        const chartContext = this._buildChartContext();
        const baseColumns = buildHouseDetailColumns(
            day,
            this._getPrimaryPresentation().accessors,
            chartContext,
        );
        const breakdownRows = buildHouseDeferrableBreakdownRows(day, chartContext);
        const columnCount = Math.max(baseColumns.length, 1);

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
                    ${this._renderStandardSummary(day)}
                </div>
                <div
                    class="forecast-detail-chart"
                    style=${`--forecast-column-count:${columnCount};`}
                    aria-hidden="true"
                >
                    ${this._renderChartRow(
                        this.localize(this._getPrimaryPresentation().labelKey),
                        baseColumns,
                        true,
                    )}
                    ${breakdownRows.length === 0 ? this._renderDetailAxis(baseColumns) : nothing}
                </div>
                ${breakdownRows.length > 0 ? html`
                    <div class="forecast-detail-breakdown">
                        ${this._renderBreakdownSummary(day)}
                        <div
                            class="forecast-detail-chart"
                            style=${`--forecast-column-count:${columnCount};`}
                            aria-hidden="true"
                        >
                            ${breakdownRows.map((row, index) => this._renderChartRow(
                                row.label,
                                row.columns,
                                false,
                                this._getConsumerColorMix(index),
                            ))}
                            ${this._renderDetailAxis(baseColumns)}
                        </div>
                    </div>
                ` : nothing}
            </div>
        `;
    }

    private _renderStandardSummary(day: HouseForecastDay) {
        return html`
            <div class="forecast-detail-summary">
                ${HOUSE_OVERVIEW_ORDER.map((metric) => {
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

    private _renderChartRow(
        label: string,
        columns: HouseDetailColumnModel[],
        isPrimary = false,
        colorMix?: string,
    ) {
        const rowClass = ["forecast-detail-row", isPrimary ? "primary" : ""]
            .filter(Boolean)
            .join(" ");

        return html`
            <div class=${rowClass}>
                <div class="forecast-detail-row-label">${label}</div>
                <div class="forecast-detail-track ${columns.length === 0 ? "empty" : ""}">
                    ${columns.map((column) => this._renderChartColumn(column, colorMix))}
                </div>
            </div>
        `;
    }

    private _renderChartColumn(col: HouseDetailColumnModel, colorMix?: string) {
        const colorStyle = colorMix ? `color:${colorMix};` : "";
        const barClass = colorMix ? "forecast-detail-bar" : "forecast-detail-bar house-consumption";
        const isSharedHighlight = col.isMin && col.isMax;
        const titleValue = col.valueKwh !== null
            ? this._formatEnergy(col.valueKwh)
            : this.localize("node_detail.house_forecast.no_data");

        return html`
            <div
                class="forecast-detail-column ${col.isPast ? "past" : ""} ${col.isGap ? "gap" : ""} ${col.source}"
                title=${`${this._formatHour(col.timestamp)} · ${titleValue}`}
            >
                ${col.valueKwh !== null && col.valueKwh > 0 && (col.isMax || isSharedHighlight) ? html`
                    <span class="forecast-detail-highlight top" style=${colorStyle}>
                        ${isSharedHighlight ? "↕" : "↑"} ${this._formatEnergy(col.valueKwh)}
                    </span>
                ` : nothing}
                ${col.valueKwh !== null && col.valueKwh > 0 && col.isMin && !isSharedHighlight ? html`
                    <span class="forecast-detail-highlight bottom" style=${colorStyle}>
                        ↓ ${this._formatEnergy(col.valueKwh)}
                    </span>
                ` : nothing}
                ${col.valueKwh !== null && col.valueKwh > 0 ? html`
                    <span
                        class=${barClass}
                        style=${`${colorStyle}--forecast-bar-height:${col.heightPercent}%; --forecast-bar-offset:0%;`}
                    ></span>
                ` : nothing}
                ${col.bandLowerPercent !== null && col.bandLowerPercent > 0 ? html`
                    <span
                        class="forecast-detail-band lower"
                        style=${`${colorStyle}--forecast-band-offset:${col.bandLowerPercent}%;`}
                    ></span>
                ` : nothing}
                ${col.bandUpperPercent !== null && col.bandUpperPercent > 0 ? html`
                    <span
                        class="forecast-detail-band upper"
                        style=${`${colorStyle}--forecast-band-offset:${col.bandUpperPercent}%;`}
                    ></span>
                ` : nothing}
            </div>
        `;
    }

    private _renderDetailAxis(columns: HouseDetailColumnModel[]) {
        return html`
            <div class="forecast-detail-axis">
                <div class="forecast-detail-axis-spacer" aria-hidden="true"></div>
                <div class="forecast-detail-axis-grid">
                    ${columns.map((column) => html`
                        <span class="forecast-detail-axis-tick ${column.isPast ? "past" : ""}">
                            ${column.hourLabel ?? ""}
                        </span>
                    `)}
                </div>
            </div>
        `;
    }

    private get _houseConsumption(): HouseConsumptionForecastDTO | null {
        return this._forecast?.house_consumption ?? null;
    }

    private _buildModelInputs(): HouseModelInputs {
        const houseConsumption = this._houseConsumption;
        return {
            generatedAt: houseConsumption?.generatedAt ?? null,
            seriesLength: houseConsumption?.series.length ?? 0,
            actualHistoryLength: houseConsumption?.actualHistory.length ?? 0,
            actualHistoryLastTimestamp: houseConsumption?.actualHistory.length
                ? houseConsumption.actualHistory[houseConsumption.actualHistory.length - 1].timestamp
                : null,
            currentHourTimestamp: houseConsumption?.currentHour?.timestamp ?? null,
            timeZone: this.hass?.config.time_zone ?? "UTC",
            currentDayKey: this._currentLocalParts?.dayKey ?? null,
        };
    }

    private _haveModelInputsChanged(next: HouseModelInputs): boolean {
        return this._modelInputs?.generatedAt !== next.generatedAt
            || this._modelInputs?.seriesLength !== next.seriesLength
            || this._modelInputs?.actualHistoryLength !== next.actualHistoryLength
            || this._modelInputs?.actualHistoryLastTimestamp !== next.actualHistoryLastTimestamp
            || this._modelInputs?.currentHourTimestamp !== next.currentHourTimestamp
            || this._modelInputs?.timeZone !== next.timeZone
            || this._modelInputs?.currentDayKey !== next.currentDayKey;
    }

    private _buildChartContext(): HouseChartBuildContext {
        return {
            currentDayKey: this._currentLocalParts?.dayKey ?? null,
            currentHour: this._currentLocalParts?.hour ?? null,
            locale: this.hass.locale?.language || navigator.language,
            timeZone: this.hass.config.time_zone,
        };
    }

    private _computeMiniChartMax(days: HouseForecastDay[], metric: HouseConsumptionMetric): number {
        return computeHouseMetricMax(days, this._getPresentation(metric).accessors);
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

    private _getPrimaryPresentation(): HouseConsumptionPresentation {
        return this._getPresentation(PRIMARY_HOUSE_METRIC);
    }

    private _getPresentation(metric: HouseConsumptionMetric): HouseConsumptionPresentation {
        return HOUSE_PRESENTATIONS[metric];
    }

    private _buildDayCardAriaLabel(day: HouseForecastDay, dayLabel: string): string {
        const values = HOUSE_OVERVIEW_ORDER
            .map((metric) => {
                const presentation = this._getPresentation(metric);
                return `${this.localize(presentation.labelKey)} ${this._formatEnergy(presentation.getDayValue(day))}`;
            })
            .join(". ");

        return `${this.localize("node_detail.house_forecast.title")}: ${dayLabel}. ${values}`;
    }

    private _getConsumerColorMix(index: number): string {
        const pct = CONSUMER_COLOR_PERCENTS[index % CONSUMER_COLOR_PERCENTS.length];
        return `color-mix(in srgb, var(--primary-color) ${pct}%, transparent)`;
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
