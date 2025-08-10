import { LitElement, css, html } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { DeviceNode } from "./DeviceNode";
import "./power-device-labels-filter";
import "./power-devices-container";

@customElement("power-house-devices-section")
export class PowerHouseDevicesSection extends LitElement {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public devices: DeviceNode[] = [];
    @property({ type: Number }) public historyBuckets!: number;
    @property({ type: Number }) public historyBucketDuration!: number;
    @property({ type: Number }) public currentParentPower?: number;
    @property({ attribute: false }) public parentPowerHistory?: number[];

    // Display options passthrough
    @property({ type: Boolean }) public devices_full_width: boolean = true;
    @property({ type: Boolean }) public sortChildrenByPower: boolean = true;
    @property({ type: Number }) public initial_show_only_top_children: number = 3;

    @state() private _activeLabelTextFilters: string[] = [];
    @state() private _showAll: boolean = false;

    static get styles() {
        return css`
            .filters-row {
                margin-top: 0px;
            }
            .toggle-row {
                text-align: center;
                cursor: pointer;
            }
        `;
    }

    private _onToggleLabelFilter(e: CustomEvent<{ label: string }>) {
        const label = e.detail.label;
        const idx = this._activeLabelTextFilters.indexOf(label);
        if (idx >= 0) {
            this._activeLabelTextFilters = [
                ...this._activeLabelTextFilters.slice(0, idx),
                ...this._activeLabelTextFilters.slice(idx + 1)
            ];
        } else {
            this._activeLabelTextFilters = [...this._activeLabelTextFilters, label];
        }
    }

    private _getAvailableLabels(): string[] {
        return Array.from(new Set(
            (this.devices || []).flatMap((d) => d.customLabelTexts || [])
        )).sort((a, b) => a.localeCompare(b));
    }

    private _filterDevices(devices: DeviceNode[]): DeviceNode[] {
        if (!devices) return [];
        if (this._activeLabelTextFilters.length === 0) return devices;
        return devices.filter((d) => {
            const labels = new Set(d.customLabelTexts || []);
            return this._activeLabelTextFilters.every((l) => labels.has(l));
        });
    }

    render() {
        const availableLabels = this._getAvailableLabels();
        const filtered = this._filterDevices(this.devices);
        const showTop = this._showAll ? 0 : this.initial_show_only_top_children;

        return html`
            ${availableLabels.length > 0 ? html`
                <div class="filters-row">
                    <power-device-labels-filter
                        .labels=${availableLabels}
                        .active=${this._activeLabelTextFilters}
                        @label-filter-toggle=${(e: CustomEvent) => this._onToggleLabelFilter(e)}
                    ></power-device-labels-filter>
                </div>
            ` : html``}

            <power-devices-container
                .hass=${this.hass}
                .devices=${filtered}
                .historyBuckets=${this.historyBuckets}
                .historyBucketDuration=${this.historyBucketDuration}
                .currentParentPower=${this.currentParentPower}
                .parentPowerHistory=${this.parentPowerHistory}
                .devices_full_width=${this.devices_full_width}
                .sortChildrenByPower=${this.sortChildrenByPower}
                .show_only_top_children=${showTop}
            ></power-devices-container>

            <div class="toggle-row" @click=${() => { this._showAll = !this._showAll; }}>...</div>
        `;
    }
}
