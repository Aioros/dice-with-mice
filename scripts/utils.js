export function deepProxy(target, callback, tree = []) {
    const getPath = (prop) => tree.concat(prop).join(".");

    const handler = {
        set(target, prop, value) {
            callback({
                action: "set",
                path: getPath(prop),
                target,
                newValue: value,
                previousValue: Reflect.get(...arguments),
            });
            return Reflect.set(...arguments);
        },

        get(target, prop) {
            const value = Reflect.get(...arguments);
            if (value && typeof value === "object" && ["Array", "Object"].includes(value.constructor.name)) {
                return deepProxy(value, callback, tree.concat(prop));
            }
            return value;
        }
    };

    return new Proxy(target, handler);
}