/**
 * dsh-task-clarifier — Host half.
 *
 * Intentionally empty: the clarifier is a Client-side surface. Its question
 * engine, brief composer, local history and the "send to conversation" action
 * all run in the browser half (see client.js and package.json `dsh.client`), so
 * clarifying a task never spends model tokens and never needs a Host route.
 *
 * The Host row still exists because a bundle activates through its Loader row;
 * it keeps the package visible in the Plugin Manager inventory with the metadata
 * exported from locale/*.json and icon.svg.
 */
export function apply() {}
