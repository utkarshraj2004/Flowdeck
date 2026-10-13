// Shared dynamic imports so a chunk is requested once, whether preloaded or rendered.
let boardPage: Promise<typeof import('./BoardPage')> | undefined;
export const loadBoardPage = () => (boardPage ??= import('./BoardPage'));
let cardModal: Promise<typeof import('./CardModal')> | undefined;
export const loadCardModal = () => (cardModal ??= import('./CardModal'));
