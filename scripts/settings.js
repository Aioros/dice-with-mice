export const MODULE_NAME = "dice-with-mice";

export function registerSettings() {
    game.settings.register(MODULE_NAME, "hideTracker", {
        name: "Hide Roll Tracker",
        hint: "Don't display the roll tracker when other players are rolling their dice. This can also be changed with a button in the Player List",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
    });

    game.settings.register(MODULE_NAME, "resolverPosition", {
        name: "Resolver Position",
        scope: "client",
        config: false,
        type: Object,
        default: {},
    });

    game.settings.register(MODULE_NAME, "trackerPosition", {
        name: "Resolver Position",
        scope: "client",
        config: false,
        type: Object,
        default: {},
    });
}