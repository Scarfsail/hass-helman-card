import { LitElement, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { nothing, TemplateResult } from "lit-html";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LocalizeFunction } from "../localize/localize";
import type { NodeDetailParams } from "./node-detail/node-detail-types";
import "./node-detail/node-detail-battery-content";
import "./node-detail/node-detail-solar-content";
import "./node-detail/node-detail-grid-content";
import "./node-detail/node-detail-house-content";

@customElement("node-detail-dialog")
export class NodeDetailDialog extends LitElement {

    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public localize!: LocalizeFunction;
    @property({ attribute: false }) public params!: NodeDetailParams;
    @property({ type: Boolean }) public open = false;

    render() {
        if (!this.open || !this.params) return nothing;

        const title = this._title();
        return html`
            <ha-dialog
                .open=${this.open}
                @closed=${this._onClosed}
                .heading=${title}
                .headerTitle=${title}
            >
                ${this._renderContent()}
                <mwc-button slot="primaryAction" @click=${this._close}>
                    ${this.localize("node_detail.close")}
                </mwc-button>
            </ha-dialog>
        `;
    }

    private _title(): string {
        return this.localize(`node_detail.title.${this.params.nodeType}`);
    }

    private _renderContent(): TemplateResult {
        switch (this.params.nodeType) {
            case "battery":
                return html`
                    <node-detail-battery-content
                        .hass=${this.hass}
                        .localize=${this.localize}
                        .params=${this.params}
                    ></node-detail-battery-content>
                `;
            case "solar":
                return html`
                    <node-detail-solar-content
                        .hass=${this.hass}
                        .localize=${this.localize}
                        .params=${this.params}
                    ></node-detail-solar-content>
                `;
            case "grid":
                return html`
                    <node-detail-grid-content
                        .hass=${this.hass}
                        .localize=${this.localize}
                        .params=${this.params}
                    ></node-detail-grid-content>
                `;
            case "house":
                return html`
                    <node-detail-house-content
                        .hass=${this.hass}
                        .localize=${this.localize}
                        .params=${this.params}
                    ></node-detail-house-content>
                `;
        }
    }

    private _close() {
        (this.shadowRoot?.querySelector("ha-dialog") as any)?.close();
    }

    private _onClosed() {
        this.dispatchEvent(new CustomEvent("closed", { bubbles: true, composed: true }));
    }
}
