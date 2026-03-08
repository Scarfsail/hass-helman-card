import { LitElement, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../../hass-frontend/src/types";
import type { ForecastPointDTO, GridForecastDTO, SolarForecastDTO } from "../../helman-api";
import { getDisplayEnergyUnit } from "../../helman/energy-unit-converter";
import type { LocalizeFunction } from "../../localize/localize";
import { buildForecastDetailModel, type ForecastDetailDayModel } from "./forecast-detail-model";
import { nodeDetailSharedStyles } from "./node-detail-shared-styles";

interface ForecastHourSlot {
    timestamp: string;
    solarValue: number | null;
    priceValue: number | null;
}

@customElement("helman-forecast-detail")
export class HelmanForecastDetail extends LitElement {

    static styles = [nodeDetailSharedStyles];

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public solarForecast: SolarForecastDTO | null = null;
    @property({ attribute: false }) public gridForecast: GridForecastDTO | null = null;
    @state() private _selectedDayKey: string | null = null;

    render() {
        if (!this._hasConfiguredForecast(this.solarForecast) && !this._hasConfiguredForecast(this.gridForecast)) {
            return nothing;
        }

        const days = buildForecastDetailModel({
            solarForecast: this.solarForecast,
            gridForecast: this.gridForecast,
            timeZone: this.hass.config.time_zone,
        });
        const statusNote = days.length > 0 ? this._getStatusNote() : null;

        return html`
            <div class="forecast-section">
                <div class="section-title">${this.localize("node_detail.forecast_detail.title")}</div>
                ${statusNote !== null ? html`
                    <div class="forecast-status-note">${statusNote}</div>
                ` : nothing}
                ${days.length > 0 ? html`
                    <div class="forecast-detail-days">
                        ${days.map((day) => this._renderDay(day))}
                    </div>
                ` : html`
                    <div class="muted">${this._getEmptyMessage()}</div>
                `}
            </div>
        `;
    }

    private _renderDay(day: ForecastDetailDayModel) {
        const isExpanded = this._selectedDayKey === day.dayKey;
        const panelId = `forecast-day-hourly-${day.dayKey}`;
        const dayLabel = this._formatDayLabel(day);

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
                    aria-controls=${panelId}
                    aria-label=${`${this.localize("node_detail.forecast_detail.title")}: ${dayLabel}`}
                >
                    <div class="forecast-day-header">
                        <div class="forecast-day-label">${dayLabel}</div>
                        <span class="forecast-day-toggle" aria-hidden="true">${isExpanded ? "−" : "+"}</span>
                    </div>
                    <div class="forecast-day-lane">
                        <div class="forecast-day-lane-label">${this.localize("node_detail.forecast_detail.solar_label")}</div>
                        ${day.hasSolarData && day.solarSummaryKwh !== null ? html`
                            <div class="forecast-day-solar-value">${this._formatEnergy(day.solarSummaryKwh)}</div>
                        ` : html`
                            <div class="forecast-day-placeholder">${this.localize("node_detail.forecast_detail.solar_unavailable")}</div>
                        `}
                    </div>
                    <div class="forecast-day-lane">
                        <div class="forecast-day-lane-label">${this.localize("node_detail.forecast_detail.price_label")}</div>
                        ${day.hasPriceData && day.priceMin !== null && day.priceMax !== null ? html`
                            <div class="forecast-day-price-range">
                                ${this._renderPriceRow("node_detail.forecast_detail.price_min", day.priceMin)}
                                ${this._renderPriceRow("node_detail.forecast_detail.price_max", day.priceMax)}
                            </div>
                        ` : html`
                            <div class="forecast-day-placeholder">${this.localize("node_detail.forecast_detail.price_unavailable")}</div>
                        `}
                    </div>
                </button>
                ${isExpanded ? html`
                    <div
                        id=${panelId}
                        class="forecast-day-hourly"
                        role="region"
                        aria-label=${`${dayLabel}: ${this.localize("node_detail.forecast_detail.hourly_detail")}`}
                    >
                        <div class="forecast-day-hourly-label">${this.localize("node_detail.forecast_detail.hourly_detail")}</div>
                        <div class="forecast-hourly-list">
                            ${this._buildHourSlots(day).map((slot) => this._renderHourSlot(slot))}
                        </div>
                    </div>
                ` : nothing}
            </div>
        `;
    }

    private _renderHourSlot(slot: ForecastHourSlot) {
        return html`
            <div class="forecast-hour-row">
                <div class="forecast-hour-time">${this._formatHour(slot.timestamp)}</div>
                <div class="forecast-hour-metrics">
                    <div class="forecast-hour-metric">
                        <span class="forecast-hour-metric-label">${this.localize("node_detail.forecast_detail.solar_label")}</span>
                        <span class="forecast-hour-metric-value">
                            ${slot.solarValue !== null ? this._formatEnergy(slot.solarValue / 1000) : "—"}
                        </span>
                    </div>
                    <div class="forecast-hour-metric ${slot.priceValue !== null ? this._getPriceToneClass(slot.priceValue) : ""}">
                        <span class="forecast-hour-metric-label">${this.localize("node_detail.forecast_detail.price_label")}</span>
                        <span class="forecast-hour-metric-value">
                            ${slot.priceValue !== null ? this._formatPrice(slot.priceValue) : "—"}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }

    private _renderPriceRow(labelKey: string, value: number) {
        return html`
            <div class="forecast-day-price-row ${this._getPriceToneClass(value)}">
                <span class="forecast-day-price-label">${this.localize(labelKey)}</span>
                <span class="forecast-day-price-value">${this._formatPrice(value)}</span>
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

    private _formatPrice(value: number): string {
        const formattedValue = new Intl.NumberFormat(
            this.hass.locale?.language || navigator.language,
            { maximumFractionDigits: 3 },
        ).format(value);
        const signedValue = value > 0 ? `+${formattedValue}` : formattedValue;

        return this.gridForecast?.unit ? `${signedValue} ${this.gridForecast.unit}` : signedValue;
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
        this.renderRoot.querySelector<HTMLElement>(`[data-day-key="${this._selectedDayKey}"]`)?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
        });
    }

    private _hasConfiguredForecast(forecast: SolarForecastDTO | GridForecastDTO | null): boolean {
        return forecast !== null && forecast.status !== "not_configured";
    }
}
