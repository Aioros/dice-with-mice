export const MODULE_NAME = "dice-with-mice";

export function registerSettings() {
    game.settings.register(MODULE_NAME, "hideTracker", {
        name: "DWM.SETTINGS.HideTracker.Name",
        hint: "DWM.SETTINGS.HideTracker.Hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
    });

    game.settings.register(MODULE_NAME, "disableDiceConfigNotification", {
        name: "Disable DiceConfig Notification",
        scope: "client",
        config: false,
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