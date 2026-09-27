// Evening reminder (23:xx Austrian time): "Wie war's heute?" — see remind.js.
import { handle } from './remind.js';

export const GET = (request) => handle(request, 'evening');
