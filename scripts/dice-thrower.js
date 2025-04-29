import { PhysicsWorkerWithPromise } from "./PhysicsWorkerWithPromise.js";
import { DiceNotation } from "../lib/foundryvtt-dice-so-nice/module/DiceNotation.js";
import { methods } from "./methods.js";

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
    // Needed by the rescoped showForRoll below
    //const Dice3D = dice3d.constructor;

    // Replace the PhysicsWorker with our own
    dice3d.box.physicsWorker.terminate();
    dice3d.box.physicsWorker = DSNThrower._physicsWorker;
    dice3d.DiceFactory.physicsWorker.terminate();
    dice3d.DiceFactory.physicsWorker = DSNThrower._physicsWorker;
    dice3d.box.initialize();

    //dice3d.box.swapDiceFace = () => {};

    // Embarassing magic trick. We recreate the showForRoll function to make it use our own DiceNotation class
    //let f;
    //dice3d.showForRoll = eval("f = function " + dice3d.showForRoll.toString()).bind(dice3d);

    dice3d.preRoll = methods.dice3d.preRoll.bind(dice3d);
    dice3d.box.preThrow = methods.diceBox.preThrow.bind(dice3d.box);
    dice3d.box.getPreThrowVectors = methods.diceBox.getPreThrowVectors.bind(dice3d.box);

    // Add the term id to the options so I can find it later in the diceList
    const originalDiceNotationAddDie = DiceNotation.prototype.addDie;
    DiceNotation.prototype.addDie = function({fvttDie, index, isd10of100 = false, options = {}}) {
        fvttDie.options._originalId = fvttDie._id;
        return originalDiceNotationAddDie.call(this, {fvttDie, index, isd10of100, options});
    };
});

Hooks.on("diceSoNiceMessageProcessed", (chatMessageId, interception) => {
    // Prevent DSN interception of chat messages entirely
    interception.willTrigger3DRoll = false;
});

class DSNThrower extends foundry.applications.dice.RollResolver {

    static _physicsWorker;
    static {
        this._physicsWorker = new PhysicsWorkerWithPromise({workerUrl: new URL("PhysicsWorker.js", import.meta.url), workerName: "PhysicsWorker"});
    }

    static DSNTHROWER_STATES = {
        INACTIVE: 0,
        PREROLL: 1,
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
            height: "auto",
            top: 3000
        },
        /*form: {
            submitOnChange: false,
            closeOnSubmit: false,
            handler: this._fulfillRoll
        }*/
    };

    #throwerState;

    get physicsWorker() {
        return this.constructor._physicsWorker;
    }

    get throwable() {
        return [...this.fulfillable.values().filter(f => f.method === METHOD)];
    }

    async awaitFulfillment() {
        this.#throwerState = DSNThrower.DSNTHROWER_STATES.INACTIVE;

        const originalPromise = super.awaitFulfillment();

        const resolver = this;

        if (this.throwable.length) {
            const plus = new foundry.dice.terms.OperatorTerm({ operator: "+" });
            const dice = this.throwable.map(t => t.term);
            let termList = dice.map((e, i) => i < dice.length - 1 ? [e, plus] : [e]).reduce((a, b) => a.concat(b));
            const preRoll = CONFIG.Dice.rolls[0].fromTerms(termList);

            // ugly trick while I figure stuff out
            // evaluate the roll "manually" just so I can feed it to the fake DSN throw, clear the evaluated roll so it's "reevaluated" correctly with the inputs on submit.
            // I KNOW. The problem is DiceNotation loops through the `results`. Might review later.
            const ast = CONFIG.Dice.parser.toAST(preRoll.terms);
            const resultTemp = await preRoll._evaluateASTAsync(ast);

            // Fake roll just to put the dice down.
            this.#throwerState = DSNThrower.DSNTHROWER_STATES.PREROLL;
            game.dice3d.preRoll(preRoll);

            DSNThrower._physicsWorker.off("worldAsleep");
            DSNThrower._physicsWorker.on("worldAsleep", async () => {
                if (this.#throwerState === DSNThrower.DSNTHROWER_STATES.PREROLL) {
                    //console.log("Manual throw done");
                    this.#throwerState = DSNThrower.DSNTHROWER_STATES.INACTIVE; // this disables additional manual throws
                    [...resolver.element.querySelectorAll(`input`)].forEach(i => {
                        i.value = "";
                    });
                    for (const die of game.dice3d.box.diceList) {
                        const physicsValue = await DSNThrower._physicsWorker.exec("getDiceCurrentValue", die.id);
                        [...resolver.element.querySelectorAll(`input[name="${die.options._originalId}"]`)].find(i => i.value === "").value = physicsValue;
                    }
                }
            });

            dice.forEach(die => {
                die.results = [];
                die._evaluated = false;
            });
        }

        return originalPromise;
    }

    async close(options={}) {
        DSNThrower._physicsWorker.off("worldAsleep");
        return super.close(options);
    }

    async _onSubmitForm(formConfig, event) {
        DSNThrower._physicsWorker.off("worldAsleep");
        return super._onSubmitForm(formConfig, event);
    }

}