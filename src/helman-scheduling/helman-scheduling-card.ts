import { LitElement, css, html } from "lit-element";
import { customElement, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCard } from "../../hass-frontend/src/panels/lovelace/types";
import { getLocalizeFunction, type LocalizeFunction } from "../localize/localize";
import type { HelmanSchedulingCardConfig } from "./HelmanSchedulingCardConfig";
import "./components/scheduling-card-header";
import "./components/scheduling-day-section";
import "./components/scheduling-now-strip";
import "./dialogs/scheduling-range-edit-dialog";
import { buildScheduleDaySections } from "./model/schedule-interval-builder";
import { getScheduleErrorLabel } from "./model/schedule-labels";
import { normalizeSchedulePayload } from "./model/schedule-normalizer";
import { buildScheduleSlotPatches } from "./model/schedule-patch-builder";
import { getSharedScheduleOwner, type SharedScheduleOwner } from "./schedule-owner";
import type {
    NormalizedScheduleModel,
    ScheduleDaySectionModel,
    ScheduleDialogMode,
    ScheduleDialogResult,
    ScheduleDialogState,
    ScheduleOwnerSnapshot,
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
    now: null,
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

            .schedule-sections {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
        `,
    ];

    private _config!: HelmanSchedulingCardConfig;
    private _localizeFn?: LocalizeFunction;
    private _scheduleOwner?: SharedScheduleOwner;
    private _unsubscribeScheduleOwner?: () => void;
    private _normalizedSchedule: NormalizedScheduleModel = EMPTY_NORMALIZED_SCHEDULE;
    private _daySections: ScheduleDaySectionModel[] = [];

    @state() private _hass?: HomeAssistant;
    @state() private _ownerSnapshot: ScheduleOwnerSnapshot = EMPTY_SCHEDULE_OWNER_SNAPSHOT;
    @state() private _expandedIntervalIds: string[] = [];
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
            this._daySections = [];
            return;
        }

        if (changedProperties.has("_ownerSnapshot") || changedProperties.has("_hass")) {
            this._normalizedSchedule = normalizeSchedulePayload({
                schedule: this._ownerSnapshot.schedule,
                timeZone: this._hass.config.time_zone ?? "UTC",
                locale: this._locale,
            });
            this._daySections = buildScheduleDaySections({
                slots: this._normalizedSchedule.slots,
                locale: this._locale,
                currentDayKey: this._normalizedSchedule.currentDayKey,
                todayLabel: this._localize("scheduling.day.today"),
                tomorrowLabel: this._localize("scheduling.day.tomorrow"),
            });

            const validRowIds = new Set(this._daySections.flatMap((section) => section.rows.map((row) => row.id)));
            const nextExpandedIntervalIds = this._expandedIntervalIds.filter((id) => validRowIds.has(id));
            if (nextExpandedIntervalIds.length !== this._expandedIntervalIds.length) {
                this._expandedIntervalIds = nextExpandedIntervalIds;
            }
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
                @toggle-schedule-interval=${this._handleToggleInterval}
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
                            <scheduling-now-strip
                                .now=${this._normalizedSchedule.now}
                                .executionEnabled=${this._ownerSnapshot.schedule.executionEnabled}
                                .localize=${this._localize}
                            ></scheduling-now-strip>
                            <div class="schedule-sections">
                                ${this._daySections.map((section) => html`
                                    <scheduling-day-section
                                        .dayLabel=${section.dayLabel}
                                        .rows=${section.rows}
                                        .expandedIntervalIds=${this._expandedIntervalIds}
                                        .localize=${this._localize}
                                        .busy=${this._ownerSnapshot.writing || this._ownerSnapshot.togglingExecution}
                                        .executionEnabled=${this._ownerSnapshot.schedule?.executionEnabled ?? false}
                                    ></scheduling-day-section>
                                `)}
                            </div>
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

    private _handleToggleInterval(event: CustomEvent<{ intervalId: string }>): void {
        event.stopPropagation();
        this._expandedIntervalIds = this._expandedIntervalIds.includes(event.detail.intervalId)
            ? this._expandedIntervalIds.filter((intervalId) => intervalId !== event.detail.intervalId)
            : [...this._expandedIntervalIds, event.detail.intervalId];
    }

    private _handleOpenDialog(
        event: CustomEvent<{ mode: ScheduleDialogMode; intervalId: string; slotId?: string }>,
    ): void {
        event.stopPropagation();

        const interval = this._findInterval(event.detail.intervalId);
        if (!interval) {
            console.error("helman-scheduling: interval not found", event.detail.intervalId);
            return;
        }

        switch (event.detail.mode) {
            case "edit-slot": {
                const slot = interval.slots.find((entry) => entry.id === event.detail.slotId);
                if (!slot) {
                    console.error("helman-scheduling: slot not found", event.detail.slotId);
                    return;
                }

                this._dialogState = {
                    mode: "edit-slot",
                    intervalId: interval.id,
                    intervalLabel: slot.rangeLabel,
                    slots: [slot],
                    initialStartSlotId: slot.id,
                    initialEndSlotId: slot.id,
                    initialAction: slot.action,
                };
                this._dialogOpen = true;
                break;
            }
            case "edit-interval":
            case "edit-range":
                this._dialogState = {
                    mode: event.detail.mode,
                    intervalId: interval.id,
                    intervalLabel: interval.timeRangeLabel,
                    slots: interval.slots,
                    initialStartSlotId: interval.startSlotId,
                    initialEndSlotId: interval.endSlotId,
                    initialAction: interval.action,
                };
                this._dialogOpen = true;
                break;
            case "reset-interval":
            case "reset-range":
                this._dialogState = {
                    mode: event.detail.mode,
                    intervalId: interval.id,
                    intervalLabel: interval.timeRangeLabel,
                    slots: interval.slots,
                    initialStartSlotId: interval.startSlotId,
                    initialEndSlotId: interval.endSlotId,
                    initialAction: { kind: "normal" },
                };
                this._dialogOpen = true;
                break;
        }
    }

    private _handleDialogClosed(event: Event): void {
        event.stopPropagation();
        this._dialogOpen = false;
        this._dialogState = null;
    }

    private async _handleDialogSubmit(event: CustomEvent<ScheduleDialogResult>): Promise<void> {
        event.stopPropagation();
        if (!this._dialogState) {
            return;
        }

        let patches;
        try {
            patches = buildScheduleSlotPatches({
                slots: this._dialogState.slots,
                result: event.detail,
            });
        } catch (error) {
            console.error("helman-scheduling: failed to build schedule patches", error);
            return;
        }

        this._dialogOpen = false;
        if (patches.length === 0) {
            return;
        }

        await this._scheduleOwner?.applySchedulePatches(patches);
    }

    private _findInterval(intervalId: string) {
        for (const section of this._daySections) {
            const interval = section.rows.find((row) => row.id === intervalId);
            if (interval) {
                return interval;
            }
        }

        return null;
    }

    private _resetScheduleState(): void {
        this._ownerSnapshot = EMPTY_SCHEDULE_OWNER_SNAPSHOT;
        this._normalizedSchedule = EMPTY_NORMALIZED_SCHEDULE;
        this._daySections = [];
        this._expandedIntervalIds = [];
        this._dialogOpen = false;
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
        this._ownerSnapshot = snapshot;
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
