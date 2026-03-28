import { LitElement, css, html } from "lit-element";
import { customElement, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCard } from "../../hass-frontend/src/panels/lovelace/types";
import type { ForecastPayload, SchedulePayload } from "../helman-api";
import { ForecastLoader } from "../helman/forecast-loader";
import { getLocalizeFunction, type LocalizeFunction } from "../localize/localize";
import type { HelmanSchedulingCardConfig } from "./HelmanSchedulingCardConfig";
import "./components/scheduling-card-header";
import "./components/scheduling-slot-table";
import "./dialogs/scheduling-range-edit-dialog";
import { getScheduleErrorLabel } from "./model/schedule-labels";
import { normalizeSchedulePayload } from "./model/schedule-normalizer";
import { buildScheduleSlotPatches } from "./model/schedule-patch-builder";
import { buildScheduleTableSections } from "./model/schedule-table-builder";
import {
    buildSlotForecastMap,
    deriveScheduleForecastParams,
    EMPTY_SLOT_FORECAST_MAP,
    type SlotForecastMap,
} from "./model/slot-forecast-model";
import { getSharedScheduleOwner, type SharedScheduleOwner } from "./schedule-owner";
import type {
    NormalizedScheduleModel,
    ScheduleDialogOpenDetail,
    ScheduleDialogResult,
    ScheduleDialogState,
    ScheduleOwnerSnapshot,
    ScheduleSlotPatch,
    ScheduleSlotToggleDetail,
    ScheduleTableSectionModel,
} from "./schedule-types";
import { schedulingSharedStyles } from "./styles/scheduling-shared-styles";

const EMPTY_SCHEDULE_OWNER_SNAPSHOT: ScheduleOwnerSnapshot = {
    schedule: null,
    loading: false,
    refreshing: false,
    writing: false,
    togglingExecution: false,
    error: null,
    updatedAt: null,
    stale: false,
};

const EMPTY_NORMALIZED_SCHEDULE: NormalizedScheduleModel = {
    slots: [],
    currentSlotId: null,
    currentDayKey: null,
};

@customElement("helman-scheduling-card")
export class HelmanSchedulingCard extends LitElement implements LovelaceCard {
    public static async getStubConfig(_hass: HomeAssistant): Promise<Partial<HelmanSchedulingCardConfig>> {
        return { type: "custom:helman-scheduling-card" };
    }

    static styles = [
        schedulingSharedStyles,
        css`
            :host {
                display: block;
            }

            ha-card {
                overflow: hidden;
            }

            ha-card.transparent {
                background: transparent;
                box-shadow: none;
                border: none;
            }

            .card-content {
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 12px;
            }
        `,
    ];

    private _config!: HelmanSchedulingCardConfig;
    private _localizeFn?: LocalizeFunction;
    private _scheduleOwner?: SharedScheduleOwner;
    private _unsubscribeScheduleOwner?: () => void;
    private _normalizedSchedule: NormalizedScheduleModel = EMPTY_NORMALIZED_SCHEDULE;
    private _tableSections: ScheduleTableSectionModel[] = [];
    private _forecastLoader: ForecastLoader | null = null;
    private _forecastLoaderGranularity: number | null = null;
    private _forecastLoaderDays: number | null = null;
    private _forecastLoadGeneration = 0;
    private _slotForecastMap: SlotForecastMap = EMPTY_SLOT_FORECAST_MAP;
    private _pendingDialogPatches: ScheduleSlotPatch[] | null = null;

    @state() private _hass?: HomeAssistant;
    @state() private _ownerSnapshot: ScheduleOwnerSnapshot = EMPTY_SCHEDULE_OWNER_SNAPSHOT;
    @state() private _forecast: ForecastPayload | null = null;
    @state() private _selectedSlotIds: string[] = [];
    @state() private _dialogState: ScheduleDialogState | null = null;
    @state() private _dialogOpen = false;

    public set hass(value: HomeAssistant) {
        const previous = this._hass;
        const shouldReloadSchedule = previous?.connection !== value?.connection;
        this._hass = value;
        this._localizeFn = value ? getLocalizeFunction(value) : undefined;

        if (shouldReloadSchedule) {
            this._detachScheduleOwner();
            this._resetScheduleState();
        }

        if (this.isConnected) {
            this._syncScheduleOwner();
        }

        this.requestUpdate("hass", previous);
    }

    getCardSize() {
        return 4;
    }

    setConfig(config: HelmanSchedulingCardConfig) {
        this._config = {
            transparent_background: false,
            ...config,
        };
    }

    connectedCallback(): void {
        super.connectedCallback();
        this._syncScheduleOwner();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this._detachScheduleOwner();
    }

    willUpdate(changedProperties: Map<string, unknown>): void {
        super.willUpdate(changedProperties);
        if (!this._hass) {
            this._normalizedSchedule = EMPTY_NORMALIZED_SCHEDULE;
            this._tableSections = [];
            this._slotForecastMap = EMPTY_SLOT_FORECAST_MAP;
            return;
        }

        if (changedProperties.has("_ownerSnapshot") || changedProperties.has("_hass")) {
            const previousOwnerSnapshot = changedProperties.get("_ownerSnapshot") as ScheduleOwnerSnapshot | undefined;
            const scheduleChanged = changedProperties.has("_ownerSnapshot")
                && previousOwnerSnapshot?.schedule !== this._ownerSnapshot.schedule;
            this._normalizedSchedule = normalizeSchedulePayload({
                schedule: this._ownerSnapshot.schedule,
                timeZone: this._hass.config.time_zone ?? "UTC",
                locale: this._locale,
            });
            this._tableSections = buildScheduleTableSections({
                slots: this._normalizedSchedule.slots,
                locale: this._locale,
                currentDayKey: this._normalizedSchedule.currentDayKey,
                todayLabel: this._localize("scheduling.day.today"),
                tomorrowLabel: this._localize("scheduling.day.tomorrow"),
            });

            const validSlotIds = new Set(this._normalizedSchedule.slots.map((slot) => slot.id));
            const nextSelectedSlotIds = this._selectedSlotIds.filter((id) => validSlotIds.has(id));
            if (nextSelectedSlotIds.length !== this._selectedSlotIds.length) {
                this._selectedSlotIds = nextSelectedSlotIds;
            }

            if (this._dialogState && scheduleChanged) {
                this._dialogOpen = false;
                this._pendingDialogPatches = null;
            }
        }

        if (changedProperties.has("_ownerSnapshot") || changedProperties.has("_forecast") || changedProperties.has("_hass")) {
            this._slotForecastMap = buildSlotForecastMap(this._forecast, this._normalizedSchedule.slots);
        }
    }

    render() {
        if (!this._hass) {
            return html`<ha-card class=${this._config?.transparent_background ? "transparent" : ""}></ha-card>`;
        }

        return html`
            <ha-card
                class=${this._config?.transparent_background ? "transparent" : ""}
                @refresh-schedule=${this._handleRefresh}
                @toggle-schedule-execution=${this._handleToggleExecution}
                @toggle-schedule-slot-selection=${this._handleToggleSlotSelection}
                @open-schedule-dialog=${this._handleOpenDialog}
            >
                <div class="card-content">
                    <scheduling-card-header
                        .title=${this._config.title || this._localize("scheduling.title_default")}
                        .executionEnabled=${this._ownerSnapshot.schedule?.executionEnabled ?? false}
                        .loading=${this._ownerSnapshot.loading}
                        .refreshing=${this._ownerSnapshot.refreshing}
                        .togglingExecution=${this._ownerSnapshot.togglingExecution}
                        .updatedAt=${this._ownerSnapshot.updatedAt}
                        .localize=${this._localize}
                        .locale=${this._locale}
                        .timeZone=${this._hass.config.time_zone ?? "UTC"}
                    ></scheduling-card-header>

                    ${this._renderInlineError()}

                    ${this._ownerSnapshot.schedule === null
                        ? this._renderEmptyState()
                        : html`
                            <scheduling-slot-table
                                .sections=${this._tableSections}
                                .selectedSlotIds=${this._selectedSlotIds}
                                .slotForecastMap=${this._slotForecastMap}
                                .localize=${this._localize}
                                .busy=${this._ownerSnapshot.writing || this._ownerSnapshot.togglingExecution}
                                .executionEnabled=${this._ownerSnapshot.schedule?.executionEnabled ?? false}
                            ></scheduling-slot-table>
                        `}
                </div>
            </ha-card>

            ${this._dialogState ? html`
                <scheduling-range-edit-dialog
                    .open=${this._dialogOpen}
                    .localize=${this._localize}
                    .dialogState=${this._dialogState}
                    @closed=${this._handleDialogClosed}
                    @schedule-dialog-submit=${this._handleDialogSubmit}
                ></scheduling-range-edit-dialog>
            ` : nothing}
        `;
    }

    private _renderInlineError() {
        if (this._ownerSnapshot.error === null) {
            return nothing;
        }

        const errorLabel = getScheduleErrorLabel({
            code: this._ownerSnapshot.error.code,
            localize: this._localize,
            fallbackMessage: this._ownerSnapshot.error.message,
        });
        const showRawMessage = this._ownerSnapshot.error.message
            && this._ownerSnapshot.error.message !== errorLabel;

        return html`
            <div class="inline-error">
                <div class="inline-error-title">${errorLabel}</div>
                ${this._ownerSnapshot.stale
                    ? html`<div class="muted">${this._localize("scheduling.error.showing_last_good")}</div>`
                    : nothing}
                ${showRawMessage ? html`<div class="muted">${this._ownerSnapshot.error.message}</div>` : nothing}
            </div>
        `;
    }

    private _renderEmptyState() {
        if (this._ownerSnapshot.loading) {
            return html`
                <div class="panel">
                    <div class="muted">${this._localize("card.loading")}</div>
                </div>
            `;
        }

        return html`
            <div class="panel">
                <div class="muted">${this._localize("scheduling.empty")}</div>
            </div>
        `;
    }

    private async _handleRefresh(event: Event): Promise<void> {
        event.stopPropagation();
        await this._scheduleOwner?.refresh();
    }

    private async _handleToggleExecution(event: CustomEvent<{ enabled: boolean }>): Promise<void> {
        event.stopPropagation();
        await this._scheduleOwner?.setExecutionEnabled(event.detail.enabled);
    }

    private _handleToggleSlotSelection(event: CustomEvent<ScheduleSlotToggleDetail>): void {
        event.stopPropagation();
        const { slotId } = event.detail;

        if (this._selectedSlotIds.includes(slotId)) {
            this._selectedSlotIds = this._selectedSlotIds.filter((id) => id !== slotId);
            return;
        }

        this._selectedSlotIds = [...this._selectedSlotIds, slotId];
    }

    private _handleOpenDialog(event: CustomEvent<ScheduleDialogOpenDetail>): void {
        event.stopPropagation();

        const clickedSlotId = event.detail.slotId;
        const nextSelectedSlotIds = this._resolveDialogSelectionIds(clickedSlotId);
        const selectedSlots = this._getSelectedSlots(nextSelectedSlotIds);
        if (selectedSlots.length === 0) {
            if (nextSelectedSlotIds.length === 0) {
                this._selectedSlotIds = [];
            }
            return;
        }

        const initialActionSlot = this._normalizedSchedule.slots.find((slot) => slot.id === clickedSlotId)
            ?? selectedSlots[0];

        this._dialogState = {
            selectedSlots,
            initialAction: initialActionSlot.action,
        };
        this._dialogOpen = true;
    }

    private async _handleDialogClosed(event: Event): Promise<void> {
        event.stopPropagation();
        const pendingPatches = this._pendingDialogPatches;
        this._dialogOpen = false;
        this._dialogState = null;
        this._pendingDialogPatches = null;
        if (!pendingPatches || pendingPatches.length === 0) {
            return;
        }

        await this._scheduleOwner?.applySchedulePatches(pendingPatches);
    }

    private _handleDialogSubmit(event: CustomEvent<ScheduleDialogResult>): void {
        event.stopPropagation();
        if (!this._dialogState) {
            return;
        }

        let patches;
        try {
            patches = buildScheduleSlotPatches({
                selectedSlots: this._dialogState.selectedSlots,
                action: event.detail.action,
            });
        } catch (error) {
            console.error("helman-scheduling: failed to build schedule patches", error);
            return;
        }

        this._pendingDialogPatches = patches;
        this._dialogOpen = false;
    }

    private _resetScheduleState(): void {
        this._ownerSnapshot = EMPTY_SCHEDULE_OWNER_SNAPSHOT;
        this._normalizedSchedule = EMPTY_NORMALIZED_SCHEDULE;
        this._tableSections = [];
        this._selectedSlotIds = [];
        this._dialogState = null;
        this._dialogOpen = false;
        this._forecast = null;
        this._forecastLoader = null;
        this._forecastLoaderGranularity = null;
        this._forecastLoaderDays = null;
        this._forecastLoadGeneration = 0;
        this._slotForecastMap = EMPTY_SLOT_FORECAST_MAP;
        this._pendingDialogPatches = null;
    }

    private _syncScheduleOwner(): void {
        const hass = this._hass;
        if (!this.isConnected || !hass) {
            return;
        }

        const owner = getSharedScheduleOwner(hass);
        if (this._scheduleOwner === owner) {
            this._applyOwnerSnapshot(owner.getSnapshot());
            return;
        }

        this._detachScheduleOwner();
        this._scheduleOwner = owner;
        this._applyOwnerSnapshot(owner.getSnapshot());
        this._unsubscribeScheduleOwner = owner.subscribe((snapshot) => {
            this._applyOwnerSnapshot(snapshot);
        });
    }

    private _detachScheduleOwner(): void {
        this._unsubscribeScheduleOwner?.();
        this._unsubscribeScheduleOwner = undefined;
        this._scheduleOwner = undefined;
    }

    private _applyOwnerSnapshot(snapshot: ScheduleOwnerSnapshot): void {
        const scheduleChanged = snapshot.schedule !== null
            && snapshot.schedule !== this._ownerSnapshot.schedule;
        this._ownerSnapshot = snapshot;

        if (scheduleChanged) {
            void this._loadForecastForSchedule(snapshot.schedule!, {
                resetExistingForecast: snapshot.writing || snapshot.togglingExecution,
            });
        }
    }

    private async _loadForecastForSchedule(
        schedule: SchedulePayload,
        options: { resetExistingForecast?: boolean } = {},
    ): Promise<void> {
        const hass = this._hass;
        if (!hass) {
            return;
        }

        const generation = ++this._forecastLoadGeneration;
        const params = deriveScheduleForecastParams(
            schedule.slots,
            hass.config.time_zone ?? "UTC",
        );
        if (params === null) {
            this._forecast = null;
            this._forecastLoader = null;
            this._forecastLoaderGranularity = null;
            this._forecastLoaderDays = null;
            return;
        }

        const paramsChanged = (
            this._forecastLoader === null
            || this._forecastLoaderGranularity !== params.granularity
            || this._forecastLoaderDays !== params.forecastDays
        );
        if (options.resetExistingForecast || paramsChanged) {
            this._forecast = null;
        }
        this._forecastLoader = new ForecastLoader(params.granularity, params.forecastDays);
        this._forecastLoaderGranularity = params.granularity;
        this._forecastLoaderDays = params.forecastDays;

        try {
            const forecast = await this._forecastLoader.load(hass);
            if (generation === this._forecastLoadGeneration && this._hass?.connection === hass.connection) {
                this._forecast = forecast;
            }
        } catch (err) {
            console.error("helman-scheduling: failed to load forecast", err);
        }
    }

    private _getSelectedSlots(selectedSlotIds: readonly string[]): ScheduleDialogState["selectedSlots"] {
        const selectedIdSet = new Set(selectedSlotIds);
        return this._normalizedSchedule.slots.filter((slot) => selectedIdSet.has(slot.id));
    }

    private _resolveDialogSelectionIds(clickedSlotId: string): string[] {
        const selectedSlots = this._getSelectedSlots(this._selectedSlotIds);
        const clickedSlot = this._normalizedSchedule.slots.find((slot) => slot.id === clickedSlotId);
        if (!clickedSlot) {
            return selectedSlots.map((slot) => slot.id);
        }

        if (selectedSlots.length === 0 || !selectedSlots.some((slot) => slot.id === clickedSlot.id)) {
            return [clickedSlot.id];
        }

        return selectedSlots.map((slot) => slot.id);
    }

    private get _localize(): LocalizeFunction {
        return this._localizeFn ?? getLocalizeFunction(this._hass!);
    }

    private get _locale(): string {
        if (this._hass?.locale?.language) {
            return this._hass.locale.language;
        }

        return typeof navigator !== "undefined" ? navigator.language : "cs";
    }
}

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
    type: "helman-scheduling-card",
    name: "Helman Scheduling Card",
    description: "Manual schedule overview and editing card for Helman.",
    preview: true,
});
