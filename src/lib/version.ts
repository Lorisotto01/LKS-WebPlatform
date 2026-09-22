/**
 * Versione dell'ultima release, letta dal CHANGELOG del progetto (v4.9.3).
 *
 * Il numero compariva scritto a mano in tre punti della landing ed era fermo alla 4.3.4: ogni
 * rilascio avrebbe dovuto ricordarsi di ritoccarlo, e nessuno lo faceva. Ora arriva dalla riga
 * `Versione corrente: **X.Y.Z**` del CHANGELOG — la stessa fonte che alimenta la pagina
 * `/changelog` — sostituita da Vite al momento della build (vedi `vite.config.ts`).
 */
export const APP_VERSION: string = __APP_VERSION__;

/** Come {@link APP_VERSION}, con la `v` davanti: `v4.9.3`. */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
