# Dice With Mice!
A module for FoundryVTT that shamelessly mistreats the irreplaceable [Dice So Nice!](https://foundryvtt.com/packages/dice-so-nice), except that you roll the dice yourself. All Dice So Nice configuration is respected, including themes, colors, and special effects.

## How to Use
After you install the module, you should go to your Dice Configuration settings to tell Foundry how to roll your dice. A notification will guide you there the first time:

<!-- DiceConfig image here -->

After that, any time you roll dice that you configured, the 3D dice will be created for you and placed right under your mouse cursor. You can just press your left button, give them a good shake, and throw by releasing the same button. Right-click cancels the throw, but you can restart it by pressing the "Start Roll" button.

<!-- Roll image here -->

By default, rolling dice are also displayed on other players' screens in a small dedicated window, because everybody likes to see that nat 20 happen in real time. If you prefer you can disable that using the dice button in the Players List.

<!-- Tracker image here -->
<!-- Players List image here -->

## WARNING (if you care about probability, at least)
The default roll resolution in Foundry uses a Mersenne Twister pseudorandom number generator. To keep it simple, that's some powerful mathematical magic to give you the best randomness you can get from a dice roll.

While Dice So Nice, on its own, has no impact on that, using Dice With Mice for a roll means abandoning the math wizardry altogether, and relying on "physical" dice rolls. Which is probably fine for most people who share this hobby, because that's what happens on an actual physical table, but hey, I felt that the disclaimer was necessary for the few people out there who care about probability distributions.

## Acknowledgements
This module would obviously not exist at all without the monumental work of [Simone Ricciardi](https://gitlab.com/riccisi) and [Mathias Latournerie](https://gitlab.com/JiDW).

<sup>(but also, without just the right amount of instigation from honeybadger)</sup>

## License
Dice With Mice is licensed under the [GNU Affero General Public License v3]().