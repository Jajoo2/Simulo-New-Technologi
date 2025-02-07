import type SimuloClientPlugin from "../../SimuloClientPlugin";
import type SimuloClientController from "../../SimuloClientController";
import type PhysicsSandboxPlayer from "../../../../shared/src/plugins/SimuloPhysicsSandboxServerPlugin/PhysicsSandboxPlayer";
import SimuloViewerPIXI from "../../SimuloViewerPIXI";
import type WorldUpdate from "../../../../shared/src/plugins/SimuloPhysicsSandboxServerPlugin/WorldUpdate";

/** This will manage tools and UI for Physics Sandbox client-side */

export default class SimuloPhysicsSandboxClientPlugin implements SimuloClientPlugin {
    name = "Simulo Physics Sandbox Client Plugin";
    description = "The client-side plugin for the Physics Sandbox game";
    version = "0.1.0";
    author = "Carroted";
    namespace = "carroted";
    id = "simulo-physics-sandbox-client-plugin";
    dependencies = [];
    controller: SimuloClientController;
    viewer: SimuloViewerPIXI;

    cachedImages: { [url: string]: any } = {}; // can store string for svg for example, or something else for rasters

    async fetchSVG(url: string) {
        if (this.cachedImages[url]) return this.cachedImages[url];
        this.cachedImages[url] = await (await fetch(url)).text();
        return this.cachedImages[url];
    }

    /** Generate a recolored SVG cursor and apply it on the document body. */
    async setColorCursor(image: string, fillColor: string, borderColor?: string) { // in the future, we will have way more kinds of cursors. anyone will be able to create a recolorable cursor
        // the cursor is an svg with some colors to replace to create a custom cursor

        // fetch the svg
        let cursorSVG = await this.fetchSVG(image);

        // if you open that texture you'll see that it's in red and blue
        // by replacing the colors we can change the cursor colors to anything at runtime
        cursorSVG = cursorSVG.replace(/#ff0000/g, fillColor);
        if (!borderColor) {
            cursorSVG = cursorSVG.replace(/#0000ff/g, fillColor === '#000000' ? '#ffffff' : '#000000');
        }
        else {
            cursorSVG = cursorSVG.replace(/#0000ff/g, borderColor);
        }

        // create a data url from the svg
        let cursorDataURL = 'data:image/svg+xml;base64,' + btoa(cursorSVG);

        // set body cursor
        document.body.style.setProperty('cursor', `url("${cursorDataURL}") 6 2, auto`, 'important');
    }

    utilityBar: HTMLDivElement;
    toolBar: HTMLDivElement;

    constructor(controller: SimuloClientController) {
        this.controller = controller;
        this.viewer = new SimuloViewerPIXI();

        // listen to viewer events and emit them to the server in Physics Sandbox format

        this.viewer.on('pointerdown', (e: { point: { x: number, y: number }, event: any }) => {
            if (e.event.button === 0) {
                this.controller.emit('player_down', e.point);
            }
        });
        this.viewer.on('pointermove', (e: { point: { x: number, y: number }, event: any }) => {
            this.controller.emit('player_move', e.point);
        });
        this.viewer.on('pointerup', (e: { point: { x: number, y: number }, event: any }) => {
            if (e.event.button === 0) {
                this.controller.emit('player_up', e.point);
            }
        });

        let renderLoop = () => {
            this.viewer.render();
            requestAnimationFrame(renderLoop);
        }
        requestAnimationFrame(renderLoop);

        this.setColorCursor('./assets/textures/cursor_new.svg', '#000000');

        let utilityBar = document.createElement('div');
        utilityBar.className = 'bar utilities';
        utilityBar.style.display = 'none';
        utilityBar.innerHTML = 'coming soon (real)';
        this.utilityBar = document.body.appendChild(utilityBar);

        let toolBar = document.createElement('div');
        toolBar.className = 'bar tools';
        toolBar.style.display = 'none';
        this.toolBar = document.body.appendChild(toolBar);
    }

    destroy(): void { } // for now, nothing in destroy. in the future, this should properly dispose of everything cleanly

    toolElements: { [id: string]: HTMLDivElement } = {};

    async updateToolBar(tools: {
        name: string,
        icon: string,
        description: string,
        id: string
    }[], toolID: string) {
        this.utilityBar.style.display = 'flex';
        this.toolBar.style.display = 'flex';
        this.toolBar.innerHTML = '';
        this.toolElements = {};
        for (let tool of tools) {
            const toolElement = document.createElement('div');
            toolElement.className = toolID === tool.id ? 'tool active' : 'tool';
            toolElement.innerHTML = await this.fetchSVG(tool.icon);
            toolElement.addEventListener('click', (e) => {
                this.controller.emit('player_tool', tool.id);
            });
            const toolElementLine = document.createElement('div');
            toolElementLine.className = 'line';
            toolElement.appendChild(toolElementLine);
            this.toolElements[tool.id] = this.toolBar.appendChild(toolElement);
        }
    }

    handleIncomingEvent(event: string, data: any): void {
        if (event === 'world_update') {
            // the world has updated, let's update the viewer with the new data
            let worldUpdate = data as WorldUpdate;
            this.viewer.update(worldUpdate);
        }
        if (event === 'tools') {
            let tools = data.tools as {
                name: string,
                icon: string,
                description: string,
                id: string
            }[];
            let tool = data.tool as string;
            this.updateToolBar(tools, tool);
        }
        if (event === 'player_tool_success') {
            // reset all tools
            Object.keys(this.toolElements).forEach(tool => {
                if (data !== tool) {
                    this.toolElements[tool].classList.remove('active');
                }
                else {
                    this.toolElements[tool].classList.add('active');
                }
            });
        }
    }
    handleOutgoingEvent(event: string, data: any): void { } // nothing here
}