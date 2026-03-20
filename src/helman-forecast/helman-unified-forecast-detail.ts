import { LitElement, css, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { ForecastPayload } from "../helman-api";
import { convertToKWh, getDisplayEnergyUnit } from "../helman/energy-unit-converter";
import type { LocalizeFunction } from "../localize/localize";
import { renderBatteryDetailRow } from "./shared/battery-detail-chart-renderer";
import {
    formatForecastDayLabel,
    formatForecastHour,
    formatForecastHourRange,
    getForecastConsumerColorMix,
} from "./shared/forecast-render-helpers";
import {
    renderHouseBreakdownDisclosureRow,
    renderHouseBreakdownSummary,
    renderHouseDetailRow,
} from "./shared/house-detail-chart-renderer";
import {
    getCachedLocalDateTimeParts,
    type LocalDateTimeParts,
} from "./shared/local-date-time-parts-cache";
import { getLocalHourKey } from "./shared/local-day-hour-axis";
import { forecastSharedStyles } from "./shared/forecast-shared-styles";
import type {
    HelmanForecastMobileDensity,
    HelmanForecastSectionVisibility,
} from "./HelmanForecastCardConfig";
import {
    buildUnifiedForecastModel,
    type UnifiedBatteryOverviewModel,
    type UnifiedForecastDayModel,
    type UnifiedForecastModel,
    type UnifiedHouseOverviewModel,
    type UnifiedPriceOverviewChip,
    type UnifiedPriceOverviewModel,
    type UnifiedSolarOverviewModel,
} from "./unified-forecast-model";
import {
    getUnifiedForecastOverviewConfig,
    getUnifiedForecastSectionVisibility,
    normalizeUnifiedForecastOverviewConfig,
    type UnifiedForecastOverviewConfig,
} from "./unified-forecast-visibility";
import {
    buildUnifiedForecastDetailModel,
    type UnifiedForecastDetailModel,
    type UnifiedPriceDetailColumnModel,
    type UnifiedPriceDetailRowModel,
    type UnifiedSolarDetailColumnModel,
    type UnifiedSolarDetailRowModel,
} from "./unified-forecast-detail-model";

interface UnifiedForecastModelInputs {
    forecast: ForecastPayload | null;
    timeZone: string;
    locale: string;
    currentDayKey: string | null;
    currentHourKey: string | null;
    remainingTodayKwh: number | null | undefined;
    sectionVisibility: HelmanForecastSectionVisibility;
    selectedDayKey: string | null;
    houseBreakdownExpanded: boolean;
    batteryMinSoc: number | null;
    batteryMaxSoc: number | null;
}

type UnifiedForecastSectionKey = keyof HelmanForecastSectionVisibility;
type UnifiedForecastOverviewElementKey = keyof UnifiedForecastOverviewConfig;

interface UnifiedForecastOverviewElementDefinition {
    key: UnifiedForecastOverviewElementKey;
    section: UnifiedForecastSectionKey;
    supportsDetail: boolean;
    render: (host: HelmanUnifiedForecastDetail, day: UnifiedForecastDayModel) => unknown;
}

interface UnifiedForecastDetailRenderContext {
    detail: UnifiedForecastDetailModel;
    formatEnergy: (value: number | null) => string;
    formatHouseHour: (timestamp: string) => string;
    noDataLabel: string;
}

interface UnifiedForecastSectionDefinition {
    key: UnifiedForecastSectionKey;
    ariaOrder: number;
    detailSummaryOrder: number;
    detailRowOrder: number;
    statusOrder: number;
    getStatus: (forecast: ForecastPayload) => string | null | undefined;
    buildDayCardAriaText: (host: HelmanUnifiedForecastDetail, day: UnifiedForecastDayModel) => string | null;
    renderDetailSummary: (host: HelmanUnifiedForecastDetail, day: UnifiedForecastDayModel) => unknown;
    renderDetailRow: (host: HelmanUnifiedForecastDetail, context: UnifiedForecastDetailRenderContext) => unknown;
}

const UNIFIED_FORECAST_DETAIL_PANEL_ID = "unified-forecast-detail-panel";
const UNIFIED_HOUSE_BREAKDOWN_SUMMARY_ID = "unified-house-breakdown-summary";
const UNIFIED_HOUSE_BREAKDOWN_ROWS_ID = "unified-house-breakdown-rows";
const DEFAULT_OVERVIEW_CONFIG = getUnifiedForecastOverviewConfig("solar");
const EMPTY_FORECAST_MODEL: UnifiedForecastModel = {
    days: [],
    visibleSections: {
        solar: false,
        battery: false,
        house: false,
        price: false,
    },
};

@customElement("helman-unified-forecast-detail")
export class HelmanUnifiedForecastDetail extends LitElement {
    static styles = [
        forecastSharedStyles,
        css`
            .unified-forecast-root {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .unified-day-section {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .unified-day-section + .unified-day-section {
                padding-top: 4px;
            }

            .forecast-day-gauge.house {
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--primary-color) 18%, transparent),
                    color-mix(in srgb, var(--primary-color) 10%, transparent)
                );
            }

            .forecast-day-gauge.house .forecast-day-gauge-fill {
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--primary-color) 68%, white 8%),
                    color-mix(in srgb, var(--primary-color) 42%, transparent)
                );
            }

            .forecast-day-gauge.house .forecast-day-gauge-primary,
            .forecast-day-gauge.house .forecast-day-gauge-unit {
                color: color-mix(in srgb, var(--primary-color) 38%, var(--primary-text-color));
                text-shadow:
                    0 0 1px rgba(255, 255, 255, 0.55),
                    0 1px 1px rgba(24, 32, 52, 0.12);
            }

            .unified-breakdown-summary {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .unified-breakdown-title {
                color: var(--secondary-text-color);
                font-size: 0.72rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .forecast-detail-breakdown-rows {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .forecast-day-summary.static {
                cursor: default;
            }

            @media (max-width: 600px) {
                .unified-forecast-root.density-compact .forecast-detail-days {
                    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
                }

                .unified-forecast-root.density-compact .forecast-day-card {
                    gap: 8px;
                    padding: 8px;
                }

                .unified-forecast-root.density-compact .unified-day-section {
                    gap: 3px;
                }

                .unified-forecast-root.density-compact .unified-day-section + .unified-day-section {
                    padding-top: 3px;
                }

                .unified-forecast-root.density-compact .forecast-day-gauge {
                    font-size: 0.86rem;
                }

                .unified-forecast-root.density-compact .forecast-day-chart-track {
                    height: 14px;
                }

                .unified-forecast-root.density-compact .forecast-day-price-line {
                    --forecast-day-price-font-size: 0.68rem;
                    font-size: 0.68rem;
                }

                .unified-forecast-root.density-compact .forecast-detail-panel {
                    gap: 10px;
                    padding: 10px;
                }
            }
        `,
    ];

    private static readonly _overviewElementDefinitions: readonly UnifiedForecastOverviewElementDefinition[] = [
        {
            key: "solarGauge",
            section: "solar",
            supportsDetail: false,
            render: (host, day) => day.solar !== null ? host._renderSolarGauge(day.solar, day.isToday) : nothing,
        },
        {
            key: "solarChart",
            section: "solar",
            supportsDetail: true,
            render: (host, day) => day.solar !== null ? host._renderSolarChart(day.solar) : nothing,
        },
        {
            key: "batteryGauge",
            section: "battery",
            supportsDetail: false,
            render: (host, day) => day.battery !== null ? host._renderBatteryGauge(day.battery) : nothing,
        },
        {
            key: "batteryChart",
            section: "battery",
            supportsDetail: true,
            render: (host, day) => day.battery !== null ? host._renderBatteryChart(day.battery) : nothing,
        },
        {
            key: "consumptionGauge",
            section: "house",
            supportsDetail: false,
            render: (host, day) => day.house !== null ? host._renderConsumptionGauge(day.house) : nothing,
        },
        {
            key: "consumptionChart",
            section: "house",
            supportsDetail: true,
            render: (host, day) => day.house !== null ? host._renderConsumptionChart(day.house) : nothing,
        },
        {
            key: "priceChart",
            section: "price",
            supportsDetail: true,
            render: (host, day) => day.price !== null ? host._renderPriceChart(day.price) : nothing,
        },
    ];

    private static readonly _sectionDefinitions: readonly UnifiedForecastSectionDefinition[] = [
        {
            key: "solar",
            ariaOrder: 1,
            detailSummaryOrder: 1,
            detailRowOrder: 1,
            statusOrder: 1,
            getStatus: (forecast) => forecast.solar.status,
            buildDayCardAriaText: (host, day) => day.solar !== null
                ? `${host.localize("node_detail.forecast_detail.solar_label")} ${host._formatEnergy(day.solar.summaryKwh)}`
                : null,
            renderDetailSummary: (host, day) => day.solar !== null
                ? host._renderSummaryItem(
                    host.localize("node_detail.forecast_detail.solar_label"),
                    host._formatEnergy(day.solar.summaryKwh),
                )
                : nothing,
            renderDetailRow: (host, context) => context.detail.solar !== null
                ? html`<div aria-hidden="true">${host._renderSolarDetailRow(context.detail.solar)}</div>`
                : nothing,
        },
        {
            key: "battery",
            ariaOrder: 2,
            detailSummaryOrder: 2,
            detailRowOrder: 2,
            statusOrder: 3,
            getStatus: (forecast) => forecast.battery_capacity.status,
            buildDayCardAriaText: (host, day) => day.battery !== null
                ? `${host.localize("node_detail.battery_forecast.soc_range")} ${host._formatSocRange(day.battery.minSocPct, day.battery.maxSocPct)}`
                : null,
            renderDetailSummary: (host, day) => day.battery !== null
                ? host._renderSummaryItem(
                    host.localize("node_detail.battery_forecast.soc_range"),
                    host._formatSocRange(day.battery.minSocPct, day.battery.maxSocPct),
                )
                : nothing,
            renderDetailRow: (host, context) => context.detail.battery !== null ? html`
                <div aria-hidden="true">
                    ${renderBatteryDetailRow({
                        detail: context.detail.battery,
                        rowLabel: host.localize("node_detail.battery_forecast.soc_flow"),
                        localize: host.localize,
                        formatHourRange: (start, end) => formatForecastHourRange(
                            start,
                            end,
                            host._locale,
                            host.hass.config.time_zone,
                        ),
                        formatDurationHours: host._formatDurationHours.bind(host),
                        formatEnergy: host._formatEnergy.bind(host),
                        formatSocWithUnit: host._formatSocWithUnit.bind(host),
                    })}
                </div>
            ` : nothing,
        },
        {
            key: "house",
            ariaOrder: 3,
            detailSummaryOrder: 3,
            detailRowOrder: 4,
            statusOrder: 4,
            getStatus: (forecast) => forecast.house_consumption.status,
            buildDayCardAriaText: (host, day) => day.house !== null
                ? `${host.localize("node_detail.house_forecast.title")} ${host._formatEnergy(day.house.baselineDayKwh)}`
                : null,
            renderDetailSummary: (host, day) => day.house !== null
                ? host._renderSummaryItem(
                    host.localize("node_detail.house_forecast.title"),
                    host._formatEnergy(day.house.baselineDayKwh),
                )
                : nothing,
            renderDetailRow: (host, context) => context.detail.house !== null ? html`
                <div aria-hidden="true">
                    ${renderHouseDetailRow({
                        label: host.localize("node_detail.house_forecast.baseline_detail"),
                        columns: context.detail.house.columns,
                        isPrimary: true,
                        multilineLabel: true,
                        formatHour: context.formatHouseHour,
                        formatEnergy: context.formatEnergy,
                        noDataLabel: context.noDataLabel,
                    })}
                </div>
            ` : nothing,
        },
        {
            key: "price",
            ariaOrder: 4,
            detailSummaryOrder: 4,
            detailRowOrder: 3,
            statusOrder: 2,
            getStatus: (forecast) => forecast.grid.status,
            buildDayCardAriaText: (host, day) => day.price !== null
                ? host._getPriceSummaryTitle(day.price)
                : null,
            renderDetailSummary: (host, day) => day.price !== null ? html`
                <div class="forecast-detail-summary-item">
                    <span class="forecast-detail-summary-label">${host.localize("node_detail.forecast_detail.price_label")}</span>
                    <span class="forecast-detail-summary-value">
                        ${host._renderPriceChipLine(day.price.chips, host._getPriceSummaryTitle(day.price), "detail")}
                    </span>
                </div>
            ` : nothing,
            renderDetailRow: (host, context) => context.detail.price !== null
                ? html`<div aria-hidden="true">${host._renderPriceDetailRow(context.detail.price)}</div>`
                : nothing,
        },
    ];

    private _currentLocalParts: LocalDateTimeParts | null = null;
    private _forecastModel: UnifiedForecastModel = EMPTY_FORECAST_MODEL;
    private _detailModel: UnifiedForecastDetailModel | null = null;
    private _modelInputs?: UnifiedForecastModelInputs;

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public forecast: ForecastPayload | null = null;
    @property({ attribute: false }) public overviewConfig: UnifiedForecastOverviewConfig = DEFAULT_OVERVIEW_CONFIG;
    @property({ attribute: false }) public mobileDensity: HelmanForecastMobileDensity = "comfortable";
    @property({ type: Boolean }) public showSectionTitle = true;
    @property({ type: Boolean }) public loading = false;
    @property({ type: Boolean }) public loadFailed = false;

    @state() private _selectedDayKey: string | null = null;
    @state() private _isHouseBreakdownExpanded = false;

    willUpdate(changedProperties: Map<string, unknown>): void {
        super.willUpdate(changedProperties);

        const now = new Date();
        const timeZone = this.hass?.config.time_zone ?? "UTC";
        this._currentLocalParts = getCachedLocalDateTimeParts(now, timeZone);

        const nextInputs = this._buildModelInputs(now);
        if (!this._haveModelInputsChanged(nextInputs)) {
            return;
        }

        const chartContext = this._buildChartContext(now);
        this._forecastModel = buildUnifiedForecastModel({
            forecast: this.forecast,
            chartContext,
            sectionVisibility: nextInputs.sectionVisibility,
            remainingTodayKwhOverride: nextInputs.remainingTodayKwh,
            now,
        });
        const overviewConfig = this._getNormalizedOverviewConfig();

        if (this._selectedDayKey !== null && !this._forecastModel.days.some((day) => day.dayKey === this._selectedDayKey)) {
            this._selectedDayKey = null;
            this._isHouseBreakdownExpanded = false;
        }

        if (!this._hasAnyEnabledDetailSection(overviewConfig)) {
            this._selectedDayKey = null;
            this._isHouseBreakdownExpanded = false;
        }

        const selectedDay = this._forecastModel.days.find((day) => day.dayKey === this._selectedDayKey) ?? null;
        this._detailModel = selectedDay !== null
            ? buildUnifiedForecastDetailModel({
                day: selectedDay,
                chartContext,
                batteryMinSoc: nextInputs.batteryMinSoc,
                batteryMaxSoc: nextInputs.batteryMaxSoc,
                includeHouseBreakdownRows: nextInputs.houseBreakdownExpanded,
            })
            : null;
        this._modelInputs = nextInputs;
    }

    render() {
        if (!this.hass || !this.localize) {
            return nothing;
        }

        if (this.forecast === null) {
            const message = this.loadFailed && !this.loading
                ? this.localize("node_detail.forecast_detail.forecast_unavailable")
                : this.localize("card.loading");
            return this._renderForecastSection(html`
                <div class="muted">${message}</div>
            `);
        }

        const selectedDay = this._forecastModel.days.find((day) => day.dayKey === this._selectedDayKey) ?? null;
        const statusNote = this._getStatusNote();
        const overviewConfig = this._getNormalizedOverviewConfig();
        const hasAnyDetailSection = this._hasAnyEnabledDetailSection(overviewConfig);

        return this._renderForecastSection(
            this._forecastModel.days.length > 0
                ? html`
                    <div class="forecast-detail-days">
                        ${this._forecastModel.days.map((day) => this._renderDayCard(day, overviewConfig))}
                    </div>
                    ${selectedDay !== null && this._detailModel !== null && hasAnyDetailSection
                        ? this._renderDetailPanel(selectedDay, this._detailModel)
                        : nothing}
                `
                : html`
                    <div class="muted">${this._getEmptyMessage()}</div>
                `,
            statusNote,
        );
    }

    private _renderForecastSection(content: unknown, statusNote: string | null = null) {
        return html`
            <div class=${["unified-forecast-root", `density-${this.mobileDensity}`].join(" ")}>
                <div class="forecast-section">
                    ${this.showSectionTitle ? html`
                        <div class="section-title">${this.localize("node_detail.forecast_detail.title")}</div>
                    ` : nothing}
                    ${statusNote !== null ? html`
                        <div class="forecast-status-note">${statusNote}</div>
                    ` : nothing}
                    ${content}
                </div>
            </div>
        `;
    }

    private _renderDayCard(
        day: UnifiedForecastDayModel,
        overviewConfig: UnifiedForecastOverviewConfig,
    ) {
        const canExpand = this._hasAnyEnabledDetailSection(overviewConfig);
        const isExpanded = canExpand && this._selectedDayKey === day.dayKey;
        const dayLabel = this._formatDayLabel(day);
        const detailLabel = this.localize("node_detail.forecast_detail.hourly_detail");
        const summaryContent = html`
            <div class="forecast-day-header">
                <div class="forecast-day-label">${dayLabel}</div>
                ${canExpand ? html`
                    <span class="forecast-day-toggle" aria-hidden="true">${isExpanded ? "−" : "+"}</span>
                ` : nothing}
            </div>
            ${HelmanUnifiedForecastDetail._overviewElementDefinitions.map((definition) => overviewConfig[definition.key]
                ? definition.render(this, day)
                : nothing)}
        `;

        return html`
            <div class="forecast-day-card ${day.isToday ? "today" : ""} ${isExpanded ? "expanded" : ""}">
                ${canExpand ? html`
                    <button
                        type="button"
                        class="forecast-day-summary"
                        @click=${() => void this._toggleDay(day.dayKey)}
                        aria-expanded=${String(isExpanded)}
                        aria-controls=${isExpanded ? UNIFIED_FORECAST_DETAIL_PANEL_ID : nothing}
                        aria-label=${`${this._buildDayCardAriaLabel(day, dayLabel)}. ${detailLabel}`}
                    >
                        ${summaryContent}
                    </button>
                ` : html`
                    <div
                        class="forecast-day-summary static"
                        aria-label=${this._buildDayCardAriaLabel(day, dayLabel)}
                    >
                        ${summaryContent}
                    </div>
                `}
            </div>
        `;
    }

    private _renderSolarGauge(
        solar: UnifiedSolarOverviewModel,
        isToday: boolean,
    ) {
        return html`
            <div class="unified-day-section">
                <div class="forecast-day-gauge solar">
                    ${isToday && solar.totalGaugeFillPercent > solar.gaugeFillPercent ? html`
                        <span
                            class="forecast-day-gauge-fill muted"
                            style=${`width:${solar.totalGaugeFillPercent}%;`}
                            aria-hidden="true"
                        ></span>
                    ` : nothing}
                    ${solar.gaugeFillPercent > 0 ? html`
                        <span
                            class="forecast-day-gauge-fill"
                            style=${`width:${solar.gaugeFillPercent}%;`}
                            aria-hidden="true"
                        ></span>
                    ` : nothing}
                    ${isToday && solar.totalKwh !== null
                        ? this._renderSharedEnergyValue(solar.summaryKwh, solar.totalKwh)
                        : this._renderEnergyValue(solar.summaryKwh)}
                </div>
            </div>
        `;
    }

    private _renderSolarChart(solar: UnifiedSolarOverviewModel) {
        return html`
            <div class="unified-day-section">
                <div class="forecast-day-chart-row" aria-hidden="true">
                    <div class="forecast-day-chart-track ${solar.miniChartBars.length === 0 ? "empty" : ""}">
                        ${solar.miniChartBars.map((bar) => html`
                            <span
                                class="forecast-day-chart-bar solar ${bar.isPast ? "past" : ""} ${bar.isGap ? "gap" : ""}"
                                style=${`--forecast-bar-height:${bar.heightPercent}%; --forecast-bar-offset:0%;`}
                            ></span>
                        `)}
                    </div>
                </div>
            </div>
        `;
    }

    private _renderBatteryGauge(battery: UnifiedBatteryOverviewModel) {
        const title = `${this.localize("node_detail.battery_forecast.end_soc")}: ${this._formatSocWithUnit(battery.endSocPct)}. ${this.localize("node_detail.battery_forecast.soc_range")}: ${this._formatSocRange(battery.minSocPct, battery.maxSocPct)}`;

        return html`
            <div class="unified-day-section">
                <div class="forecast-day-gauge battery" title=${title}>
                    ${battery.gaugeFillPercent > 0 ? html`
                        <span
                            class="forecast-day-gauge-fill"
                            style=${`width:${battery.gaugeFillPercent}%;`}
                            aria-hidden="true"
                        ></span>
                    ` : nothing}
                    <span class="forecast-day-gauge-primary">${this._formatSoc(battery.endSocPct)}</span>
                    <span class="forecast-day-gauge-unit">%</span>
                </div>
            </div>
        `;
    }

    private _renderBatteryChart(battery: UnifiedBatteryOverviewModel) {
        const title = `${this.localize("node_detail.battery_forecast.end_soc")}: ${this._formatSocWithUnit(battery.endSocPct)}. ${this.localize("node_detail.battery_forecast.soc_range")}: ${this._formatSocRange(battery.minSocPct, battery.maxSocPct)}`;

        return html`
            <div class="unified-day-section">
                <div class="forecast-day-chart-row" aria-hidden="true">
                    <div
                        class="forecast-day-chart-track ${battery.miniChartBars.length === 0 ? "empty" : ""}"
                        title=${title}
                    >
                        ${battery.miniChartBars.map((bar) => html`
                            <span
                                class="forecast-day-chart-bar battery-soc ${bar.toneClass} ${bar.isPast ? "past" : ""} ${bar.isGap ? "gap" : ""}"
                                style=${`--forecast-bar-height:${bar.heightPercent}%; --forecast-bar-offset:0%;`}
                            ></span>
                        `)}
                    </div>
                </div>
            </div>
        `;
    }

    private _renderConsumptionGauge(house: UnifiedHouseOverviewModel) {
        const title = `${this.localize("node_detail.house_forecast.baseline")}: ${this._formatEnergy(house.baselineDayKwh)}`;

        return html`
            <div class="unified-day-section">
                <div class="forecast-day-gauge house" title=${title}>
                    ${house.gaugeFillPercent > 0 ? html`
                        <span
                            class="forecast-day-gauge-fill"
                            style=${`width:${house.gaugeFillPercent}%;`}
                            aria-hidden="true"
                        ></span>
                    ` : nothing}
                    ${this._renderEnergyValue(house.baselineDayKwh)}
                </div>
            </div>
        `;
    }

    private _renderConsumptionChart(house: UnifiedHouseOverviewModel) {
        return html`
            <div class="unified-day-section">
                <div class="forecast-day-chart-row" aria-hidden="true">
                    <div class="forecast-day-chart-track ${house.miniChartBars.length === 0 ? "empty" : ""}">
                        ${house.miniChartBars.map((bar) => html`
                            <span
                                class="forecast-day-chart-bar house-baseline ${bar.isPast ? "past" : ""} ${bar.isGap ? "gap" : ""}"
                                style=${`--forecast-bar-height:${bar.heightPercent}%; --forecast-bar-offset:0%;`}
                            ></span>
                        `)}
                    </div>
                </div>
            </div>
        `;
    }

    private _renderPriceChart(price: UnifiedPriceOverviewModel) {
        const title = this._getPriceSummaryTitle(price);

        return html`
            <div class="unified-day-section" title=${title ?? nothing}>
                <div class="forecast-day-chart-row" aria-hidden="true">
                    <div class="forecast-day-chart-track price ${price.hasNegativeValues ? "has-negative" : ""} ${price.miniChartBars.length === 0 ? "empty" : ""}">
                        ${price.miniChartBars.map((bar) => html`
                            <span
                                class="forecast-day-chart-bar ${bar.toneClass} ${bar.isPast ? "past" : ""}"
                                style=${`--forecast-bar-height:${bar.heightPercent}%; --forecast-bar-offset:${bar.offsetPercent}%;`}
                            ></span>
                        `)}
                    </div>
                </div>
            </div>
        `;
    }

    private _renderPriceChipLine(
        chips: UnifiedPriceOverviewChip[],
        title: string | null,
        variant: "overview" | "detail",
    ) {
        if (chips.length === 0 || title === null) {
            return nothing;
        }

        const [firstChip, ...remainingChips] = chips;
        const hasCurrentChip = firstChip?.shortLabel === "";

        return html`
            <div class="forecast-day-price-line" title=${title}>
                ${firstChip ? this._renderPriceChip(firstChip, chips.length === 1) : nothing}
                ${variant === "detail" && hasCurrentChip && remainingChips.length > 0 ? html`
                    <span class="forecast-day-price-separator" aria-hidden="true">/</span>
                ` : nothing}
                ${remainingChips.map((chip, index) => this._renderPriceChip(chip, index === remainingChips.length - 1))}
            </div>
        `;
    }

    private _renderPriceChip(chip: UnifiedPriceOverviewChip, showUnit: boolean) {
        const unit = showUnit ? this._getDisplayPriceUnit() : null;

        return html`
            <span class="forecast-day-price-chip ${chip.toneClass} ${chip.muted ? "muted" : ""}">
                ${chip.shortLabel !== "" ? html`
                    <span class="forecast-day-price-prefix" aria-hidden="true">${chip.shortLabel}</span>
                ` : nothing}
                <span class="forecast-day-price-value">${this._formatCompactPrice(chip.value)}</span>
                ${unit !== null ? html`
                    <span class="forecast-day-price-unit">${unit}</span>
                ` : nothing}
            </span>
        `;
    }

    private _renderDetailPanel(day: UnifiedForecastDayModel, detail: UnifiedForecastDetailModel) {
        const dayLabel = this._formatDayLabel(day);
        const overviewConfig = this._getNormalizedOverviewConfig();
        const detailVisibility = this._getDetailSectionVisibility(overviewConfig);
        const batteryCoverageNote = detailVisibility.battery && day.battery !== null && !day.battery.coversDayEnd
            ? this._getBatteryCoverageNote(day.battery)
            : null;
        const formatEnergy = this._formatEnergy.bind(this);
        const formatHouseHour = (timestamp: string) => formatForecastHour(timestamp, this._locale, this.hass.config.time_zone);
        const noDataLabel = this.localize("node_detail.house_forecast.no_data");
        const hasBreakdown = detailVisibility.house && (detail.house?.hasBreakdown ?? false);
        const breakdownRows = detail.house?.breakdownRows ?? [];
        const showBreakdown = hasBreakdown && this._isHouseBreakdownExpanded;
        const columnCount = Math.max(detail.axis.columns.length, 1);
        const detailRenderContext: UnifiedForecastDetailRenderContext = {
            detail,
            formatEnergy,
            formatHouseHour,
            noDataLabel,
        };
        const detailSummarySections = this._getVisibleSectionDefinitions(detailVisibility, "detailSummaryOrder");
        const detailRowSections = this._getVisibleSectionDefinitions(detailVisibility, "detailRowOrder");

        return html`
            <div
                id=${UNIFIED_FORECAST_DETAIL_PANEL_ID}
                class="forecast-detail-panel"
                role="region"
                aria-label=${`${dayLabel}. ${this.localize("node_detail.forecast_detail.hourly_detail")}`}
            >
                <div class="forecast-detail-panel-header">
                    <div class="forecast-detail-panel-heading">
                        <div class="forecast-detail-panel-title">${dayLabel}</div>
                        <div class="forecast-detail-panel-subtitle">${this.localize("node_detail.forecast_detail.hourly_detail")}</div>
                    </div>
                    <div class="forecast-detail-summary">
                        ${detailSummarySections.map((definition) => definition.renderDetailSummary(this, day))}
                    </div>
                </div>
                ${batteryCoverageNote !== null ? html`
                    <div class="forecast-status-note">${batteryCoverageNote}</div>
                ` : nothing}
                <div class="forecast-detail-chart" style=${`--forecast-column-count:${columnCount};`}>
                    ${detailRowSections.map((definition) => definition.renderDetailRow(this, detailRenderContext))}
                    ${hasBreakdown ? renderHouseBreakdownDisclosureRow({
                        expanded: showBreakdown,
                        controlsId: `${UNIFIED_HOUSE_BREAKDOWN_SUMMARY_ID} ${UNIFIED_HOUSE_BREAKDOWN_ROWS_ID}`,
                        onToggle: this._toggleHouseBreakdown.bind(this),
                        showLabel: this.localize("node_detail.house_forecast.show_deferrables"),
                        hideLabel: this.localize("node_detail.house_forecast.hide_deferrables"),
                    }) : nothing}
                    <div id=${UNIFIED_HOUSE_BREAKDOWN_SUMMARY_ID} ?hidden=${!showBreakdown}>
                        ${showBreakdown && detail.house !== null ? html`
                            <div class="unified-breakdown-summary">
                                <div class="unified-breakdown-title">${this.localize("node_detail.house_forecast.deferrables")}</div>
                                ${renderHouseBreakdownSummary({
                                    items: detail.house.breakdownSummaryItems,
                                    formatEnergy,
                                })}
                            </div>
                        ` : nothing}
                    </div>
                    <div
                        id=${UNIFIED_HOUSE_BREAKDOWN_ROWS_ID}
                        class="forecast-detail-breakdown-rows"
                        aria-hidden="true"
                        ?hidden=${!showBreakdown}
                    >
                        ${showBreakdown ? breakdownRows.map((row, index) => renderHouseDetailRow({
                            label: row.label,
                            columns: row.columns,
                            colorMix: getForecastConsumerColorMix(index),
                            formatHour: formatHouseHour,
                            formatEnergy,
                            noDataLabel,
                        })) : nothing}
                    </div>
                    <div aria-hidden="true">${this._renderSharedAxis(detail)}</div>
                </div>
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

    private _renderSolarDetailRow(detail: UnifiedSolarDetailRowModel) {
        const hasData = detail.columns.some((column) => column.value !== null);
        const trackClass = ["forecast-detail-track", "solar", !hasData ? "empty" : ""].filter(Boolean).join(" ");

        return html`
            <div class="forecast-detail-row">
                <div class="forecast-detail-row-label">${this.localize("node_detail.forecast_detail.solar_label")}</div>
                <div class=${trackClass}>
                    ${detail.columns.map((column) => this._renderSolarDetailColumn(column))}
                </div>
            </div>
        `;
    }

    private _renderSolarDetailColumn(column: UnifiedSolarDetailColumnModel) {
        const valueLabel = column.value !== null
            ? this._formatEnergy(column.value / 1000)
            : this.localize("node_detail.forecast_detail.solar_unavailable");

        return html`
            <div
                class="forecast-detail-column ${column.isPast ? "past" : ""} ${column.isGap ? "gap" : ""} ${column.source}"
                title=${`${formatForecastHour(column.timestamp, this._locale, this.hass.config.time_zone)} · ${this.localize("node_detail.forecast_detail.solar_label")} ${valueLabel}`}
            >
                ${column.isMax && column.value !== null ? html`
                    <span class="forecast-detail-highlight top solar">
                        ↑ ${this._formatEnergy(column.value / 1000)}
                    </span>
                ` : nothing}
                ${column.value !== null ? html`
                    <span
                        class="forecast-detail-bar solar"
                        style=${`--forecast-bar-height:${column.heightPercent}%; --forecast-bar-offset:0%;`}
                    ></span>
                ` : nothing}
            </div>
        `;
    }

    private _renderPriceDetailRow(detail: UnifiedPriceDetailRowModel) {
        const hasData = detail.columns.some((column) => column.value !== null);
        const trackClass = [
            "forecast-detail-track",
            "price",
            !hasData ? "empty" : "",
            detail.hasNegativeValues ? "has-negative" : "",
        ].filter(Boolean).join(" ");

        return html`
            <div class="forecast-detail-row">
                <div class="forecast-detail-row-label">${this.localize("node_detail.forecast_detail.price_label")}</div>
                <div class=${trackClass}>
                    ${detail.columns.map((column) => this._renderPriceDetailColumn(column, detail))}
                </div>
            </div>
        `;
    }

    private _renderPriceDetailColumn(
        column: UnifiedPriceDetailColumnModel,
        detail: UnifiedPriceDetailRowModel,
    ) {
        const valueLabel = column.value !== null
            ? this._formatPrice(column.value)
            : this.localize("node_detail.forecast_detail.price_unavailable");
        const isSharedHighlight = column.isMin && column.isMax && detail.minColumnIndex === detail.maxColumnIndex;

        return html`
            <div
                class="forecast-detail-column ${column.isPast ? "past" : ""} ${column.isGap ? "gap" : ""}"
                title=${`${formatForecastHour(column.timestamp, this._locale, this.hass.config.time_zone)} · ${this.localize("node_detail.forecast_detail.price_label")} ${valueLabel}`}
            >
                ${column.value !== null && (column.isMax || isSharedHighlight) ? html`
                    <span class="forecast-detail-highlight top ${column.toneClass}">
                        ${isSharedHighlight ? "↕" : "↑"} ${this._formatCompactPrice(column.value)}
                    </span>
                ` : nothing}
                ${column.value !== null && column.isMin && !isSharedHighlight ? html`
                    <span class="forecast-detail-highlight bottom ${column.toneClass}">
                        ↓ ${this._formatCompactPrice(column.value)}
                    </span>
                ` : nothing}
                ${column.value !== null ? html`
                    <span
                        class="forecast-detail-bar ${column.toneClass}"
                        style=${`--forecast-bar-height:${column.heightPercent}%; --forecast-bar-offset:${column.offsetPercent}%;`}
                    ></span>
                ` : nothing}
            </div>
        `;
    }

    private _renderSharedAxis(detail: UnifiedForecastDetailModel) {
        return html`
            <div class="forecast-detail-axis">
                <div class="forecast-detail-axis-spacer" aria-hidden="true"></div>
                <div class="forecast-detail-axis-grid">
                    ${detail.axis.columns.map((column) => html`
                        <span class="forecast-detail-axis-tick ${column.isPast ? "past" : ""}">
                            ${column.hourLabel ?? ""}
                        </span>
                    `)}
                </div>
            </div>
        `;
    }

    private _buildDayCardAriaLabel(day: UnifiedForecastDayModel, dayLabel: string): string {
        const parts = [`${this.localize("node_detail.forecast_detail.title")}: ${dayLabel}`];
        const sectionVisibility = this._getSectionVisibility();

        for (const definition of this._getVisibleSectionDefinitions(sectionVisibility, "ariaOrder")) {
            const part = definition.buildDayCardAriaText(this, day);
            if (part !== null) {
                parts.push(part);
            }
        }

        return parts.join(". ");
    }

    private _getStatusNote(): string | null {
        const statuses = this._getVisibleStatuses();
        if (statuses.includes("partial")) {
            return this.localize("node_detail.forecast_detail.partial_note");
        }

        if (statuses.includes("unavailable") || statuses.includes("insufficient_history")) {
            return this.localize("node_detail.forecast_detail.unavailable_note");
        }

        return null;
    }

    private _getEmptyMessage(): string {
        if (!this._hasAnyEnabledSection()) {
            return this.localize("node_detail.forecast_detail.no_sections_enabled");
        }

        const statuses = this._getVisibleStatuses();
        if (statuses.includes("available") || statuses.includes("partial")) {
            return this.localize("node_detail.forecast_detail.no_future_data");
        }

        return this.localize("node_detail.forecast_detail.forecast_unavailable");
    }

    private _getVisibleStatuses(): string[] {
        const forecast = this.forecast;
        if (forecast === null) {
            return [];
        }

        const sectionVisibility = this._getSectionVisibility();
        return this._getVisibleSectionDefinitions(sectionVisibility, "statusOrder")
            .map((definition) => definition.getStatus(forecast))
            .filter((status): status is string => typeof status === "string");
    }

    private _hasAnyEnabledSection(): boolean {
        return this._hasAnyVisibleSection(this._getSectionVisibility());
    }

    private _buildModelInputs(now: Date): UnifiedForecastModelInputs {
        const timeZone = this.hass?.config.time_zone ?? "UTC";
        const sectionVisibility = this._getSectionVisibility();
        return {
            forecast: this.forecast,
            timeZone,
            locale: this._locale,
            currentDayKey: this._currentLocalParts?.dayKey ?? null,
            currentHourKey: getLocalHourKey(now, timeZone),
            remainingTodayKwh: this._readRemainingTodayKwh(),
            sectionVisibility,
            selectedDayKey: this._selectedDayKey,
            houseBreakdownExpanded: this._isHouseBreakdownExpanded,
            batteryMinSoc: this.forecast?.battery_capacity.minSoc ?? null,
            batteryMaxSoc: this.forecast?.battery_capacity.maxSoc ?? null,
        };
    }

    private _haveModelInputsChanged(nextInputs: UnifiedForecastModelInputs): boolean {
        return this._modelInputs?.forecast !== nextInputs.forecast
            || this._modelInputs?.timeZone !== nextInputs.timeZone
            || this._modelInputs?.locale !== nextInputs.locale
            || this._modelInputs?.currentDayKey !== nextInputs.currentDayKey
            || this._modelInputs?.currentHourKey !== nextInputs.currentHourKey
            || this._modelInputs?.remainingTodayKwh !== nextInputs.remainingTodayKwh
            || this._modelInputs?.selectedDayKey !== nextInputs.selectedDayKey
            || this._modelInputs?.houseBreakdownExpanded !== nextInputs.houseBreakdownExpanded
            || this._modelInputs?.batteryMinSoc !== nextInputs.batteryMinSoc
            || this._modelInputs?.batteryMaxSoc !== nextInputs.batteryMaxSoc
            || this._modelInputs?.sectionVisibility.solar !== nextInputs.sectionVisibility.solar
            || this._modelInputs?.sectionVisibility.battery !== nextInputs.sectionVisibility.battery
            || this._modelInputs?.sectionVisibility.house !== nextInputs.sectionVisibility.house
            || this._modelInputs?.sectionVisibility.price !== nextInputs.sectionVisibility.price;
    }

    private _buildChartContext(now: Date) {
        const timeZone = this.hass.config.time_zone;
        return {
            currentDayKey: this._currentLocalParts?.dayKey ?? null,
            currentHourKey: getLocalHourKey(now, timeZone),
            locale: this._locale,
            timeZone,
        };
    }

    private _getNormalizedOverviewConfig(): UnifiedForecastOverviewConfig {
        return normalizeUnifiedForecastOverviewConfig(this.overviewConfig);
    }

    private _getSectionVisibility(): HelmanForecastSectionVisibility {
        return getUnifiedForecastSectionVisibility(
            this._getNormalizedOverviewConfig(),
        );
    }

    private _getDetailSectionVisibility(overviewConfig: UnifiedForecastOverviewConfig): HelmanForecastSectionVisibility {
        const detailVisibility: HelmanForecastSectionVisibility = {
            solar: false,
            battery: false,
            house: false,
            price: false,
        };

        for (const definition of HelmanUnifiedForecastDetail._overviewElementDefinitions) {
            if (!definition.supportsDetail || !overviewConfig[definition.key]) {
                continue;
            }

            detailVisibility[definition.section] = true;
        }

        return detailVisibility;
    }

    private _hasAnyEnabledDetailSection(overviewConfig: UnifiedForecastOverviewConfig): boolean {
        return this._hasAnyVisibleSection(this._getDetailSectionVisibility(overviewConfig));
    }

    private _hasAnyVisibleSection(sectionVisibility: HelmanForecastSectionVisibility): boolean {
        return HelmanUnifiedForecastDetail._sectionDefinitions.some((definition) => sectionVisibility[definition.key]);
    }

    private _getVisibleSectionDefinitions(
        sectionVisibility: HelmanForecastSectionVisibility,
        orderKey: keyof Pick<
            UnifiedForecastSectionDefinition,
            "ariaOrder" | "detailSummaryOrder" | "detailRowOrder" | "statusOrder"
        >,
    ): UnifiedForecastSectionDefinition[] {
        return HelmanUnifiedForecastDetail._sectionDefinitions
            .filter((definition) => sectionVisibility[definition.key])
            .sort((left, right) => left[orderKey] - right[orderKey]);
    }

    private _readRemainingTodayKwh(): number | null | undefined {
        const entityId = this.forecast?.solar.remainingTodayEnergyEntityId ?? null;
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

    private async _toggleDay(dayKey: string): Promise<void> {
        this._selectedDayKey = this._selectedDayKey === dayKey ? null : dayKey;
        this._isHouseBreakdownExpanded = false;
        if (this._selectedDayKey === null) {
            return;
        }

        await this.updateComplete;
        this.renderRoot.querySelector<HTMLElement>(`#${UNIFIED_FORECAST_DETAIL_PANEL_ID}`)?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
        });
    }

    private _toggleHouseBreakdown(): void {
        this._isHouseBreakdownExpanded = !this._isHouseBreakdownExpanded;
    }

    private _getBatteryCoverageNote(battery: UnifiedBatteryOverviewModel): string {
        const partialReason = this.forecast?.battery_capacity.partialReason ?? null;
        const reason = this.forecast?.battery_capacity.status === "partial"
            ? this._getBatteryPartialNote(partialReason)
            : null;
        const coverage = `${this.localize("node_detail.battery_forecast.coverage_until")}: ${this._formatTimestamp(battery.coverageEndsAt)}`;
        return reason ? `${reason} ${coverage}` : coverage;
    }

    private _getBatteryPartialNote(partialReason: string | null): string {
        switch (partialReason) {
            case "missing_current_hour_solar":
                return this.localize("node_detail.battery_forecast.partial_reason_missing_current_hour_solar");
            case "solar_forecast_ended":
                return this.localize("node_detail.battery_forecast.partial_reason_solar_forecast_ended");
            default:
                return this.localize("node_detail.battery_forecast.partial_note");
        }
    }

    private _formatDayLabel(day: UnifiedForecastDayModel): string {
        return formatForecastDayLabel({
            dayKey: day.dayKey,
            isToday: day.isToday,
            isTomorrow: day.isTomorrow,
            locale: this._locale,
            todayLabel: this.localize("node_detail.forecast_detail.today"),
            tomorrowLabel: this.localize("node_detail.forecast_detail.tomorrow"),
        });
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

    private _renderEnergyValue(valueKwh: number) {
        const display = this._getEnergyDisplay(valueKwh);
        return html`
            <span class="forecast-day-gauge-primary">${display.value}</span>
            <span class="forecast-day-gauge-unit">${display.unit}</span>
        `;
    }

    private _renderSharedEnergyValue(primaryValueKwh: number, secondaryValueKwh: number) {
        const display = this._getSharedEnergyDisplay(primaryValueKwh, secondaryValueKwh);
        return html`
            <span class="forecast-day-gauge-primary">${display.primary}</span>
            <span class="forecast-day-gauge-separator" aria-hidden="true">/</span>
            <span class="forecast-day-gauge-secondary">
                ${display.secondary}
                <span class="forecast-day-gauge-unit">${display.unit}</span>
            </span>
        `;
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

    private _formatCompactPrice(value: number): string {
        return this._formatSignedPriceValue(value);
    }

    private _formatPrice(value: number): string {
        const signedValue = this._formatSignedPriceValue(value);
        const unit = this._getDisplayPriceUnit();
        return unit ? `${signedValue} ${unit}` : signedValue;
    }

    private _formatSignedPriceValue(value: number): string {
        const formattedValue = new Intl.NumberFormat(this._locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
        return value > 0 ? `+${formattedValue}` : formattedValue;
    }

    private _getDisplayPriceUnit(): string | null {
        return this.forecast?.grid.unit
            ? this.forecast.grid.unit.replace(/\s*\/\s*/g, " / ")
            : null;
    }

    private _getPriceSummaryTitle(price: UnifiedPriceOverviewModel): string | null {
        const entries: string[] = [];
        if (price.currentPrice !== null) {
            entries.push(`${this.localize("node_detail.forecast_detail.current_label")} ${this._formatPrice(price.currentPrice)}`);
        }
        if (price.priceMin !== null) {
            entries.push(`${this.localize("node_detail.forecast_detail.price_min")} ${this._formatPrice(price.priceMin)}`);
        }
        if (price.priceMax !== null) {
            entries.push(`${this.localize("node_detail.forecast_detail.price_max")} ${this._formatPrice(price.priceMax)}`);
        }
        return entries.length > 0 ? entries.join(", ") : null;
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

    private _formatTimestamp(value: string): string {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return new Intl.DateTimeFormat(this._locale, {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: this.hass.config.time_zone ?? "UTC",
        }).format(date);
    }

    private _formatDurationHours(value: number): string {
        const fractionDigits = value < 1 ? 2 : Number.isInteger(value) ? 0 : 1;
        return `${value.toFixed(fractionDigits)} h`;
    }

    private get _locale(): string {
        return this.hass.locale?.language || navigator.language;
    }
}
