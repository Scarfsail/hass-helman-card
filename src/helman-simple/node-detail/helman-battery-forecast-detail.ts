import { LitElement, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { BatteryCapacityForecastDTO, ForecastPayload } from "../../helman-api";
import { getDisplayEnergyUnit } from "../../helman/energy-unit-converter";
import { FORECAST_REFRESH_MS, loadForecast, refreshForecast } from "../../helman/forecast-loader";
import type { LocalizeFunction } from "../../localize/localize";
import {
    buildBatteryOverviewCardModel,
    type BatteryOverviewCardModel,
} from "./battery-capacity-forecast-overview-model";
import {
    buildBatteryDetailChartModel,
    type BatteryChartBuildContext,
    type BatteryDetailChartModel,
    type BatteryDetailColumnModel,
} from "./battery-capacity-forecast-chart-model";
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
    startedAt: string | null;
    status: BatteryCapacityForecastDTO["status"] | null;
    seriesLength: number;
    actualHistoryLength: number;
    actualHistoryLastTimestamp: string | null;
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
            actualHistory: this._batteryForecast?.actualHistory ?? [],
            series: this._batteryForecast?.series ?? [],
            currentSoc: this._batteryForecast?.currentSoc ?? null,
            startedAt: this._batteryForecast?.startedAt ?? null,
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
        const chartContext = this._buildChartContext();

        return html`
            <div class="forecast-detail-days">
                ${this._forecastDays.map((day) => this._renderDayCard(day, chartContext))}
            </div>
            ${selectedDay !== null ? this._renderSelectedDayPanel(selectedDay, chartContext) : nothing}
        `;
    }

    private _renderDayCard(day: BatteryCapacityForecastDay, chartContext: BatteryChartBuildContext) {
        const isExpanded = this._selectedDayKey === day.dayKey;
        const dayLabel = this._formatDayLabel(day);
        const overview = buildBatteryOverviewCardModel({ day, context: chartContext });

        return html`
            <div
                class="forecast-day-card ${day.isToday ? "today" : ""} ${isExpanded ? "expanded" : ""}"
                data-day-key=${day.dayKey}
            >
                <button
                    type="button"
                    class="forecast-day-summary"
                    @click=${() => void this._toggleDay(day.dayKey)}
                    aria-expanded=${isExpanded ? "true" : "false"}
                    aria-controls=${isExpanded ? BATTERY_FORECAST_DETAIL_PANEL_ID : nothing}
                    aria-label=${this._buildDayCardAriaLabel(day, dayLabel)}
                >
                    <div class="forecast-day-header">
                        <div class="forecast-day-label">${dayLabel}</div>
                        <span class="forecast-day-toggle" aria-hidden="true">${isExpanded ? "−" : "+"}</span>
                    </div>
                    <div
                        class="forecast-day-gauge battery"
                        title=${`${this.localize("node_detail.battery_forecast.end_soc")}: ${this._formatSocWithUnit(day.endSocPct)}`}
                    >
                        ${overview.gaugeFillPercent > 0 ? html`
                            <span
                                class="forecast-day-gauge-fill"
                                style=${`width:${overview.gaugeFillPercent}%;`}
                                aria-hidden="true"
                            ></span>
                        ` : nothing}
                        <span class="forecast-day-gauge-primary">${this._formatSoc(day.endSocPct)}</span>
                        <span class="forecast-day-gauge-unit">%</span>
                    </div>
                    <div class="forecast-day-range-line">                        
                        <span class="forecast-day-range-value">
                            ${this._formatSocRange(day.minSocPct, day.maxSocPct)}
                        </span>
                    </div>
                    <div class="forecast-day-mini-charts" aria-hidden="true">
                        ${this._renderSocMiniChart(overview)}
                    </div>
                </button>
            </div>
        `;
    }

    private _renderSelectedDayPanel(day: BatteryCapacityForecastDay, chartContext: BatteryChartBuildContext) {
        const dayLabel = this._formatDayLabel(day);
        const detail = buildBatteryDetailChartModel({
            day,
            minSoc: this._batteryForecast?.minSoc ?? null,
            maxSoc: this._batteryForecast?.maxSoc ?? null,
            context: chartContext,
        });
        const coverageNote = !day.coversDayEnd
            ? this._batteryForecast?.status === "partial"
                ? `${this._getPartialNote(this._batteryForecast?.partialReason ?? null)} ${this.localize("node_detail.battery_forecast.coverage_until")}: ${this._formatTimestamp(day.coverageEndsAt)}`
                : `${this.localize("node_detail.battery_forecast.coverage_until")}: ${this._formatTimestamp(day.coverageEndsAt)}`
            : null;

        return html`
            <div
                id=${BATTERY_FORECAST_DETAIL_PANEL_ID}
                class="forecast-detail-panel"
                role="region"
                aria-label=${`${dayLabel}. ${this.localize("node_detail.battery_forecast.hourly_detail")}`}
            >
                <div class="forecast-detail-panel-header">
                    <div class="forecast-detail-panel-heading">
                        <div class="forecast-detail-panel-title">${dayLabel}</div>
                        <div class="forecast-detail-panel-subtitle">
                            ${this.localize("node_detail.battery_forecast.hourly_detail")}
                        </div>
                    </div>
                </div>
                <div class="forecast-detail-summary">
                    ${this._renderSummaryItem(
                        this.localize("node_detail.battery_forecast.min_soc"),
                        this._formatSocWithTime(day.minSocPct, day.minSocAt),
                    )}
                    ${this._renderSummaryItem(
                        this.localize("node_detail.battery_forecast.max_soc"),
                        this._formatSocWithTime(day.maxSocPct, day.maxSocAt),
                    )}
                </div>
                ${coverageNote !== null ? html`
                    <div class="forecast-status-note">${coverageNote}</div>
                ` : nothing}
                ${this._renderDetailChart(detail)}
            </div>
        `;
    }

    private _renderDetailChart(detail: BatteryDetailChartModel) {
        const columnCount = Math.max(detail.columns.length, 1);

        return html`
            <div
                class="forecast-detail-chart"
                style=${`--forecast-column-count:${columnCount};`}
                aria-hidden="true"
            >
                ${this._renderSocRow(detail)}
                ${this._renderMovementRow(detail)}
                <div class="forecast-detail-axis">
                    <div class="forecast-detail-axis-spacer" aria-hidden="true"></div>
                    <div class="forecast-detail-axis-grid">
                        ${detail.columns.map((column) => html`
                            <span class="forecast-detail-axis-tick ${column.isPast ? "past" : ""}">
                                ${column.hourLabel ?? ""}
                            </span>
                        `)}
                    </div>
                </div>
            </div>
        `;
    }

    private _renderSocRow(detail: BatteryDetailChartModel) {
        return html`
            <div class="forecast-detail-row primary">
                <div class="forecast-detail-row-label">${this.localize("node_detail.battery.soc")}</div>
                <div class="forecast-detail-track battery-soc">
                    ${detail.minSocOffsetPercent !== null ? html`
                        <span
                            class="forecast-detail-reference-line min-soc"
                            style=${`--forecast-reference-offset:${detail.minSocOffsetPercent}%;`}
                        ></span>
                    ` : nothing}
                    ${detail.maxSocOffsetPercent !== null ? html`
                        <span
                            class="forecast-detail-reference-line max-soc"
                            style=${`--forecast-reference-offset:${detail.maxSocOffsetPercent}%;`}
                        ></span>
                    ` : nothing}
                    ${detail.columns.map((column) => this._renderSocColumn(column))}
                </div>
            </div>
        `;
    }

    private _renderSocColumn(column: BatteryDetailColumnModel) {
        const socToneClass = this._getSocToneClass(column);

        return html`
            <div
                class="forecast-detail-column ${column.isPast ? "past" : ""} ${column.isGap ? "gap" : ""} ${column.source}"
                title=${this._buildSocColumnTitle(column)}
            >
                ${column.endSocPct !== null && column.socChangeHeightPercent > 0 ? html`
                    <span
                        class="forecast-detail-battery-change ${socToneClass}"
                        style=${`--forecast-change-offset:${column.socChangeOffsetPercent}%; --forecast-change-height:${column.socChangeHeightPercent}%;`}
                    ></span>
                ` : nothing}
                ${column.endSocPct !== null ? html`
                    <span
                        class="forecast-detail-battery-step ${socToneClass}"
                        style=${`--forecast-step-offset:${column.socStepOffsetPercent}%;`}
                    ></span>
                    <span
                        class="forecast-detail-battery-dot ${socToneClass}"
                        style=${`--forecast-dot-offset:${column.socStepOffsetPercent}%;`}
                    ></span>
                ` : nothing}
            </div>
        `;
    }

    private _renderSocMiniChart(overview: BatteryOverviewCardModel) {
        const chartClass = [
            "forecast-day-chart-track",
            "battery-soc",
            overview.miniChartBars.length === 0 ? "empty" : "",
        ].filter(Boolean).join(" ");

        return html`
            <div class="forecast-day-chart-row">
                <div class=${chartClass}>
                    ${overview.miniChartBars.map((bar) => html`
                        <span
                            class="forecast-day-chart-bar battery-soc ${bar.toneClass} ${bar.isPast ? "past" : ""} ${bar.isGap ? "gap" : ""}"
                            style=${`--forecast-bar-height:${bar.heightPercent}%; --forecast-bar-offset:0%;`}
                        ></span>
                    `)}
                </div>
            </div>
        `;
    }

    private _renderMovementRow(detail: BatteryDetailChartModel) {
        const hasData = detail.columns.some((column) => column.hasMovementData && Math.abs(column.movementValueKwh) > 0);
        const trackClass = [
            "forecast-detail-track",
            "battery-movement",
            !hasData ? "empty" : "",
            detail.hasBidirectionalMovement ? "has-negative" : "",
        ].filter(Boolean).join(" ");

        return html`
            <div class="forecast-detail-row">
                <div class="forecast-detail-row-label">
                    ${this.localize("node_detail.battery_forecast.charge_discharge")}
                </div>
                <div class=${trackClass}>
                    ${detail.columns.map((column) => this._renderMovementColumn(column))}
                </div>
            </div>
        `;
    }

    private _renderMovementColumn(column: BatteryDetailColumnModel) {
        return html`
            <div
                class="forecast-detail-column ${column.isPast ? "past" : ""} ${column.isGap ? "gap" : ""} ${column.source}"
                title=${this._buildMovementColumnTitle(column)}
            >
                ${column.hasMovementData && column.movementHeightPercent > 0 ? html`
                    <span
                        class="forecast-detail-bar battery-movement ${column.movementToneClass}"
                        style=${`--forecast-bar-height:${column.movementHeightPercent}%; --forecast-bar-offset:${column.movementOffsetPercent}%;`}
                    ></span>
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

    private _formatHour(value: string): string {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return new Intl.DateTimeFormat(this.hass.locale?.language ?? this.hass.language ?? "cs", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: this.hass.config.time_zone ?? "UTC",
        }).format(date);
    }

    private _formatHourRange(start: string, end: string): string {
        return `${this._formatHour(start)}–${this._formatHour(end)}`;
    }

    private _formatDurationHours(value: number): string {
        const fractionDigits = value < 1 ? 2 : Number.isInteger(value) ? 0 : 1;
        return `${value.toFixed(fractionDigits)} h`;
    }

    private get _batteryForecast(): BatteryCapacityForecastDTO | null {
        return this._forecast?.battery_capacity ?? null;
    }

    private _buildModelInputs(): BatteryModelInputs {
        const batteryForecast = this._batteryForecast;

        return {
            generatedAt: batteryForecast?.generatedAt ?? null,
            startedAt: batteryForecast?.startedAt ?? null,
            status: batteryForecast?.status ?? null,
            seriesLength: batteryForecast?.series.length ?? 0,
            actualHistoryLength: batteryForecast?.actualHistory.length ?? 0,
            actualHistoryLastTimestamp: batteryForecast?.actualHistory.length
                ? batteryForecast.actualHistory[batteryForecast.actualHistory.length - 1].timestamp
                : null,
            coverageUntil: batteryForecast?.coverageUntil ?? null,
            currentSoc: batteryForecast?.currentSoc ?? null,
            timeZone: this.hass?.config.time_zone ?? "UTC",
            currentDayKey: this._currentLocalParts?.dayKey ?? null,
        };
    }

    private _haveModelInputsChanged(next: BatteryModelInputs): boolean {
        return this._modelInputs?.generatedAt !== next.generatedAt
            || this._modelInputs?.startedAt !== next.startedAt
            || this._modelInputs?.status !== next.status
            || this._modelInputs?.seriesLength !== next.seriesLength
            || this._modelInputs?.actualHistoryLength !== next.actualHistoryLength
            || this._modelInputs?.actualHistoryLastTimestamp !== next.actualHistoryLastTimestamp
            || this._modelInputs?.coverageUntil !== next.coverageUntil
            || this._modelInputs?.currentSoc !== next.currentSoc
            || this._modelInputs?.timeZone !== next.timeZone
            || this._modelInputs?.currentDayKey !== next.currentDayKey;
    }

    private _buildChartContext(): BatteryChartBuildContext {
        return {
            currentDayKey: this._currentLocalParts?.dayKey ?? null,
            currentHour: this._currentLocalParts?.hour ?? null,
            locale: this.hass.locale?.language || navigator.language,
            timeZone: this.hass.config.time_zone ?? "UTC",
        };
    }

    private async _toggleDay(dayKey: string): Promise<void> {
        this._selectedDayKey = this._selectedDayKey === dayKey ? null : dayKey;

        if (this._selectedDayKey === null) {
            return;
        }

        await this.updateComplete;
        this.renderRoot.querySelector<HTMLElement>(`#${BATTERY_FORECAST_DETAIL_PANEL_ID}`)?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
        });
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

    private _formatSocWithTime(value: number, at: string | null): string {
        if (at === null) {
            return this._formatSocWithUnit(value);
        }

        return `${this._formatSocWithUnit(value)} • ${this._formatHour(at)}`;
    }

    private _formatSocRange(minSoc: number, maxSoc: number): string {
        return `${this._formatSoc(minSoc)}–${this._formatSoc(maxSoc)} %`;
    }

    private _getSocToneClass(column: BatteryDetailColumnModel): "soft" | "hit-min" | "hit-max" {
        return column.hitMaxSoc
            ? "hit-max"
            : column.hitMinSoc
                ? "hit-min"
                : "soft";
    }

    private _formatEnergy(valueKwh: number): string {
        const display = getDisplayEnergyUnit(valueKwh);
        const fractionDigits = display.unit === "Wh" ? 0 : 1;
        return `${display.value.toFixed(fractionDigits)} ${display.unit}`;
    }

    private _buildSocColumnTitle(column: BatteryDetailColumnModel): string {
        if (column.isGap || column.endSocPct === null) {
            return [
                this._formatHourRange(column.timestamp, column.endsAt),
                this.localize("node_detail.battery_forecast.no_data"),
            ].join(" · ");
        }

        return [
            this._formatHourRange(column.timestamp, column.endsAt),
            `${this.localize("node_detail.battery.soc")}: ${this._formatSocWithUnit(column.startSocPct ?? column.endSocPct)} → ${this._formatSocWithUnit(column.endSocPct)}`,
            `${this.localize("node_detail.battery_forecast.slot_duration")}: ${this._formatDurationHours(column.durationHours)}`,
        ].join(" · ");
    }

    private _buildMovementColumnTitle(column: BatteryDetailColumnModel): string {
        if (!column.hasMovementData) {
            return [
                this._formatHourRange(column.timestamp, column.endsAt),
                this.localize("node_detail.battery_forecast.no_data"),
            ].join(" · ");
        }

        const parts = [
            this._formatHourRange(column.timestamp, column.endsAt),
            `${this.localize("node_detail.battery_forecast.slot_duration")}: ${this._formatDurationHours(column.durationHours)}`,
        ];

        if (column.chargedKwh > 0) {
            parts.push(`${this.localize("node_detail.battery_forecast.charged")}: ${this._formatEnergy(column.chargedKwh)}`);
        }
        if (column.dischargedKwh > 0) {
            parts.push(`${this.localize("node_detail.battery_forecast.discharged")}: ${this._formatEnergy(column.dischargedKwh)}`);
        }
        if (column.importedFromGridKwh > 0) {
            parts.push(`${this.localize("node_detail.battery_forecast.imported_from_grid")}: ${this._formatEnergy(column.importedFromGridKwh)}`);
        }
        if (column.exportedToGridKwh > 0) {
            parts.push(`${this.localize("node_detail.battery_forecast.exported_to_grid")}: ${this._formatEnergy(column.exportedToGridKwh)}`);
        }
        if (parts.length === 2) {
            parts.push(`${this.localize("node_detail.battery_forecast.charge_discharge")}: ${this._formatEnergy(0)}`);
        }

        return parts.join(" · ");
    }

    private _buildDayCardAriaLabel(day: BatteryCapacityForecastDay, dayLabel: string): string {
        const parts = [
            dayLabel,
            `${this.localize("node_detail.battery_forecast.end_soc")}: ${this._formatSocWithUnit(day.endSocPct)}`,
            `${this.localize("node_detail.battery_forecast.soc_range")}: ${this._formatSocRange(day.minSocPct, day.maxSocPct)}`,
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
