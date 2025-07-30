import { LitElement, TemplateResult, css, html } from "lit-element";
import { customElement, property } from "lit/decorators.js";
import { keyed } from 'lit/directives/keyed.js';
import type { HomeAssistant } from "../hass-frontend/src/types";
import { sortDevicesByPowerAndName } from "./energy-data-helper";
import { DeviceNode } from "./DeviceNode";
import "./power-device";

@customElement("power-devices-container")
export class PowerDevicesContainer extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public devices!: DeviceNode[];
    @property({ type: Number }) public currentParentPower?: number;
    @property({ attribute: false }) public parentPowerHistory?: number[];
    @property({ type: Number }) public historyBuckets!: number;
    @property({ type: Number }) public historyBucketDuration!: number;
    @property({ type: Boolean }) public devices_full_width?: boolean;
    @property({ type: Boolean }) public sortChildrenByPower?: boolean;
    @property({ type: Number }) public show_only_top_children?: number;

    static get styles() {
        return css`
            .container {
                flex-basis: 100%;
                gap: 5px; /* Optional: adds some space between children */
                display: flex;
                align-items: stretch
            }
            .container.full-width {
                display: flex;
                flex-wrap: wrap;
                flex-direction:column;
                gap: 5px;
            }
            .container.full-width > power-device {
                flex-grow: 1;
                flex-basis: 0;
                min-width: 150px; /* Optional: prevent children from becoming too small */
            }
        `;
    }

    render(): TemplateResult {
        let devicesToRender = this.sortChildrenByPower ? sortDevicesByPowerAndName(this.devices) : this.devices;
        if (this.show_only_top_children && this.show_only_top_children > 0) {
            devicesToRender = devicesToRender.slice(0, this.show_only_top_children);
        }
        return html`
            <div class="container ${this.devices_full_width ? 'full-width' : ''}">
                ${devicesToRender.map((device) => keyed(device.id, html`
                    <power-device
                        .hass=${this.hass}
                        .device=${device}
                        .currentParentPower=${this.currentParentPower}
                        .parentPowerHistory=${this.parentPowerHistory}
                        .historyBuckets=${this.historyBuckets}
                        .historyBucketDuration=${this.historyBucketDuration}
                    ></power-device>
                `))}
            </div>
        `;
    }
}
