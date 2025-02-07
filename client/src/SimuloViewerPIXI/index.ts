import * as PIXI from "pixi.js";
import { OutlineFilter } from '@pixi/filter-outline';
import { Viewport } from "pixi-viewport";
import type { Circle, Polygon, Rectangle, ShapeContentData, ShapeTransformData } from "../../../shared/src/SimuloPhysicsServerRapier";
import type WorldUpdate from "../../../shared/src/plugins/SimuloPhysicsSandboxServerPlugin/WorldUpdate";

PIXI.curves.adaptive = false;

/** Renderer in PIXI.js for Simulo. You can add shapes with `addShape`, and update their positions with `update`. */

export default class SimuloViewerPIXI {
    coll2gfx: Map<string, PIXI.Graphics>;
    renderer: PIXI.Renderer;
    scene: PIXI.Container;
    viewport: Viewport;
    canvas: HTMLCanvasElement;

    /** Can pan the camera with keys like HJKL, or, for mere mortals, arrow keys */
    panInputs: {
        up: boolean;
        left: boolean;
        down: boolean;
        right: boolean;
    } = {
            up: false,
            left: false,
            down: false,
            right: false,
        };

    listeners: { [event: string]: ((data: any) => void)[] } = {};
    on(event: string, callback: (data: any) => void) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }
    off(event: string, callback: (data: any) => void) {
        if (!this.listeners[event]) return;
        this.listeners[event].splice(this.listeners[event].indexOf(callback), 1);
    }

    /** Previous mouse position from `e.globalX` and `Y`, not world space */
    previousMousePos: { x: number, y: number } = { x: 0, y: 0 };

    updateMouse(eventName: string, position?: { x: number, y: number }, e?: MouseEvent) {
        if (position) {
            this.previousMousePos = { x: position.x, y: position.y }; // clone, not reference
            if (this.listeners[eventName]) {
                let point = this.viewport.toWorld(position.x, position.y);
                this.listeners[eventName].forEach((callback) => callback({
                    event: e ?? null,
                    point: { x: point.x, y: -point.y },
                }));
            }
        }
        else {
            if (this.listeners[eventName]) {
                // use previous mouse position
                let point = this.viewport.toWorld(this.previousMousePos.x, this.previousMousePos.y);
                this.listeners[eventName].forEach((callback) => callback({
                    event: e ?? null,
                    point: { x: point.x, y: -point.y },
                }));
            }
        }
    }

    constructor() {
        // high pixel ratio makes the rendering extremely slow, so we cap it
        const pixelRatio = window.devicePixelRatio ? Math.min(window.devicePixelRatio, 1.5) : 1;

        this.coll2gfx = new Map();
        this.renderer = new PIXI.Renderer({
            backgroundAlpha: 0,
            antialias: true,
            resolution: pixelRatio,
            width: window.innerWidth,
            height: window.innerHeight,
        });

        this.scene = new PIXI.Container();

        // add to document
        this.canvas = document.body.appendChild(this.renderer.view as HTMLCanvasElement);

        this.viewport = new Viewport({
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight,
            events: this.renderer.events,
        });

        this.scene.addChild(this.viewport as any);
        this.viewport.drag({
            mouseButtons: "middle-right", // left click is used for tools
        }).pinch().wheel().decelerate();

        this.viewport.on("pointermove", (e) => {
            this.updateMouse("pointermove", { x: e.globalX, y: e.globalY }, e);
        });
        this.viewport.on("pointerdown", (e) => {
            this.updateMouse("pointerdown", { x: e.globalX, y: e.globalY }, e);
        });
        this.viewport.on("pointerup", (e) => {
            this.updateMouse("pointerup", { x: e.globalX, y: e.globalY }, e);
        });

        this.canvas.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'h') {
                this.panInputs.left = true;
            }
            if (e.key === 'j') {
                this.panInputs.down = true;
            }
            if (e.key === 'k') {
                this.panInputs.up = true;
            }
            if (e.key === 'l') {
                this.panInputs.right = true;
            }
        });

        this.canvas.addEventListener('keyup', (e: KeyboardEvent) => {
            if (e.key === 'h') {
                this.panInputs.left = false;
            }
            if (e.key === 'j') {
                this.panInputs.down = false;
            }
            if (e.key === 'k') {
                this.panInputs.up = false;
            }
            if (e.key === 'l') {
                this.panInputs.right = false;
            }
        });

        setInterval(() => {
            let x = 0;
            let y = 0;
            let speed = 2 / this.viewport.scale.y;
            if (this.panInputs.left) {
                x = -1;
            }
            if (this.panInputs.down) {
                y = 1;
            }
            if (this.panInputs.up) {
                y = -1;
            }
            if (this.panInputs.right) {
                x = 1;
            }
            if (x !== 0 || y !== 0) {
                x *= speed;
                y *= speed;
                this.viewport.moveCenter(this.viewport.center.x + x, this.viewport.center.y + y);
            }
            this.updateMouse("pointermove");
        }, 10);

        let me = this;

        function onWindowResize() {
            me.renderer.resize(window.innerWidth, window.innerHeight);
            me.viewport.resize(window.innerWidth, window.innerHeight);
        }

        function onContextMenu(event: UIEvent) {
            event.preventDefault();
        }

        document.oncontextmenu = onContextMenu;
        document.body.oncontextmenu = onContextMenu;

        window.addEventListener("resize", onWindowResize, false);

        // starting position
        this.lookAt({
            target: { x: -10.0, y: -30.0 },
            zoom: 7.0,
        });
    }

    /** Graphics that are cleared and redrawn each frame, as they are expected to change every frame. */
    tempGFXs: PIXI.Graphics[] = []

    update(worldUpdate: WorldUpdate) {
        for (let key in worldUpdate.delta.shapeContent) {
            let content = worldUpdate.delta.shapeContent[key];
            this.addShape(content);
        }
        if (Object.keys(worldUpdate.delta.shapeContent).length > 0) console.log('registered ' + Object.keys(worldUpdate.delta.shapeContent).length + ' shapes')
        this.updatePositions(worldUpdate.delta.shapeTransforms);
        // draw a line for each spring, will soon support images
        this.tempGFXs.forEach((gfx) => {
            this.viewport.removeChild(gfx)
        });
        this.tempGFXs = []
        worldUpdate.springs.forEach((spring) => {
            let gfx = new PIXI.Graphics();
            gfx.lineStyle(3 / this.viewport.scale.y, '#ffffff')
                .moveTo(spring.pointA.x, -spring.pointA.y)
                .lineTo(spring.pointB.x, -spring.pointB.y);
            this.tempGFXs.push(gfx)
            this.viewport.addChild(gfx);
        });
        worldUpdate.overlays.shapes.forEach((shape) => {
            let content = shape.content;
            let transform = shape.transform;
            let gfx = this.renderShape(content);
            gfx.position.x = transform.x;
            gfx.position.y = -transform.y;
            gfx.rotation = -transform.angle;
            this.tempGFXs.push(gfx);
            this.viewport.addChild(gfx);
        });
        worldUpdate.overlays.texts.forEach((text) => {
            // coming soon lol
        });
    }

    render() {
        this.renderer.render(this.scene);
    }

    lookAt(pos: { zoom: number; target: { x: number; y: number } }) {
        this.viewport.setZoom(pos.zoom);
        this.viewport.moveCenter(pos.target.x, pos.target.y);
    }

    updatePositions(transformData: { [id: string]: ShapeTransformData }) {
        Object.keys(transformData).forEach((id) => {
            let gfx = this.coll2gfx.get(id);
            let data = transformData[id];
            let position = { x: data.x, y: data.y };
            let angle = data.angle;

            if (!!gfx) {
                gfx.position.x = position.x;
                gfx.position.y = -position.y;
                gfx.rotation = -angle;
            }
        });
    }

    reset() {
        this.coll2gfx.forEach((gfx) => {
            this.viewport.removeChild(gfx);
            gfx.destroy();
        });
        this.coll2gfx = new Map();
    }

    renderShape(content: ShapeContentData) {
        let gfx = new PIXI.Graphics();
        if (content.border !== null) {
            gfx.lineStyle(1, content.border, 0.5, 0, true);
        }
        gfx.alpha = content.alpha;
        switch (content.type) {
            case "rectangle":
                let rectangle = content as Rectangle;

                /*gfx.scale.x = rectangle.width;
                gfx.scale.y = rectangle.height;
                gfx.beginFill(rectangle.color, 0xff);
                gfx.drawRect(-1, 1, 2, -2);
                gfx.endFill();*/

                // polygon instead since for some reason it doesnt render the rectangle, will try to fix later but for now this works
                gfx.beginFill(rectangle.color);
                gfx.moveTo(-rectangle.width / 2, rectangle.height / 2);
                gfx.lineTo(rectangle.width / 2, rectangle.height / 2);
                gfx.lineTo(rectangle.width / 2, -rectangle.height / 2);
                gfx.lineTo(-rectangle.width / 2, -rectangle.height / 2);
                gfx.lineTo(-rectangle.width / 2, rectangle.height / 2);
                gfx.endFill();
                break;
            case "circle":
                let circle = content as Circle;

                gfx.beginFill(circle.color);
                //gfx.drawCircle(0, 0, 1);
                // arc manually, we will use startAngle and whatnot
                /*let segments = 4;
                let size = 2 * Math.PI / segments;
                for (let i = 0; i < segments; i++) {
                    gfx.moveTo(0, 0);
                    gfx.arc(0, 0, circle.radius, size * i, size * (i + 1));
                }*/
                //gfx.drawCircle(0, 0, circle.radius);

                // no arc
                let segments = 50;
                let size = 2 * Math.PI / segments;
                // start at top
                gfx.moveTo(0, circle.radius);
                for (let i = 0; i < segments; i++) {
                    gfx.lineTo(Math.sin(size * i) * circle.radius, Math.cos(size * i) * circle.radius);
                }
                gfx.lineTo(0, circle.radius);

                gfx.endFill();

                // "circle cake", 15deg dark slice
                gfx.lineStyle(0);
                gfx.beginFill(0x000000, 0.5);
                gfx.moveTo(0, 0);
                gfx.arc(0, 0, circle.radius, -Math.PI / 16, Math.PI / 16);
                gfx.lineTo(0, 0);
                gfx.endFill();
                break;
            case "polygon":
                let polygon = content as Polygon;
                gfx.beginFill(polygon.color);
                gfx.moveTo(polygon.points[0][0], -polygon.points[0][1]);
                for (let i = 1; i < polygon.points.length; i++) {
                    gfx.lineTo(polygon.points[i][0], -polygon.points[i][1]);
                }
                gfx.lineTo(polygon.points[0][0], -polygon.points[0][1]);
                gfx.endFill();
                break;
            default:
                console.error("Unknown shape type: " + content.type);
                break;
        }

        return gfx;
    }

    addShape(content: ShapeContentData) {
        if (this.coll2gfx.has(content.id)) {
            // remove it so we dont get ghost shapes
            let gfx = this.coll2gfx.get(content.id);
            if (gfx) {
                this.viewport.removeChild(gfx);
            }
        }

        let gfx = this.renderShape(content);

        this.coll2gfx.set(content.id, gfx);
        this.viewport.addChild(gfx);
    }
}