import {registerLocale} from '../index.js';
import {en} from './en.js';
import {hi} from './hi.js';
import {ja} from './ja.js';
import {ar} from './ar.js';

// Auto-register all locales
registerLocale(en);
registerLocale(hi);
registerLocale(ja);
registerLocale(ar);

export {en, hi, ja, ar};
