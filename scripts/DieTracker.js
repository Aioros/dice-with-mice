import { PhysicsWorkerWithPromise } from "../lib/PhysicsWorkerWithPromise.js";
import { methods } from "./methods.js";

export class DieTracker extends HTMLElement {

    static observedAttributes = ["quaternion", "result"];

    #box;
    #mesh;
    #animationQuaternions;
    #rollWaitingTicker;
    #rollTicker;
    #sfxTicker;

    constructor() {
        super();
        this._internals = this.attachInternals();
    }

    async connectedCallback() {
        //console.log("Custom element added to page.");
        const shadow = this.attachShadow({ mode: "open" });
        const mainDiv = document.createElement("div");
        mainDiv.id = "main";
        shadow.appendChild(mainDiv);

        const stylesheet = new CSSStyleSheet();
        stylesheet.replaceSync(`
            #main {
                width: 100%;
                height: 100%;
            }
        `);
        this.shadowRoot.adoptedStyleSheets = [stylesheet];
        
        const DiceBox = game.dice3d.box.constructor;

        const boxConfig = foundry.utils.mergeObject(
            game.dice3d.constructor.ALL_CONFIG(),
            { dimensions: { w: mainDiv.clientWidth, h: mainDiv.clientHeight }, boxType: `tracker-${this.dataset.userId}-${this.dataset.dieId}` } // Unique boxType ensures that we have different renderers
        );
        const box = new DiceBox(mainDiv, game.dice3d.DiceFactory, boxConfig);
        this.#box = box;

        box.physicsWorker = new PhysicsWorkerWithPromise({stub: true}); // DiceBox.animateThrow will try to call it

        await box.initialize();

        const dsnConfig = game.dice3d.constructor.ALL_CUSTOMIZATION(game.users.get(this.dataset.userId), game.dice3d.DiceFactory);
        const options = JSON.parse(this.dataset.options);
        const notation = {options, type: this.dataset.type};
        const appearance = box.dicefactory.getAppearanceForDice(dsnConfig.appearance, this.dataset.type, notation);
		const dicemesh = await box.dicefactory.create(box.renderer.scopedTextureCache, this.dataset.type, appearance);
        this.#mesh = dicemesh;
        dicemesh.scale.set(
            Math.min(dicemesh.scale.x * 5, dicemesh.scale.x * 2),
            Math.min(dicemesh.scale.y * 5, dicemesh.scale.y * 2),
            Math.min(dicemesh.scale.z * 5, dicemesh.scale.z * 2)
        );
        dicemesh.position.set(0, 0, 50);
        dicemesh.castShadow = box.dicefactory.shadows;
        dicemesh.notation = notation;
        dicemesh.userData = this.dataset.type;
        dicemesh.options = options;

        box.diceList.push(dicemesh);

        const Vector3 = box.camera.position.constructor;

        box.camera.position.z = box.cameraHeight.far;
        box.camera.position.x = box.display.containerWidth / 2 - (box.display.containerWidth / 2);
        box.camera.position.y = -box.display.containerHeight / 2 + (box.display.containerHeight / 2);
        box.camera.fov = (300 / box.display.containerWidth) * 2 * Math.atan(box.display.containerHeight / (2 * box.camera.position.z)) * (180 / Math.PI);
        
        // We rotate the camera slightly. I prefer a perfect top view, but a d4 is very hard to read like that
        box.camera.position.applyAxisAngle(new Vector3(1, 0, 0), Math.PI / 10);
        
        box.scene.remove(box.light);
        box.light_amb.intensity = 4;
        box.light_amb.position.copy(new Vector3(0, -1, 0));
		
        box.camera.lookAt(dicemesh.position);
		box.camera.updateProjectionMatrix();
        box.last_time = window.performance.now();
		box.framerate = 1 / 60;

        box.scene.add(dicemesh);

        box.isVisible = true;
        box.renderScene();

        this.#rollWaitingTicker = new PIXI.Ticker();
        this.#rollTicker = new PIXI.Ticker();
        this.#sfxTicker = new PIXI.Ticker();

        // Start waiting animation
        this.last_time = window.performance.now();
        this.#rollWaitingTicker.add(this.animateWaiting, this);
        this.#rollWaitingTicker.start();
    }

    disconnectedCallback() {
        //console.log("Custom element removed from page.");
        this.#rollTicker.destroy;
        this.#sfxTicker.destroy;
    }

    connectedMoveCallback() {
        console.log("Custom element moved with moveBefore()");
    }

    adoptedCallback() {
        console.log("Custom element moved to new page.");
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (this.#mesh && name === "quaternion") {
            const Quaternion = this.#mesh.quaternion.constructor;
            const targetQuaternion = new Quaternion(...JSON.parse(newValue));
            this.#animationQuaternions = {start: this.#mesh.quaternion, end: targetQuaternion};
            this.last_time = null;
            if (this.#rollWaitingTicker.started) {
                this.#rollWaitingTicker.destroy();
            }
            if (!this.#rollTicker.started) {
                this.#rollTicker.add(this.animate, this);
                this.#rollTicker.start();
            }
        }
        if (this.#mesh && name === "result") {
            this.#mesh.result = newValue;
            methods.diceBox.assignSpecialEffects.call(this.#box);
            this.#sfxTicker.add(this.#box.animateThrow, this.#box); // Only needed for the SFX queue handling
            this.#sfxTicker.start();
            this.#box.handleSpecialEffectsInit().then(() => {
                this._internals.states.add("complete");
                this.dispatchEvent(new CustomEvent("dieCompleted", { bubbles: true, composed: true }));
            });
        }
    }

    animate() {
        let duration = 100;
        let time = Date.now();

		this.last_time = this.last_time || time - (this.#box.framerate * 1000);
		let time_diff = (time - this.last_time);
        const t = Math.min(time_diff / duration, 1);
        
        this.#mesh.quaternion.slerpQuaternions(this.#animationQuaternions.start, this.#animationQuaternions.end, t);
        
        this.#box.renderScene();

        if (Math.abs(t - 1) < 0.001) {
            this.#rollTicker.destroy();
        }
    }

    animateWaiting() {
		let now = window.performance.now();
		let elapsed = now - this.last_time;
		if (elapsed > this.#box.framerate) {
			this.last_time = now - (elapsed % this.#box.framerate);
            let angle_change = 0.005 * Math.PI;
            this.#mesh.rotation.y += angle_change;
            this.#mesh.rotation.x += angle_change / 4;
            this.#mesh.rotation.z += angle_change / 10;
			this.#box.renderScene();
		}
	}

}