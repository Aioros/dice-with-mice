export class DiceNotation {

	/**
	 * A roll object from Foundry 
	 * @param {Roll} rolls 
	 */
	constructor(rolls, userConfig = null, user = game.user) {
		this.throws = [{dice:[]}];
		this.userConfig = userConfig;

        let diceNumber = 0;
		let maxDiceNumber = game.settings.get("dice-so-nice", "maxDiceNumber");
        //Then we can create the throws
		rolls.dice.some(die => {
			//We only are able to handle this list of number of face in 3D for now
			if ([2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 30, 100].includes(die.faces)) {
				let options = {};
				
                // If we're rerolling/exploding, it's always just one die
                const diceAmount = die.results.length ? 1 : die.number;

                for (let i=0; i<diceAmount; i++) {
					if (++diceNumber >= maxDiceNumber) return true;
                    //save the user in the options
                    options.owner = user.id;

                    // Add the term id and the index to the options so I can find it later in the diceList
                    options._originalId = die._id;
                    options._index = i;

                    //ghost can't be secret
                    if (rolls.ghost)
                        options.ghost = true;
                    else if (rolls.secret)
                        options.secret = true;

                    if (die.modifiers.length)
                        options.modifiers = die.modifiers;

                    this.addDie({fvttDie: die, index:i, options: options});
                    if (die.faces == 100) {
                        this.addDie({fvttDie: die, index: i, isd10of100: true, options: options});
                    }
				}
			}
		});
	}
	/**
	 * 
	 * @param {DiceTerm} fvttDie Die object from Foundry VTT
	 * @param {Integer} index Position in the dice array
	 * @param {Boolean} isd10of100 In DsN, we use two d10 for a d100. Set to true if this die should be the unit dice of a d100
	 * @param {Object} options Options related to the fvtt roll that should be attached to the dsn die
	 */
	addDie({fvttDie, index, isd10of100 = false, options = {}}) {
		let dsnDie = {};

		//If it is not a standard die ("d"), we need to prepend "d" to the denominator. If it is, we append the number of face
		dsnDie.type = fvttDie.constructor.DENOMINATION;
		if (fvttDie.constructor.name == CONFIG.Dice.terms["d"].name) {
			dsnDie.type += isd10of100 ? "10" : fvttDie.faces;
        } else {
			dsnDie.type = "d" + dsnDie.type;
		}
		dsnDie.vectors = [];
		//Contains optionals flavor (core) and colorset (dsn) infos.
		dsnDie.options = foundry.utils.duplicate(fvttDie.options);
		foundry.utils.mergeObject(dsnDie.options, options);
		if (this.userConfig && !this.userConfig.enableFlavorColorset && dsnDie.options.flavor) {
			delete dsnDie.options.flavor;
        }
        this.throws[0].dice.push(dsnDie);
	}
}
