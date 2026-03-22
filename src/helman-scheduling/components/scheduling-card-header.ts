import { LitElement, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import type { LocalizeFunction } from "../../localize/localize";
import { schedulingSharedStyles } from "../styles/scheduling-shared-styles";

@customElement("scheduling-card-header")
export class SchedulingCardHeader extends LitElement {
    static styles = [
        schedulingSharedStyles,
        css`
            .header-row {
                display: flex;
                flex-wrap: wrap;
                justify-content: space-between;
                gap: 12px;
                align-items: flex-start;
            }

            .header-copy {
                display: flex;
                flex-direction: column;
                gap: 4px;
                min-width: 0;
            }

            .header-controls {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: flex-end;
                gap: 10px;
            }

            .toggle-control {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                color: var(--secondary-text-color);
                font-size: 0.84rem;
            }
        `,
    ];

    @property({ type: String }) public title = "";
    @property({ type: Boolean }) public executionEnabled = false;
    @property({ type: Boolean }) public loading = false;
    @property({ type: Boolean }) public refreshing = false;
    @property({ type: Boolean }) public togglingExecution = false;
    @property({ attribute: false }) public updatedAt: number | null = null;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ type: String }) public locale = "cs";
    @property({ type: String }) public timeZone = "UTC";

    render() {
        return html`
            <div class="panel">
                <div class="header-row">
                    <div class="header-copy">
                        <div class="panel-title">${this.title}</div>
                        <div class="panel-subtitle">${this._buildStatusLine()}</div>
                    </div>
                    <div class="header-controls">
                        <button
                            class="icon-button"
                            type="button"
                            @click=${this._handleRefresh}
                            ?disabled=${this.loading || this.refreshing || this.togglingExecution}
                            title=${this.localize("scheduling.actions.refresh")}
                        >
                            ↻
                        </button>
                        <label class="toggle-control">
                            <span>${this.localize("scheduling.execution.toggle")}</span>
                            <ha-switch
                                .checked=${this.executionEnabled}
                                ?disabled=${this.loading || this.togglingExecution}
                                @change=${this._handleToggle}
                            ></ha-switch>
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    private _buildStatusLine(): string {
        const parts = [
            this.executionEnabled
                ? this.localize("scheduling.execution.enabled")
                : this.localize("scheduling.execution.disabled"),
        ];

        if (this.refreshing) {
            parts.push(this.localize("scheduling.status.refreshing"));
        } else if (this.updatedAt !== null) {
            parts.push(`${this.localize("scheduling.status.updated")} ${this._formatUpdatedAt(this.updatedAt)}`);
        }

        return parts.join(" · ");
    }

    private _formatUpdatedAt(timestamp: number): string {
        return new Intl.DateTimeFormat(this.locale, {
            timeZone: this.timeZone,
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(timestamp));
    }

    private _handleRefresh(): void {
        this.dispatchEvent(new CustomEvent("refresh-schedule", {
            bubbles: true,
            composed: true,
        }));
    }

    private _handleToggle(event: Event): void {
        const target = event.currentTarget as { checked: boolean };
        this.dispatchEvent(new CustomEvent("toggle-schedule-execution", {
            bubbles: true,
            composed: true,
            detail: { enabled: target.checked },
        }));
    }
}
