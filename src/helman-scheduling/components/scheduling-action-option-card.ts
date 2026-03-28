import { LitElement, css, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import { getScheduleActionPresentation } from "../model/schedule-action-presentation";
import type { ScheduleAction } from "../schedule-types";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";
import "./scheduling-action-chip";

export interface ScheduleActionOptionSelectDetail {
    actionKind: ScheduleAction["kind"];
}

@customElement("scheduling-action-option-card")
export class SchedulingActionOptionCard extends LitElement {
    static styles = [
        schedulingSharedStyles,
        css`
            :host {
                display: block;
            }

            .action-option-card {
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding: 12px;
                border: 1px solid var(--divider-color);
                border-radius: 12px;
                background: var(--card-background-color);
                cursor: pointer;
                transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
            }

            .action-option-card:hover {
                border-color: color-mix(in srgb, var(--schedule-action-tone-accent, var(--primary-color)) 40%, var(--divider-color));
            }

            .action-option-card.selected {
                border-color: var(--schedule-action-tone-accent, var(--primary-color));
                background: color-mix(in srgb, var(--schedule-action-tone-accent, var(--primary-color)) 10%, var(--card-background-color));
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--schedule-action-tone-accent, var(--primary-color)) 18%, transparent);
            }

            .action-option-card:focus-within {
                outline: 2px solid var(--primary-color);
                outline-offset: 2px;
            }

            .action-option-header {
                display: flex;
                align-items: flex-start;
                gap: 10px;
            }

            .action-option-radio {
                flex-shrink: 0;
                margin-top: 2px;
            }

            .action-option-copy {
                display: flex;
                min-width: 0;
                flex: 1;
            }

            .action-option-detail {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding-left: 28px;
            }

            .action-option-detail[hidden] {
                display: none;
            }

            ::slotted(.target-field) {
                width: min(180px, 100%);
            }

            @media (max-width: 600px) {
                .action-option-detail {
                    padding-left: 0;
                }
            }
        `,
    ];

    @property({ attribute: false }) public action?: ScheduleAction;
    @property({ attribute: false }) public localize?: LocalizeFunction;
    @property({ type: Boolean }) public checked = false;
    @property({ type: String }) public radioName = "";

    @state() private _hasDetailContent = false;

    render() {
        if (!this.action || !this.localize) {
            return nothing;
        }

        const presentation = getScheduleActionPresentation(this.action, this.localize);
        const classes = `action-option-card ${presentation.toneClass}${this.checked ? " selected" : ""}`;
        return html`
            <div class=${classes} @click=${this._handleCardClick}>
                <label class="action-option-header">
                    <input
                        class="action-option-radio"
                        type="radio"
                        name=${this.radioName}
                        .checked=${this.checked}
                        value=${this.action.kind}
                        @change=${this._handleRadioChange}
                    />
                    <div class="action-option-copy">
                        <scheduling-action-chip .action=${this.action} .localize=${this.localize}></scheduling-action-chip>
                    </div>
                </label>
                <div class="action-option-detail" ?hidden=${!this._hasDetailContent} @click=${this._stopPropagation}>
                    <slot @slotchange=${this._handleDetailSlotChange}></slot>
                </div>
            </div>
        `;
    }

    private _handleCardClick(): void {
        this._emitSelect();
    }

    private _handleRadioChange(event: Event): void {
        event.stopPropagation();
        this._emitSelect();
    }

    private _handleDetailSlotChange(event: Event): void {
        const slot = event.target as HTMLSlotElement;
        this._hasDetailContent = slot.assignedElements({ flatten: true }).length > 0;
    }

    private _stopPropagation(event: Event): void {
        event.stopPropagation();
    }

    private _emitSelect(): void {
        if (!this.action) {
            return;
        }

        this.dispatchEvent(new CustomEvent("schedule-action-option-select", {
            bubbles: true,
            composed: true,
            detail: { actionKind: this.action.kind } satisfies ScheduleActionOptionSelectDetail,
        }));
    }
}
