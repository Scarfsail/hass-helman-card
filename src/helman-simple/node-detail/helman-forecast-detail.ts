import { LitElement, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { ForecastPointDTO, GridForecastDTO, SolarForecastDTO } from "../../helman-api";
import { convertToKWh, getDisplayEnergyUnit } from "../../helman/energy-unit-converter";
import type { LocalizeFunction } from "../../localize/localize";
import { buildForecastDetailModel, type ForecastDetailDayModel } from "./forecast-detail-model";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";

interface ForecastHourSlot {
    timestamp: string;
    solarValue: number | null;
    priceValue: number | null;
}

interface LocalDateTimeParts {
    dayKey: string;
    hour: number;
}

interface ForecastMiniChartBar {
    heightPercent: number;
    offsetPercent: number;
    toneClass: string;
    isPast: boolean;
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

const FORECAST_DETAIL_PANEL_ID = "forecast-day-detail-panel";

@customElement("helman-forecast-detail")
export class HelmanForecastDetail extends LitElement {

    static styles = [nodeDetailSharedStyles];

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public solarForecast: SolarForecastDTO | null = null;
    @property({ attribute: false }) public gridForecast: GridForecastDTO | null = null;
    @property({ attribute: false }) public remainingTodayEnergyEntityId: string | null = null;
    @state() private _selectedDayKey: string | null = null;

    render() {
        if (!this._hasConfiguredForecast(this.solarForecast) && !this._hasConfiguredForecast(this.gridForecast)) {
            return nothing;
        }

        const remainingTodayKwh = this._readRemainingTodayKwh();
        const currentLocalParts = this._getCurrentLocalDateTimeParts();
        const days = buildForecastDetailModel({
            solarForecast: this.solarForecast,
            gridForecast: this.gridForecast,
            timeZone: this.hass.config.time_zone,
            remainingTodayKwhOverride: remainingTodayKwh,
        });
        const miniChartScale = this._buildMiniChartScaleModel(days);
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
                        ${days.map((day) => this._renderDay(day, miniChartScale, currentLocalParts))}
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
    ) {
        const isExpanded = this._selectedDayKey === day.dayKey;
        const dayLabel = this._formatDayLabel(day);
        const solarUnavailable = this.localize("node_detail.forecast_detail.solar_unavailable");
        const priceUnavailable = this.localize("node_detail.forecast_detail.price_unavailable");

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
                        <div class="forecast-day-solar-value" title=${this._getSolarSummaryLabel(day) ?? nothing}>
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
                <span class="forecast-day-chart-key">${type === "solar" ? "S" : "P"}</span>
                <div class=${chartClass}>
                    ${chart.bars.map((bar) => html`
                        <span
                            class="forecast-day-chart-bar ${bar.toneClass} ${bar.isPast ? "past" : ""}"
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
                class="forecast-detail-column ${column.isPast ? "past" : ""}"
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
        const display = getDisplayEnergyUnit(valueKwh);
        const fractionDigits = display.unit === "Wh" ? 0 : 1;
        return `${display.value.toFixed(fractionDigits)} ${display.unit}`;
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
        const points = type === "solar" ? day.solarHours : day.priceHours;
        if (points.length === 0) {
            return {
                bars: [],
                hasNegativeValues: false,
            };
        }

        if (type === "solar") {
            return {
                bars: points.map((point) => ({
                    heightPercent: this._normalizeBarHeight(
                        Math.max(point.value, 0),
                        miniChartScale.maxSolarHourValue,
                        100,
                    ),
                    offsetPercent: 0,
                    toneClass: "solar",
                    isPast: this._isPastTimestamp(point.timestamp, day, currentLocalParts),
                })),
                hasNegativeValues: false,
            };
        }

        const { hasNegativePriceValues, maxAbsolutePriceValue } = miniChartScale;

        return {
            bars: points.map((point) => {
                const heightPercent = this._normalizeBarHeight(
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
                    isPast: this._isPastTimestamp(point.timestamp, day, currentLocalParts),
                };
            }),
            hasNegativeValues: hasNegativePriceValues,
        };
    }

    private _buildMiniChartScaleModel(days: ForecastDetailDayModel[]): ForecastMiniChartScaleModel {
        return {
            maxSolarHourValue: Math.max(
                ...days.flatMap((day) => day.solarHours.map((point) => Math.max(point.value, 0))),
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
        const slots = this._buildHourSlots(day);
        const maxSolarSlot = this._findMaxSolarSlot(slots);
        const minPriceSlot = this._findPriceHighlightSlot(slots, "min");
        const maxPriceSlot = this._findPriceHighlightSlot(slots, "max");
        const maxSolarValue = Math.max(...slots.map((slot) => Math.max(slot.solarValue ?? 0, 0)), 0);
        const hasNegativePriceValues = slots.some((slot) => (slot.priceValue ?? 0) < 0);
        const maxAbsolutePrice = Math.max(...slots.map((slot) => Math.abs(slot.priceValue ?? 0)), 0);
        const sparseHourLabels = this._buildSparseHourLabelMap(slots);
        const maxSolarBarHeight = 78;
        const maxPriceBarHeight = hasNegativePriceValues ? 34 : 78;

        return {
            columns: slots.map((slot, index) => {
                const solarHeightPercent = this._normalizeBarHeight(
                    Math.max(slot.solarValue ?? 0, 0),
                    maxSolarValue,
                    maxSolarBarHeight,
                );
                const priceHeightPercent = this._normalizeBarHeight(
                    Math.abs(slot.priceValue ?? 0),
                    maxAbsolutePrice,
                    maxPriceBarHeight,
                );

                return {
                    timestamp: slot.timestamp,
                    solarValue: slot.solarValue,
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
                    isPast: this._isPastTimestamp(slot.timestamp, day, currentLocalParts),
                };
            }),
            hasNegativePriceValues,
            maxPriceSlot,
            minPriceSlot,
        };
    }

    private _normalizeBarHeight(value: number, maxValue: number, maxHeightPercent: number): number {
        if (value <= 0 || maxValue <= 0) {
            return 0;
        }

        return Math.max((value / maxValue) * maxHeightPercent, maxHeightPercent * 0.12);
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

    private _renderSolarSummary(day: ForecastDetailDayModel) {
        if (!this._hasSolarSummary(day)) {
            return nothing;
        }

        if (day.isToday && day.solarTotalKwh !== null) {
            const sharedDisplay = this._getSharedEnergyDisplay(day.solarSummaryKwh!, day.solarTotalKwh);

            return html`
                <span class="forecast-day-solar-primary">${sharedDisplay.primary}</span>
                <span class="forecast-day-solar-separator" aria-hidden="true">/</span>
                <span class="forecast-day-solar-secondary">${sharedDisplay.secondary} ${sharedDisplay.unit}</span>
            `;
        }

        return this._formatEnergy(day.solarSummaryKwh!);
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
        return this.gridForecast?.unit
            ? this.gridForecast.unit.replace(/\s*\/\s*/g, " / ")
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
        if (!this.remainingTodayEnergyEntityId) {
            return undefined;
        }

        const state = this.hass.states[this.remainingTodayEnergyEntityId];
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

        this._mergeHourPoints(slots, day.solarHours, "solar");
        this._mergeHourPoints(slots, day.priceHours, "price");

        return Array.from(slots.values()).sort(
            (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
        );
    }

    private _mergeHourPoints(
        slots: Map<string, ForecastHourSlot>,
        points: ForecastPointDTO[],
        type: "solar" | "price",
    ): void {
        for (const point of points) {
            const hourKey = this._getPointKey(point.timestamp);
            if (hourKey === null) {
                continue;
            }

            const slot = slots.get(hourKey) ?? {
                timestamp: point.timestamp,
                solarValue: null,
                priceValue: null,
            };
            if (type === "solar") {
                slot.solarValue = point.value;
            } else {
                slot.priceValue = point.value;
            }

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

    private _buildSparseHourLabelMap(slots: ForecastHourSlot[]): Map<number, string> {
        if (slots.length === 0) {
            return new Map();
        }

        const targetIndices = slots.length <= 6
            ? slots.map((_, index) => index)
            : [
                0,
                Math.round((slots.length - 1) / 3),
                Math.round(((slots.length - 1) * 2) / 3),
                slots.length - 1,
            ];
        const labelIndices = new Set<number>();

        for (const targetIndex of targetIndices) {
            let bestIndex = targetIndex;
            let bestDistance = Number.POSITIVE_INFINITY;

            for (let index = 0; index < slots.length; index++) {
                if (labelIndices.has(index)) {
                    continue;
                }

                const hourNumber = this._getLocalHourNumber(slots[index].timestamp);
                if (hourNumber === null || hourNumber % 6 !== 0) {
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
            if (labelIndices.size >= Math.min(targetIndices.length, slots.length)) {
                break;
            }

            labelIndices.add(targetIndex);
        }

        return new Map(
            Array.from(labelIndices)
                .sort((left, right) => left - right)
                .map((index) => [index, this._formatHourAxisLabel(slots[index].timestamp)]),
        );
    }

    private _getPointKey(timestamp: string): string | null {
        if (!timestamp) {
            return null;
        }

        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return String(date.getTime());
    }

    private _getCurrentLocalDateTimeParts(): LocalDateTimeParts | null {
        return this._getLocalDateTimeParts(new Date());
    }

    private _getLocalDateTimeParts(date: Date): LocalDateTimeParts | null {
        if (Number.isNaN(date.getTime())) {
            return null;
        }

        const formattedParts = new Intl.DateTimeFormat("en-CA", {
            timeZone: this.hass.config.time_zone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            hourCycle: "h23",
        }).formatToParts(date);

        const year = formattedParts.find((part) => part.type === "year")?.value;
        const month = formattedParts.find((part) => part.type === "month")?.value;
        const day = formattedParts.find((part) => part.type === "day")?.value;
        const hour = formattedParts.find((part) => part.type === "hour")?.value;
        if (!year || !month || !day || !hour) {
            return null;
        }

        return {
            dayKey: `${year}-${month}-${day}`,
            hour: Number(hour),
        };
    }

    private _isPastTimestamp(
        timestamp: string,
        day: ForecastDetailDayModel,
        currentLocalParts: LocalDateTimeParts | null,
    ): boolean {
        if (!day.isToday || currentLocalParts === null) {
            return false;
        }

        const pointParts = this._getLocalDateTimeParts(new Date(timestamp));
        if (pointParts === null) {
            return false;
        }

        return pointParts.dayKey === currentLocalParts.dayKey && pointParts.hour < currentLocalParts.hour;
    }

    private _getLocalHourNumber(timestamp: string): number | null {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return null;
        }

        const hour = new Intl.DateTimeFormat("en-GB", {
            timeZone: this.hass.config.time_zone,
            hour: "2-digit",
            hourCycle: "h23",
        }).formatToParts(date).find((part) => part.type === "hour")?.value;

        return hour ? Number(hour) : null;
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

    private _getStatusNote(): string | null {
        const statuses = [this.solarForecast?.status, this.gridForecast?.status];

        if (statuses.includes("partial")) {
            return this.localize("node_detail.forecast_detail.partial_note");
        }

        if (statuses.includes("unavailable")) {
            return this.localize("node_detail.forecast_detail.unavailable_note");
        }

        return null;
    }

    private _getEmptyMessage(): string {
        const statuses = [this.solarForecast?.status, this.gridForecast?.status];
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
}
