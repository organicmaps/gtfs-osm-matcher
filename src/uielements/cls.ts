export function cls(...classes: (string | boolean | null | undefined)[]) {
    return classes.filter(s => !!s).join(' ');
}