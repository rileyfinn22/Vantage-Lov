export function delay<T>(p: Promise<T> | (() => T), ms: number = 400): Promise<T> {
    return new Promise((resolve) => {
        setTimeout(() => {
            if (typeof p === 'function') {
                resolve(p());
            } else {
                resolve(p);
            }
        }, ms);
    });
}
