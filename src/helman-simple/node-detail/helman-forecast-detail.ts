import { LitElement, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { ForecastPayload, ForecastPointDTO, GridForecastDTO, SolarForecastDTO } from "../../helman-api";
import { convertToKWh, getDisplayEnergyUnit } from "../../helman/energy-unit-converter";
import { FORECAST_REFRESH_MS, loadForecast, refreshForecast } from "../../helman/forecast-loader";
import type { LocalizeFunction } from "../../localize/localize";
import {
    buildForecastDetailModel,
    type ForecastDetailDayModel,
    type ForecastSolarHourPoint,
} from "./forecast-detail-model";
import {
    buildSparseHourLabelMap,
    isPastForecastTimestamp,
    normalizeForecastBarHeight,
    type ForecastChartBuildContext,
} from "./forecast-chart-shared";
import {
    getCachedLocalDateTimeParts,
    type LocalDateTimeParts,
} from "./local-date-time-parts-cache";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";

interface ForecastHourSlot {
    timestamp: string;
    solarValue: number | null;
    solarSource: ForecastSolarHourPoint["source"] | null;
    priceValue: number | null;
}

interface ForecastMiniChartBar {
    heightPercent: number;
    offsetPercent: number;
    toneClass: string;
    isPast: boolean;
    isGap: boolean;
}

interface ForecastMiniChartModel {
    bars: ForecastMiniChartBar[];
    hasNegativeValues: boolean;
}

interface ForecastMiniChartScaleModel {
    maxSolarHourValue: number;
    maxAbsolutePriceValue: number;
    hasNegativePriceValues: boolean;
}

interface ForecastDetailColumnModel {
    timestamp: string;
    solarValue: number | null;
    solarSource: ForecastSolarHourPoint["source"] | null;
    solarHeightPercent: number;
    priceValue: number | null;
    priceHeightPercent: number;
    priceOffsetPercent: number;
    priceToneClass: string;
    hourLabel: string | null;
    isMaxSolar: boolean;
    isMinPrice: boolean;
    isMaxPrice: boolean;
    isPast: boolean;
}

interface ForecastDetailChartModel {
    columns: ForecastDetailColumnModel[];
    hasNegativePriceValues: boolean;
    maxPriceSlot: ForecastHourSlot | null;
    minPriceSlot: ForecastHourSlot | null;
}

interface PriceSummaryEntry {
    label: string;
    shortLabel: string;
    value: number;
    muted: boolean;
}

interface ForecastModelInputs {
    solarForecast: SolarForecastDTO | null;
    gridForecast: GridForecastDTO | null;
    timeZone: string;
    remainingTodayKwh: number | null | undefined;
    currentDayKey: string | null;
}

const FORECAST_DETAIL_PANEL_ID = "forecast-day-detail-panel";
const EMPTY_MINI_CHART_SCALE: ForecastMiniChartScaleModel = {
    maxSolarHourValue: 0,
    maxAbsolutePriceValue: 0,
    hasNegativePriceValues: false,
};

@customElement("helman-forecast-detail")
export class HelmanForecastDetail extends LitElement {

    static styles = [nodeDetailSharedStyles];

    private _currentLocalParts: LocalDateTimeParts | null = null;
    private _forecastDays: ForecastDetailDayModel[] = [];
    private _forecastModelInputs?: ForecastModelInputs;
    private _maxSolarGaugeValueKwh = 0;
    private _miniChartScale: ForecastMiniChartScaleModel = EMPTY_MINI_CHART_SCALE;
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
        this._currentLocalParts = this._getCurrentLocalDateTimeParts(now);

        const nextForecastModelInputs = this._buildForecastModelInputs();
        if (!this._hasForecastModelInputsChanged(nextForecastModelInputs)) {
            return;
        }

        this._forecastDays = buildForecastDetailModel({
            solarForecast: nextForecastModelInputs.solarForecast,
            gridForecast: nextForecastModelInputs.gridForecast,
            timeZone: nextForecastModelInputs.timeZone,
            remainingTodayKwhOverride: nextForecastModelInputs.remainingTodayKwh,
            now,
        });
        this._miniChartScale = this._buildMiniChartScaleModel(this._forecastDays);
        this._maxSolarGaugeValueKwh = this._getMaxSolarGaugeValueKwh(this._forecastDays);
        this._forecastModelInputs = nextForecastModelInputs;
    }

    render() {
        if (!this._hasConfiguredForecast(this._solarForecast) && !this._hasConfiguredForecast(this._gridForecast)) {
            return nothing;
        }

        const currentLocalParts = this._currentLocalParts;
        const days = this._forecastDays;
        const miniChartScale = this._miniChartScale;
        const maxSolarGaugeValueKwh = this._maxSolarGaugeValueKwh;
        const selectedDay = days.find((day) => day.dayKey === this._selectedDayKey) ?? null;
        const statusNote = days.length > 0 ? this._getStatusNote() : null;

        return html`
            <div class="forecast-section">
                <div class="section-title">${this.localize("node_detail.forecast_detail.title")}</div>
                ${statusNote !== null ? html`
                    <div class="forecast-status-note">${statusNote}</div>
                ` : nothing}
                ${days.length > 0 ? html`
                    <div class="forecast-detail-days">
                        ${days.map((day) => this._renderDay(day, miniChartScale, currentLocalParts, maxSolarGaugeValueKwh))}
                    </div>
                    ${selectedDay !== null ? this._renderDetailPanel(selectedDay, currentLocalParts) : nothing}
                ` : html`
                    <div class="muted">${this._getEmptyMessage()}</div>
                `}
            </div>
        `;
    }

    private _renderDay(
        day: ForecastDetailDayModel,
        miniChartScale: ForecastMiniChartScaleModel,
        currentLocalParts: LocalDateTimeParts | null,
        maxSolarGaugeValueKwh: number,
    ) {
        const isExpanded = this._selectedDayKey === day.dayKey;
        const dayLabel = this._formatDayLabel(day);
        const solarUnavailable = this.localize("node_detail.forecast_detail.solar_unavailable");
        const priceUnavailable = this.localize("node_detail.forecast_detail.price_unavailable");
        const totalSolarGaugeWidthPercent = this._getTotalSolarGaugeWidthPercent(day, maxSolarGaugeValueKwh);
        const remainingSolarGaugeWidthPercent = this._getRemainingSolarGaugeWidthPercent(day, maxSolarGaugeValueKwh);

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
                     aria-controls=${isExpanded ? FORECAST_DETAIL_PANEL_ID : nothing}
                     aria-label=${this._buildDayButtonLabel(day, dayLabel)}
                    >
                     <div class="forecast-day-header">
                         <div class="forecast-day-label">${dayLabel}</div>
                         <span class="forecast-day-toggle" aria-hidden="true">${isExpanded ? "−" : "+"}</span>
                      </div>
                       ${this._hasSolarSummary(day) ? html`
                           <div class="forecast-day-gauge solar" title=${this._getSolarSummaryLabel(day) ?? nothing}>
                              ${day.isToday && totalSolarGaugeWidthPercent > remainingSolarGaugeWidthPercent ? html`
                                  <span
                                      class="forecast-day-gauge-fill muted"
                                      style=${`width:${totalSolarGaugeWidthPercent}%;`}
                                      aria-hidden="true"
                                  ></span>
                              ` : nothing}
                              ${remainingSolarGaugeWidthPercent > 0 ? html`
                                  <span
                                      class="forecast-day-gauge-fill"
                                      style=${`width:${remainingSolarGaugeWidthPercent}%;`}
                                      aria-hidden="true"
                                  ></span>
                              ` : nothing}
                              ${this._renderSolarSummary(day)}
                          </div>
                       ` : html`
                           <div class="forecast-day-placeholder" title=${solarUnavailable}>—</div>
                       `}
                      ${this._hasOverviewPriceSummary(day) ? this._renderPriceSummaryLine(day, "overview") : html`
                          <div class="forecast-day-placeholder" title=${priceUnavailable}>—</div>
                      `}
                      <div class="forecast-day-mini-charts" aria-hidden="true">
                         ${this._renderMiniChartRow(day, "solar", miniChartScale, currentLocalParts)}
                         ${this._renderMiniChartRow(day, "price", miniChartScale, currentLocalParts)}
                      </div>
                  </button>
              </div>
        `;
    }

    private _renderDetailPanel(day: ForecastDetailDayModel, currentLocalParts: LocalDateTimeParts | null) {
        const dayLabel = this._formatDayLabel(day);
        const detail = this._buildDetailChartModel(day, currentLocalParts);
        const solarUnavailable = this.localize("node_detail.forecast_detail.solar_unavailable");
        const priceUnavailable = this.localize("node_detail.forecast_detail.price_unavailable");

        return html`
            <div
                id=${FORECAST_DETAIL_PANEL_ID}
                class="forecast-detail-panel"
                role="region"
                aria-label=${`${this._buildDayButtonLabel(day, dayLabel)}. ${this.localize("node_detail.forecast_detail.hourly_detail")}`}
            >
                <div class="forecast-detail-panel-header">
                    <div class="forecast-detail-panel-heading">
                        <div class="forecast-detail-panel-title">${dayLabel}</div>
                        <div class="forecast-detail-panel-subtitle">
                            ${this.localize("node_detail.forecast_detail.hourly_detail")}
                        </div>
                    </div>
                    <div class="forecast-detail-summary">
                        <div class="forecast-detail-summary-item">
                            <span class="forecast-detail-summary-label">
                                ${this.localize("node_detail.forecast_detail.solar_label")}
                            </span>
                            ${this._hasSolarSummary(day) ? html`
                                <span class="forecast-detail-summary-value" title=${this._getSolarSummaryLabel(day) ?? nothing}>
                                    ${this._renderSolarSummary(day)}
                                </span>
                            ` : html`
                                <span
                                    class="forecast-detail-summary-value forecast-detail-summary-placeholder"
                                    title=${solarUnavailable}
                                >
                                    —
                                </span>
                            `}
                        </div>
                        <div class="forecast-detail-summary-item">
                            <span class="forecast-detail-summary-label">
                                ${this.localize("node_detail.forecast_detail.price_label")}
                            </span>
                            ${this._hasDetailPriceSummary(day)
                                ? this._renderPriceSummaryLine(day, "detail")
                                : html`
                                    <span
                                        class="forecast-detail-summary-value forecast-detail-summary-placeholder"
                                        title=${priceUnavailable}
                                    >
                                        —
                                    </span>
                                `}
                        </div>
                    </div>
                </div>
                <div
                    class="forecast-detail-chart"
                    style=${`--forecast-column-count:${Math.max(detail.columns.length, 1)};`}
                    aria-hidden="true"
                >
                    ${this._renderDetailRow("solar", detail)}
                    ${this._renderDetailRow("price", detail)}
                    <div class="forecast-detail-axis">
                        <div class="forecast-detail-axis-spacer" aria-hidden="true"></div>
                        <div class="forecast-detail-axis-grid">
                            ${detail.columns.map((column) => html`
                                <span class="forecast-detail-axis-tick ${column.isPast ? "past" : ""}">${column.hourLabel ?? ""}</span>
                            `)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private _renderMiniChartRow(
        day: ForecastDetailDayModel,
        type: "solar" | "price",
        miniChartScale: ForecastMiniChartScaleModel,
        currentLocalParts: LocalDateTimeParts | null,
    ) {
        const chart = this._buildMiniChartModel(day, type, miniChartScale, currentLocalParts);
        const chartClass = [
            "forecast-day-chart-track",
            type,
            chart.hasNegativeValues ? "has-negative" : "",
            chart.bars.length === 0 ? "empty" : "",
        ].filter(Boolean).join(" ");

        return html`
            <div class="forecast-day-chart-row">
                <div class=${chartClass}>
                    ${chart.bars.map((bar) => html`
                        <span
                            class="forecast-day-chart-bar ${bar.toneClass} ${bar.isPast ? "past" : ""} ${bar.isGap ? "gap" : ""}"
                            style=${`--forecast-bar-height:${bar.heightPercent}%; --forecast-bar-offset:${bar.offsetPercent}%;`}
                        ></span>
                    `)}
                </div>
            </div>
        `;
    }

    private _renderDetailRow(
        type: "solar" | "price",
        detail: ForecastDetailChartModel,
    ) {
        const hasData = type === "solar"
            ? detail.columns.some((column) => column.solarValue !== null)
            : detail.columns.some((column) => column.priceValue !== null);
        const trackClass = [
            "forecast-detail-track",
            type,
            !hasData ? "empty" : "",
            type === "price" && detail.hasNegativePriceValues ? "has-negative" : "",
        ].filter(Boolean).join(" ");

        return html`
            <div class="forecast-detail-row">
                <div class="forecast-detail-row-label">
                    ${this.localize(
                        type === "solar"
                            ? "node_detail.forecast_detail.solar_label"
                            : "node_detail.forecast_detail.price_label",
                    )}
                </div>
                <div class=${trackClass}>
                    ${detail.columns.map((column) => type === "solar"
                        ? this._renderSolarDetailColumn(column)
                        : this._renderPriceDetailColumn(column, detail))}
                </div>
            </div>
        `;
    }

    private _renderSolarDetailColumn(column: ForecastDetailColumnModel) {
        const valueLabel = column.solarValue !== null
            ? this._formatEnergy(column.solarValue / 1000)
            : this.localize("node_detail.forecast_detail.solar_unavailable");

        return html`
            <div
                class="forecast-detail-column ${column.isPast ? "past" : ""} ${column.solarSource === "gap" ? "gap" : ""} ${column.solarSource ?? ""}"
                title=${this._buildColumnTitle(
                    "node_detail.forecast_detail.solar_label",
                    column.timestamp,
                    valueLabel,
                )}
            >
                ${column.isMaxSolar && column.solarValue !== null ? html`
                    <span class="forecast-detail-highlight top solar">
                        ↑ ${this._formatEnergy(column.solarValue / 1000)}
                    </span>
                ` : nothing}
                ${column.solarValue !== null ? html`
                    <span
                        class="forecast-detail-bar solar"
                        style=${`--forecast-bar-height:${column.solarHeightPercent}%; --forecast-bar-offset:0%;`}
                    ></span>
                ` : nothing}
            </div>
        `;
    }

    private _renderPriceDetailColumn(
        column: ForecastDetailColumnModel,
        detail: ForecastDetailChartModel,
    ) {
        const valueLabel = column.priceValue !== null
            ? this._formatPrice(column.priceValue)
            : this.localize("node_detail.forecast_detail.price_unavailable");
        const isSharedHighlight = column.isMinPrice
            && column.isMaxPrice
            && detail.minPriceSlot?.timestamp === detail.maxPriceSlot?.timestamp;

        return html`
            <div
                class="forecast-detail-column ${column.isPast ? "past" : ""}"
                title=${this._buildColumnTitle(
                    "node_detail.forecast_detail.price_label",
                    column.timestamp,
                    valueLabel,
                )}
            >
                ${column.priceValue !== null && (column.isMaxPrice || isSharedHighlight) ? html`
                    <span class="forecast-detail-highlight top ${column.priceToneClass}">
                        ${isSharedHighlight ? "↕" : "↑"} ${this._formatCompactPrice(column.priceValue)}
                    </span>
                ` : nothing}
                ${column.priceValue !== null && column.isMinPrice && !isSharedHighlight ? html`
                    <span class="forecast-detail-highlight bottom ${column.priceToneClass}">
                        ↓ ${this._formatCompactPrice(column.priceValue)}
                    </span>
                ` : nothing}
                ${column.priceValue !== null ? html`
                    <span
                        class="forecast-detail-bar ${column.priceToneClass}"
                        style=${`--forecast-bar-height:${column.priceHeightPercent}%; --forecast-bar-offset:${column.priceOffsetPercent}%;`}
                    ></span>
                ` : nothing}
            </div>
        `;
    }

    private _renderPriceSummaryLine(day: ForecastDetailDayModel, variant: "overview" | "detail") {
        const entries = variant === "overview"
            ? this._getOverviewPriceSummaryEntries(day)
            : this._getDetailPriceSummaryEntries(day);
        const title = this._getPriceSummaryLabel(entries);
        const [firstEntry, ...remainingEntries] = entries;
        const hasCurrentEntry = firstEntry?.shortLabel === "";

        if (entries.length === 0 || title === null) {
            return nothing;
        }

        return html`
            <div class="forecast-day-price-line" title=${title}>
                ${firstEntry ? this._renderPriceSummaryChip(firstEntry, entries.length === 1) : nothing}
                ${variant === "detail" && hasCurrentEntry && remainingEntries.length > 0 ? html`
                    <span class="forecast-day-price-separator" aria-hidden="true">/</span>
                ` : nothing}
                ${remainingEntries.map((entry, index) => this._renderPriceSummaryChip(entry, index === remainingEntries.length - 1))}
            </div>
        `;
    }

    private _formatDayLabel(day: ForecastDetailDayModel): string {
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

    private _getEnergyDisplay(valueKwh: number): {
        value: string;
        unit: string;
    } {
        const display = getDisplayEnergyUnit(valueKwh);
        const fractionDigits = display.unit === "Wh" ? 0 : 1;

        return {
            value: display.value.toFixed(fractionDigits),
            unit: display.unit,
        };
    }

    private _renderEnergyValue(valueKwh: number) {
        const display = this._getEnergyDisplay(valueKwh);

        return html`
            <span class="forecast-day-gauge-primary">${display.value}</span>
            <span class="forecast-day-gauge-unit">${display.unit}</span>
        `;
    }

    private _formatCompactPrice(value: number): string {
        return this._formatSignedPriceValue(value);
    }

    private _formatPrice(value: number): string {
        const signedValue = this._formatSignedPriceValue(value);
        const unit = this._getDisplayPriceUnit();
        return unit ? `${signedValue} ${unit}` : signedValue;
    }

    private _formatSignedPriceValue(value: number): string {
        const formattedValue = new Intl.NumberFormat(
            this.hass.locale?.language || navigator.language,
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            },
        ).format(value);
        return value > 0 ? `+${formattedValue}` : formattedValue;
    }

    private _getPriceToneClass(value: number): string {
        if (value > 0) {
            return "price-positive";
        }

        if (value < 0) {
            return "price-negative";
        }

        return "price-neutral";
    }

    private _buildMiniChartModel(
        day: ForecastDetailDayModel,
        type: "solar" | "price",
        miniChartScale: ForecastMiniChartScaleModel,
        currentLocalParts: LocalDateTimeParts | null,
    ): ForecastMiniChartModel {
        const chartContext = this._buildChartContext(currentLocalParts);
        const points = type === "solar" ? day.solarHours : day.priceHours;
        if (points.length === 0) {
            return {
                bars: [],
                hasNegativeValues: false,
            };
        }

        if (type === "solar") {
            return {
                bars: day.solarHours.map((point) => ({
                    heightPercent: normalizeForecastBarHeight(
                        Math.max(point.value ?? 0, 0),
                        miniChartScale.maxSolarHourValue,
                        100,
                    ),
                    offsetPercent: 0,
                    toneClass: "solar",
                    isPast: isPastForecastTimestamp(point.timestamp, day.isToday, chartContext),
                    isGap: point.source === "gap",
                })),
                hasNegativeValues: false,
            };
        }

        const { hasNegativePriceValues, maxAbsolutePriceValue } = miniChartScale;

        return {
            bars: points.map((point) => {
                const heightPercent = normalizeForecastBarHeight(
                    Math.abs(point.value),
                    maxAbsolutePriceValue,
                    hasNegativePriceValues ? 50 : 100,
                );

                return {
                    heightPercent,
                    offsetPercent: hasNegativePriceValues && point.value < 0
                        ? Math.max(0, 50 - heightPercent)
                        : hasNegativePriceValues
                            ? 50
                            : 0,
                    toneClass: this._getPriceToneClass(point.value),
                    isPast: isPastForecastTimestamp(point.timestamp, day.isToday, chartContext),
                    isGap: false,
                };
            }),
            hasNegativeValues: hasNegativePriceValues,
        };
    }

    private _buildMiniChartScaleModel(days: ForecastDetailDayModel[]): ForecastMiniChartScaleModel {
        return {
            maxSolarHourValue: Math.max(
                ...days.flatMap((day) => day.solarHours.map((point) => Math.max(point.value ?? 0, 0))),
                0,
            ),
            maxAbsolutePriceValue: Math.max(
                ...days.flatMap((day) => day.priceHours.map((point) => Math.abs(point.value))),
                0,
            ),
            hasNegativePriceValues: days.some((day) => day.priceHours.some((point) => point.value < 0)),
        };
    }

    private _buildDetailChartModel(day: ForecastDetailDayModel, currentLocalParts: LocalDateTimeParts | null): ForecastDetailChartModel {
        const chartContext = this._buildChartContext(currentLocalParts);
        const slots = this._buildHourSlots(day);
        const maxSolarSlot = this._findMaxSolarSlot(slots);
        const minPriceSlot = this._findPriceHighlightSlot(slots, "min");
        const maxPriceSlot = this._findPriceHighlightSlot(slots, "max");
        const maxSolarValue = Math.max(...slots.map((slot) => Math.max(slot.solarValue ?? 0, 0)), 0);
        const hasNegativePriceValues = slots.some((slot) => (slot.priceValue ?? 0) < 0);
        const maxAbsolutePrice = Math.max(...slots.map((slot) => Math.abs(slot.priceValue ?? 0)), 0);
        const sparseHourLabels = buildSparseHourLabelMap(
            slots.map((slot) => slot.timestamp),
            chartContext,
        );
        const maxSolarBarHeight = 78;
        const maxPriceBarHeight = hasNegativePriceValues ? 34 : 78;

        return {
            columns: slots.map((slot, index) => {
                const solarHeightPercent = normalizeForecastBarHeight(
                    Math.max(slot.solarValue ?? 0, 0),
                    maxSolarValue,
                    maxSolarBarHeight,
                );
                const priceHeightPercent = normalizeForecastBarHeight(
                    Math.abs(slot.priceValue ?? 0),
                    maxAbsolutePrice,
                    maxPriceBarHeight,
                );

                return {
                    timestamp: slot.timestamp,
                    solarValue: slot.solarValue,
                    solarSource: slot.solarSource,
                    solarHeightPercent,
                    priceValue: slot.priceValue,
                    priceHeightPercent,
                    priceOffsetPercent: slot.priceValue === null
                        ? 0
                        : hasNegativePriceValues && slot.priceValue < 0
                            ? Math.max(0, 50 - priceHeightPercent)
                            : hasNegativePriceValues
                                ? 50
                                : 0,
                    priceToneClass: slot.priceValue !== null ? this._getPriceToneClass(slot.priceValue) : "price-neutral",
                    hourLabel: sparseHourLabels.get(index) ?? null,
                    isMaxSolar: maxSolarSlot?.timestamp === slot.timestamp,
                    isMinPrice: minPriceSlot?.timestamp === slot.timestamp,
                    isMaxPrice: maxPriceSlot?.timestamp === slot.timestamp,
                    isPast: isPastForecastTimestamp(slot.timestamp, day.isToday, chartContext),
                };
            }),
            hasNegativePriceValues,
            maxPriceSlot,
            minPriceSlot,
        };
    }

    private _buildDayButtonLabel(day: ForecastDetailDayModel, dayLabel: string): string {
        const parts = [`${this.localize("node_detail.forecast_detail.title")}: ${dayLabel}`];
        const solarSummaryLabel = this._getSolarSummaryLabel(day);
        const priceSummaryLabel = this._getPriceSummaryLabel(this._getDetailPriceSummaryEntries(day));

        parts.push(
            solarSummaryLabel !== null
                ? `${this.localize("node_detail.forecast_detail.solar_label")} ${solarSummaryLabel}`
                : `${this.localize("node_detail.forecast_detail.solar_label")} ${this.localize("node_detail.forecast_detail.solar_unavailable")}`,
        );
        parts.push(
            priceSummaryLabel !== null
                ? priceSummaryLabel
                : `${this.localize("node_detail.forecast_detail.price_label")} ${this.localize("node_detail.forecast_detail.price_unavailable")}`,
        );

        return parts.join(". ");
    }

    private _hasSolarSummary(day: ForecastDetailDayModel): boolean {
        return day.hasSolarData && day.solarSummaryKwh !== null;
    }

    private _getMaxSolarGaugeValueKwh(days: ForecastDetailDayModel[]): number {
        return days.reduce((maxValue, day) => {
            const comparableSolarKwh = this._getComparableSolarGaugeValueKwh(day);
            if (comparableSolarKwh === null) {
                return maxValue;
            }

            return Math.max(maxValue, comparableSolarKwh);
        }, 0);
    }

    private _getTotalSolarGaugeWidthPercent(day: ForecastDetailDayModel, maxSolarGaugeValueKwh: number): number {
        return this._getSolarGaugeWidthPercent(this._getComparableSolarGaugeValueKwh(day), maxSolarGaugeValueKwh);
    }

    private _getRemainingSolarGaugeWidthPercent(day: ForecastDetailDayModel, maxSolarGaugeValueKwh: number): number {
        return this._getSolarGaugeWidthPercent(this._getRemainingSolarGaugeValueKwh(day), maxSolarGaugeValueKwh);
    }

    private _getSolarGaugeWidthPercent(solarValueKwh: number | null, maxSolarGaugeValueKwh: number): number {
        if (solarValueKwh === null || maxSolarGaugeValueKwh <= 0) {
            return 0;
        }

        return Math.min((solarValueKwh / maxSolarGaugeValueKwh) * 100, 100);
    }

    private _getComparableSolarGaugeValueKwh(day: ForecastDetailDayModel): number | null {
        return day.solarTotalKwh ?? day.solarSummaryKwh;
    }

    private _getRemainingSolarGaugeValueKwh(day: ForecastDetailDayModel): number | null {
        if (day.solarSummaryKwh === null) {
            return null;
        }

        if (day.solarTotalKwh === null) {
            return day.solarSummaryKwh;
        }

        return Math.max(0, Math.min(day.solarSummaryKwh, day.solarTotalKwh));
    }

    private _renderSolarSummary(day: ForecastDetailDayModel) {
        if (!this._hasSolarSummary(day)) {
            return nothing;
        }

        if (day.isToday && day.solarTotalKwh !== null) {
            const sharedDisplay = this._getSharedEnergyDisplay(day.solarSummaryKwh!, day.solarTotalKwh);

            return html`
                <span class="forecast-day-gauge-primary">${sharedDisplay.primary}</span>
                <span class="forecast-day-gauge-separator" aria-hidden="true">/</span>
                <span class="forecast-day-gauge-secondary">
                    ${sharedDisplay.secondary}
                    <span class="forecast-day-gauge-unit">${sharedDisplay.unit}</span>
                </span>
            `;
        }

        return this._renderEnergyValue(day.solarSummaryKwh!);
    }

    private _getSolarSummaryLabel(day: ForecastDetailDayModel): string | null {
        if (!day.hasSolarData || day.solarSummaryKwh === null) {
            return null;
        }

        if (day.isToday && day.solarTotalKwh !== null) {
            return `${this.localize("node_detail.forecast_detail.remaining_label")} ${this._formatEnergy(day.solarSummaryKwh)}, ${this.localize("node_detail.forecast_detail.overall_label")} ${this._formatEnergy(day.solarTotalKwh)}`;
        }

        return this._formatEnergy(day.solarSummaryKwh);
    }

    private _hasOverviewPriceSummary(day: ForecastDetailDayModel): boolean {
        return this._getOverviewPriceSummaryEntries(day).length > 0;
    }

    private _hasDetailPriceSummary(day: ForecastDetailDayModel): boolean {
        return this._getDetailPriceSummaryEntries(day).length > 0;
    }

    private _getPriceSummaryLabel(entries: PriceSummaryEntry[]): string | null {
        if (entries.length === 0) {
            return null;
        }

        return entries
            .map((entry) => `${entry.label} ${this._formatPrice(entry.value)}`)
            .join(", ");
    }

    private _getOverviewPriceSummaryEntries(day: ForecastDetailDayModel): PriceSummaryEntry[] {
        if (!day.isToday || day.currentPrice === null) {
            return [];
        }

        return [{
            label: this.localize("node_detail.forecast_detail.price_label"),
            shortLabel: "",
            value: day.currentPrice,
            muted: false,
        }];
    }

    private _getDetailPriceSummaryEntries(day: ForecastDetailDayModel): PriceSummaryEntry[] {
        const hasCurrentPrice = day.isToday && day.currentPrice !== null;
        const mutedRange = hasCurrentPrice;
        const entries: PriceSummaryEntry[] = [];

        if (hasCurrentPrice && day.currentPrice !== null) {
            const currentLabel = this.localize("node_detail.forecast_detail.current_label");
            entries.push({
                label: currentLabel,
                shortLabel: "",
                value: day.currentPrice,
                muted: false,
            });
        }

        if (day.priceMin !== null) {
            entries.push({
                label: this.localize("node_detail.forecast_detail.price_min"),
                shortLabel: "↓",
                value: day.priceMin,
                muted: mutedRange,
            });
        }

        if (day.priceMax !== null) {
            entries.push({
                label: this.localize("node_detail.forecast_detail.price_max"),
                shortLabel: "↑",
                value: day.priceMax,
                muted: mutedRange,
            });
        }

        return entries;
    }

    private _renderPriceSummaryChip(entry: PriceSummaryEntry, showUnit: boolean) {
        const unit = showUnit ? this._getDisplayPriceUnit() : null;

        return html`
            <span
                class="forecast-day-price-chip ${this._getPriceToneClass(entry.value)} ${entry.muted ? "muted" : ""}"
            >
                ${entry.shortLabel !== "" ? html`
                    <span class="forecast-day-price-prefix" aria-hidden="true">${entry.shortLabel}</span>
                ` : nothing}
                <span class="forecast-day-price-value">${this._formatCompactPrice(entry.value)}</span>
                ${unit ? html`
                    <span class="forecast-day-price-unit">${unit}</span>
                ` : nothing}
            </span>
        `;
    }

    private _getDisplayPriceUnit(): string | null {
        return this._gridForecast?.unit
            ? this._gridForecast.unit.replace(/\s*\/\s*/g, " / ")
            : null;
    }

    private _getSharedEnergyDisplay(primaryValueKwh: number, secondaryValueKwh: number): {
        primary: string;
        secondary: string;
        unit: string;
    } {
        const display = getDisplayEnergyUnit(secondaryValueKwh);
        const fractionDigits = display.unit === "Wh" ? 0 : 1;
        const scale = display.unit === "Wh"
            ? 1000
            : display.unit === "MWh"
                ? 1 / 1000
                : display.unit === "GWh"
                    ? 1 / 1000000
                    : 1;

        return {
            primary: (primaryValueKwh * scale).toFixed(fractionDigits),
            secondary: display.value.toFixed(fractionDigits),
            unit: display.unit,
        };
    }

    private _readRemainingTodayKwh(): number | null | undefined {
        const entityId = this._solarForecast?.remainingTodayEnergyEntityId ?? null;
        if (!entityId) {
            return undefined;
        }

        const state = this.hass.states[entityId];
        if (!state) {
            return undefined;
        }

        const rawValue = Number.parseFloat(state.state);
        if (Number.isNaN(rawValue)) {
            return undefined;
        }

        return convertToKWh(rawValue, state.attributes.unit_of_measurement);
    }

    private _buildHourSlots(day: ForecastDetailDayModel): ForecastHourSlot[] {
        const slots = new Map<string, ForecastHourSlot>();

        this._mergeSolarHours(slots, day.solarHours);
        this._mergeHourPoints(slots, day.priceHours, "price");

        return Array.from(slots.values()).sort(
            (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
        );
    }

    private _mergeSolarHours(
        slots: Map<string, ForecastHourSlot>,
        points: ForecastSolarHourPoint[],
    ): void {
        for (const point of points) {
            const hourKey = this._getPointKey(point.timestamp);
            if (hourKey === null) {
                continue;
            }

            const slot = slots.get(hourKey) ?? {
                timestamp: point.timestamp,
                solarValue: null,
                solarSource: null,
                priceValue: null,
            };
            slot.solarValue = point.value;
            slot.solarSource = point.source;

            if (new Date(point.timestamp).getTime() < new Date(slot.timestamp).getTime()) {
                slot.timestamp = point.timestamp;
            }

            slots.set(hourKey, slot);
        }
    }

    private _mergeHourPoints(
        slots: Map<string, ForecastHourSlot>,
        points: ForecastPointDTO[],
        type: "price",
    ): void {
        for (const point of points) {
            const hourKey = this._getPointKey(point.timestamp);
            if (hourKey === null) {
                continue;
            }

            const slot = slots.get(hourKey) ?? {
                timestamp: point.timestamp,
                solarValue: null,
                solarSource: null,
                priceValue: null,
            };
            slot.priceValue = point.value;

            if (new Date(point.timestamp).getTime() < new Date(slot.timestamp).getTime()) {
                slot.timestamp = point.timestamp;
            }

            slots.set(hourKey, slot);
        }
    }

    private _findMaxSolarSlot(slots: ForecastHourSlot[]): ForecastHourSlot | null {
        const solarSlots = slots.filter((slot) => (slot.solarValue ?? 0) > 0);
        if (solarSlots.length === 0) {
            return null;
        }

        return solarSlots.reduce((bestSlot, slot) => (slot.solarValue ?? 0) > (bestSlot.solarValue ?? 0) ? slot : bestSlot);
    }

    private _findPriceHighlightSlot(
        slots: ForecastHourSlot[],
        type: "min" | "max",
    ): ForecastHourSlot | null {
        const priceSlots = slots.filter((slot) => slot.priceValue !== null);
        if (priceSlots.length === 0) {
            return null;
        }

        return priceSlots.reduce((bestSlot, slot) => {
            if (slot.priceValue === null || bestSlot.priceValue === null) {
                return bestSlot;
            }

            if (type === "min") {
                return slot.priceValue < bestSlot.priceValue ? slot : bestSlot;
            }

            return slot.priceValue > bestSlot.priceValue ? slot : bestSlot;
        });
    }

    private _getPointKey(timestamp: string): string | null {
        const parts = this._getLocalDateTimeParts(timestamp);
        if (parts === null) {
            return null;
        }

        return `${parts.dayKey}:${parts.hour}`;
    }

    private _buildForecastModelInputs(): ForecastModelInputs {
        return {
            solarForecast: this._solarForecast,
            gridForecast: this._gridForecast,
            timeZone: this.hass.config.time_zone,
            remainingTodayKwh: this._readRemainingTodayKwh(),
            currentDayKey: this._currentLocalParts?.dayKey ?? null,
        };
    }

    private _hasForecastModelInputsChanged(nextForecastModelInputs: ForecastModelInputs): boolean {
        return this._forecastModelInputs?.solarForecast !== nextForecastModelInputs.solarForecast
            || this._forecastModelInputs?.gridForecast !== nextForecastModelInputs.gridForecast
            || this._forecastModelInputs?.timeZone !== nextForecastModelInputs.timeZone
            || this._forecastModelInputs?.remainingTodayKwh !== nextForecastModelInputs.remainingTodayKwh
            || this._forecastModelInputs?.currentDayKey !== nextForecastModelInputs.currentDayKey;
    }

    private _getCurrentLocalDateTimeParts(now: Date = new Date()): LocalDateTimeParts | null {
        return this._getLocalDateTimeParts(now);
    }

    private _buildChartContext(currentLocalParts: LocalDateTimeParts | null): ForecastChartBuildContext {
        return {
            currentDayKey: currentLocalParts?.dayKey ?? null,
            currentHour: currentLocalParts?.hour ?? null,
            locale: this.hass.locale?.language || navigator.language,
            timeZone: this.hass.config.time_zone,
        };
    }

    private _getLocalDateTimeParts(value: Date | string): LocalDateTimeParts | null {
        return getCachedLocalDateTimeParts(value, this.hass.config.time_zone);
    }

    private _buildColumnTitle(labelKey: string, timestamp: string, value: string): string {
        return `${this._formatHour(timestamp)} · ${this.localize(labelKey)} ${value}`;
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


    private _getStatusNote(): string | null {
        const statuses = [this._solarForecast?.status, this._gridForecast?.status];

        if (statuses.includes("partial")) {
            return this.localize("node_detail.forecast_detail.partial_note");
        }

        if (statuses.includes("unavailable")) {
            return this.localize("node_detail.forecast_detail.unavailable_note");
        }

        return null;
    }

    private _getEmptyMessage(): string {
        const statuses = [this._solarForecast?.status, this._gridForecast?.status];
        if (statuses.includes("available") || statuses.includes("partial")) {
            return this.localize("node_detail.forecast_detail.no_future_data");
        }

        return this.localize("node_detail.forecast_detail.forecast_unavailable");
    }

    private async _toggleDay(dayKey: string): Promise<void> {
        this._selectedDayKey = this._selectedDayKey === dayKey ? null : dayKey;
        if (this._selectedDayKey === null) {
            return;
        }

        await this.updateComplete;
        this.renderRoot.querySelector<HTMLElement>(`#${FORECAST_DETAIL_PANEL_ID}`)?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
        });
    }

    private _hasConfiguredForecast(forecast: SolarForecastDTO | GridForecastDTO | null): boolean {
        return forecast !== null && forecast.status !== "not_configured";
    }

    private get _solarForecast(): SolarForecastDTO | null {
        return this._forecast?.solar ?? null;
    }

    private get _gridForecast(): GridForecastDTO | null {
        return this._forecast?.grid ?? null;
    }

    private async _loadInitialForecast(): Promise<void> {
        if (!this.hass) return;
        try {
            this._forecast = await loadForecast(this.hass);
        } catch (err) {
            console.error("helman-forecast-detail: failed to load forecast", err);
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
