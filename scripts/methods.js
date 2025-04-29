import { DiceNotation } from "../lib/foundryvtt-dice-so-nice/module/DiceNotation.js";

export const methods = {
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
                await this.physicsWorker.exec("addConstraint", { id: die.id, pos: {x: 0, y: this.display.containerHeight * -0.9, z: 200} });
            }
            this.mouse.constraint = true;

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
}