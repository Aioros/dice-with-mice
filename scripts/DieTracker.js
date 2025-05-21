export class DieTracker extends HTMLElement {

    static observedAttributes = ["quaternion"];

    #box;
    #mesh;
    #animationQuaternions;
    #ticker;

    constructor() {
        super();
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

        //console.log(mainDiv.clientWidth, mainDiv.clientHeight);
        const DiceBox = game.dice3d.box.constructor;
        const boxConfig = foundry.utils.mergeObject(
            game.dice3d.constructor.ALL_CONFIG(),
            { dimensions: { w: mainDiv.clientWidth, h: mainDiv.clientHeight }, boxType: "showcase" }
        );
        const box = new DiceBox(mainDiv, game.dice3d.DiceFactory, boxConfig);
        this.#box = box;
        await box.initialize();
        //console.log(box);

        box.camera.position.z = box.cameraHeight.far;
		box.camera.position.x = box.display.containerWidth / 2 - (box.display.containerWidth / 2);
		box.camera.position.y = -box.display.containerHeight / 2 + (box.display.containerHeight / 2);
		box.camera.fov = 4 * 2 * Math.atan(box.display.containerHeight / (2 * box.camera.position.z)) * (180 / Math.PI);
		box.camera.updateProjectionMatrix();
        box.last_time = window.performance.now();
		box.framerate = 1 / 60;

        const dsnConfig = game.dice3d.constructor.ALL_CUSTOMIZATION(game.user, game.dice3d.DiceFactory);
        const appearance = box.dicefactory.getAppearanceForDice(dsnConfig.appearance, this.dataset.type);
		const dicemesh = await box.dicefactory.create(box.renderer.scopedTextureCache, this.dataset.type, appearance);
        this.#mesh = dicemesh;
        dicemesh.scale.set(
            Math.min(dicemesh.scale.x * 5, dicemesh.scale.x * 2),
            Math.min(dicemesh.scale.y * 5, dicemesh.scale.y * 2),
            Math.min(dicemesh.scale.z * 5, dicemesh.scale.z * 2)
        );
        dicemesh.position.set(0, 0, 50);
        dicemesh.castShadow = box.dicefactory.shadows;
        dicemesh.userData = this.dataset.type;
        box.diceList.push(dicemesh);

        box.scene.add(dicemesh);
        box.isVisible = true;
        box.renderScene();

        this.#ticker = new PIXI.Ticker();
    }

    disconnectedCallback() {
        console.log("Custom element removed from page.");
    }

    connectedMoveCallback() {
        console.log("Custom element moved with moveBefore()");
    }

    adoptedCallback() {
        console.log("Custom element moved to new page.");
    }

    attributeChangedCallback(name, oldValue, newValue) {
        //console.log(`Attribute ${name} has changed.`, oldValue, newValue);
        if (this.#mesh && name === "quaternion") {
            const Quaternion = this.#mesh.quaternion.constructor;
            const targetQuaternion = new Quaternion(...JSON.parse(newValue));
            this.#animationQuaternions = {start: this.#mesh.quaternion, end: targetQuaternion};
            this.#ticker.destroy();
            this.last_time = null;
            this.#ticker = new PIXI.Ticker();
            this.#ticker.add(this.animate, this);
            this.#ticker.start();
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
            this.#ticker.destroy();
        }
    }
}