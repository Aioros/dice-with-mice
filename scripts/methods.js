//import { DiceNotation } from "../lib/foundryvtt-dice-so-nice/module/DiceNotation.js";
import { DiceNotation } from "./DiceNotation.js";

const methods = {
    dice3d: {
        async preRoll(roll, callback) {
            const Dice3D = this.constructor;
            const notation = new DiceNotation(roll, Dice3D.ALL_CONFIG(game.user), game.user);
            notation.dsnConfig = Dice3D.ALL_CUSTOMIZATION(game.user, this.DiceFactory);

            notation.throws.forEach(t => { t.dsnConfig = notation.dsnConfig; });

            this._beforeShow();
            await this.box.preThrow(notation.throws, callback);
        }
    },

    diceBox: {
        async onMouseDown(event, ndc) {
            if (!!this.currentResolver?.throwerState) return true;
            return this.constructor.prototype.onMouseDown.call(this, event, ndc);
        },

        async onMouseUp(event) {
            if (this.currentResolver && this.currentResolver.throwerState === this.currentResolver.constructor.DSNTHROWER_STATES.READY) {
                await this.currentResolver.setThrowerState(this.currentResolver?.constructor.DSNTHROWER_STATES.ROLLING);
                await this.physicsWorker.exec("allowSleeping", true);
            }
            return this.constructor.prototype.onMouseUp.call(this, event);
        },

        getPreThrowVectors(notationVectors) {
            for (let i = 0; i < notationVectors.dice.length; i++) {
                const diceobj = this.dicefactory.get(notationVectors.dice[i].type);
                notationVectors.dice[i].vectors = {
                    type: diceobj.type,
                    pos: {x: 0 + 50*i, y: this.display.containerHeight * -0.9 + 50*i, z: 200},
                    velocity: {x: 0, y: 0, z: 0},
                    angle: {x: 0.1, y: 0.1, z: 0.1},
                    axis: {x: 0, y: 0, z: 0, a: 0}
                };
            }
            return notationVectors;
        },

        async preThrow(throws, callback) {
            this.isVisible = true;
            this.clearDice();

            throws.forEach(notation => {
                notation = this.getPreThrowVectors(notation);
            });

            for (let j = 0; j < throws.length; j++) {
                let notationVectors = throws[j];
                for (let i = 0, len = notationVectors.dice.length; i < len; ++i) {
                    notationVectors.dice[i].startAtIteration = j * this.nbIterationsBetweenRolls;
                    let appearance = this.dicefactory.getAppearanceForDice(notationVectors.dsnConfig.appearance, notationVectors.dice[i].type, notationVectors.dice[i]);
                    await this.spawnDice(notationVectors.dice[i], appearance);
                }
            }

            for (let die of this.diceList) {
                await this.physicsWorker.exec("addConstraint", { id: die.id, pos: {x: 5, y: this.display.containerHeight * -0.9 + 5, z: 200} }); // Slightly offset the constraint so that the die is not too static
            }
            this.mouse.constraint = true;
            this.mouse.constraintDown = true;
            if (canvas.mouseInteractionManager) {
				canvas.mouseInteractionManager.object.interactive = false;
            }

            // animateThrow needs each dice to have a `sim` property to accept new positions
            const combinedDiceList = [...this.diceList, ...this.deadDiceList];
            combinedDiceList.forEach(dice => { dice.sim = {}; });

            this.iteration = 0;

            this.callback = callback;
            this.throws = throws;
            
            this.removeTicker(this.animateThrow);
            canvas.app.ticker.add(this.animateThrow, this);
        }    
    }
};

export function addMethods(dice3d) {
    dice3d.preRoll = methods.dice3d.preRoll.bind(dice3d);
    dice3d.box.onMouseDown = methods.diceBox.onMouseDown.bind(dice3d.box);
    dice3d.box.onMouseUp = methods.diceBox.onMouseUp.bind(dice3d.box);
    dice3d.box.preThrow = methods.diceBox.preThrow.bind(dice3d.box);
    dice3d.box.getPreThrowVectors = methods.diceBox.getPreThrowVectors.bind(dice3d.box);

    // Add the term id to the options so I can find it later in the diceList
    //const originalDiceNotationAddDie = DiceNotation.prototype.addDie;
    //DiceNotation.prototype.addDie = function({fvttDie, index, isd10of100 = false, options = {}}) {
    //    fvttDie.options._originalId = fvttDie._id;
    //    fvttDie.options._index = index;
    //    return originalDiceNotationAddDie.call(this, {fvttDie, index, isd10of100, options});
    //};
}