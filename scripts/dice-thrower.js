import { PhysicsWorkerWithPromise } from "./PhysicsWorkerWithPromise.js";

const METHOD = "dsnThrower";

Hooks.on("init", () => {
    CONFIG.Dice.fulfillment.methods[METHOD] = {
        icon: "<i class=\"fa-solid fa-play\"></i>",
        interactive: true,
        label: "DICE.FULFILLMENT.DSNThrower",
        resolver: DSNThrower
    };
});

Hooks.on("diceSoNiceReady", (dice3d) => {
    dice3d.box.physicsWorker.terminate();
    dice3d.box.physicsWorker = DSNThrower._physicsWorker;
    dice3d.DiceFactory.physicsWorker.terminate();
    dice3d.DiceFactory.physicsWorker = DSNThrower._physicsWorker;
    DSNThrower._physicsWorker.exec("init", {
        muteSoundSecretRolls: dice3d.box.muteSoundSecretRolls,
        height: dice3d.box.display.containerHeight,
        width: dice3d.box.display.containerWidth
    });
});

Hooks.on("diceSoNiceMessageProcessed", (chatMessageId, interception) => {
    interception.willTrigger3DRoll = false;
});

class DSNThrower extends foundry.applications.dice.RollResolver {

    static _physicsWorker;
    static {
        this._physicsWorker = new PhysicsWorkerWithPromise({workerUrl: new URL("PhysicsWorker.js", import.meta.url), workerName: "PhysicsWorker"});
        console.log(this._physicsWorker);
    }

    static DEFAULT_OPTIONS = {
        id: "dsn-thrower-{id}",
        tag: "form",
        classes: ["roll-resolver"],
        window: {
            title: "DICE.DSNThrowerRollResolution",//"DICE.RollResolution"
        },
        position: {
            width: 500,
            height: "auto"
        },
        /*form: {
            submitOnChange: false,
            closeOnSubmit: false,
            handler: this._fulfillRoll
        }*/
    };

    get physicsWorker() {
        return this.constructor._physicsWorker;
    }

    get throwable() {
        return [...this.fulfillable.values().filter(f => f.method === METHOD)];
    }

    async awaitFulfillment() {
        console.log("awaitFulfillment");
        const originalPromise = super.awaitFulfillment();

        console.log(this);

        // temporarily here
        //const throwFormula = this.throwable.map(t => t.term.formula).join(" + ");
        //const tempRoll = new CONFIG.Dice.rolls[0](throwFormula);
        //const tempRoll = CONFIG.Dice.rolls[0].fromTerms(this.throwable.map(t => t.term));

        if (this.throwable.length) {
            const plus = new foundry.dice.terms.OperatorTerm({ operator: "+" });
            const dice = this.throwable.map(t => t.term);
            let termList = dice.map((e, i) => i < dice.length - 1 ? [e, plus] : [e]).reduce((a, b) => a.concat(b));
            const tempRoll = CONFIG.Dice.rolls[0].fromTerms(termList);

            // this actually duplicates the results
            const ast = CONFIG.Dice.parser.toAST(tempRoll.terms);
            const resultTemp = await tempRoll._evaluateASTAsync(ast);
            game.dice3d.showForRoll(tempRoll).then(() => {
                tempRoll.dice.forEach(die => {
                    die.results.forEach((result, i) => {
                        [...this.element.querySelectorAll(`[name="${die._id}"]`)][i].value = result.result;
                    });
                });
            });
        }

        return originalPromise;
    }

    async addTerm(term) {
        console.log("addTerm", term);
        return super.addTerm(term);
    }

    async resolveResult(term, method, { reroll=false, explode=false }={}) {
        console.log("resolveResult", term, method, reroll, explode);
        return super.resolveResult(term, method, { reroll, explode });
    }

    registerResult(method, denomination, result) {
        console.log("registerResult", method, denomination, result);
        return super.addTerm(method, denomination, result);
    }

    /*
    #resolve;

    constructor(roll, options = {}) {
        console.log(roll, options);
        super(roll, options);
        this.init();
    }

    init() {
        console.log("init");
        document.body.addEventListener("click", (evt) => {
            this.#resolve?.();
        });
    }

    async awaitFulfillment() {
        console.log("awaitFulfillment");
        return new Promise(resolve => this.#resolve = resolve);
    }

    async addTerm(term) {
        console.log("addTerm", term);
        if ( !(term instanceof foundry.dice.terms.DiceTerm) ) {
            throw new Error("Only DiceTerm instances may be added to the RollResolver.");
        }
        return new Promise(resolve => this.#resolve = resolve);
    }

    async resolveResult(term, method, { reroll=false, explode=false }={}) {
        console.log("resolveResult", term, method, reroll, explode);
        return;

        const group = this.element.querySelector(`fieldset[data-term-id="${term._id}"]`);
        if ( !group ) {
            console.warn("Attempted to resolve a single result for an unregistered DiceTerm.");
            return;
        }
        const fields = document.createElement("div");
        fields.classList.add("form-fields");
        fields.innerHTML = `
            <label class="icon die-input new-addition" data-denomination="${term.denomination}" data-method="${method}">
                <input type="number" min="1" max="${term.faces}" step="1" name="${term._id}"
                    ${method === "manual" ? "" : "readonly"} placeholder="${game.i18n.localize(term.denomination)}">
                ${reroll ? '<i class="fas fa-arrow-rotate-right"></i>' : ""}
                ${explode ? '<i class="fas fa-burst"></i>' : ""}
                ${CONFIG.Dice.fulfillment.dice[term.denomination]?.icon ?? ""}
            </label>
            <button type="button" class="submit-result" data-tooltip="DICE.SubmitRoll"
                    aria-label="${game.i18n.localize("DICE.SubmitRoll")}">
                <i class="fas fa-arrow-right"></i>
            </button>
        `;
        group.appendChild(fields);
        this.setPosition({ height: "auto" });
        return new Promise(resolve => {
            const button = fields.querySelector("button");
            const input = fields.querySelector("input");
            button.addEventListener("click", () => {
                if ( !input.validity.valid ) {
                    input.form.reportValidity();
                    return;
                }
                let value = input.valueAsNumber;
                if ( !value ) value = term.randomFace();
                input.value = `${value}`;
                input.disabled = true;
                button.remove();
                resolve(value);
            });
        });
    }*/

}