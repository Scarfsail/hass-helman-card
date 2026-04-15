import { LitElement, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing } from "lit-html";
import type { LocalizeFunction } from "../../localize/localize";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

export interface ScheduleTakeoverDecisionSelectDetail {
    enabled: boolean;
}

@customElement("scheduling-takeover-decision")
export class SchedulingTakeoverDecision extends LitElement {
    static styles = [schedulingSharedStyles];

    @property({ attribute: false }) public localize?: LocalizeFunction;
    @property({ type: Boolean }) public manualTakeover = false;
    @property({ type: String }) public groupName = "";

    render() {
        if (!this.localize) {
            return nothing;
        }

        return html`
            <div class="decision-row" role="radiogroup" aria-label=${this.localize("scheduling.dialog.replace_with_manual_action")}>
                <label class="compact-action-option">
                    <input
                        class="sr-only"
                        type="radio"
                        name=${this.groupName}
                        .checked=${!this.manualTakeover}
                        @change=${(event: Event) => this._handleSelect(false, event)}
                    />
                    <span class=${`decision-button${this.manualTakeover ? "" : " selected"}`}>
                        ${this.localize("scheduling.dialog.keep_existing")}
                    </span>
                </label>
                <label class="compact-action-option">
                    <input
                        class="sr-only"
                        type="radio"
                        name=${this.groupName}
                        .checked=${this.manualTakeover}
                        @change=${(event: Event) => this._handleSelect(true, event)}
                    />
                    <span class=${`decision-button${this.manualTakeover ? " selected" : ""}`}>
                        ${this.localize("scheduling.dialog.replace_with_manual_action")}
                    </span>
                </label>
            </div>
        `;
    }

    private _handleSelect(enabled: boolean, event: Event): void {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent("schedule-takeover-select", {
            bubbles: true,
            composed: true,
            detail: { enabled } satisfies ScheduleTakeoverDecisionSelectDetail,
        }));
    }
}
