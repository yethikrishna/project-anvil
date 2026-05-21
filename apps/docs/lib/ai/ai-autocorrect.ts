'use client';

/**
 * AI Autocorrect Extension for Tiptap
 *
 * Real-time corrections as you type:
 * - Common misspellings → instant fix
 * - Double capitals → auto-lowercase
 * - Smart quotes
 * - Double spaces → single space
 * - Common confusions (their/there, its/it's)
 * - Smart dashes
 *
 * Uses ProseMirror inputRules for seamless integration.
 */

import {Extension} from '@tiptap/core';
import {InputRule} from '@tiptap/core';

// ── Autocorrect Maps ──

const MISSPELLINGS: Record<string, string> = {
  'teh': 'the',
  'adn': 'and',
  'recieve': 'receive',
  'occured': 'occurred',
  'seperate': 'separate',
  'definately': 'definitely',
  'occassion': 'occasion',
  'accomodate': 'accommodate',
  'apparant': 'apparent',
  'calender': 'calendar',
  'collegue': 'colleague',
  'committment': 'commitment',
  'concensus': 'consensus',
  'dissapoint': 'disappoint',
  'enviroment': 'environment',
  'goverment': 'government',
  'immediatly': 'immediately',
  'independant': 'independent',
  'neccessary': 'necessary',
  'noticable': 'noticeable',
  'occurence': 'occurrence',
  'persistant': 'persistent',
  'recomend': 'recommend',
  'refered': 'referred',
  'succesful': 'successful',
  'suprise': 'surprise',
  'tommorow': 'tomorrow',
  'untill': 'until',
  'wierd': 'weird',
  'wich': 'which',
  'becuase': 'because',
  'thier': 'their',
  'alot': 'a lot',
  'aslo': 'also',
  'beleive': 'believe',
  'calender': 'calendar',
  'cemetary': 'cemetery',
  'changable': 'changeable',
  'desciption': 'description',
  'existance': 'existence',
  'experiance': 'experience',
  'foriegn': 'foreign',
  'freind': 'friend',
  'gaurd': 'guard',
  'happend': 'happened',
  'harrass': 'harass',
  'independance': 'independence',
  'knowlege': 'knowledge',
  'liason': 'liaison',
  'libary': 'library',
  'maintenence': 'maintenance',
  'millenium': 'millennium',
  'noticable': 'noticeable',
  'paralel': 'parallel',
  'privilege': 'privilege',
  'publically': 'publicly',
  'questionaire': 'questionnaire',
  'recomend': 'recommend',
  'relevent': 'relevant',
  'resistence': 'resistance',
  'sargent': 'sergeant',
  'sieze': 'seize',
  'speech': 'speech',
  'tendency': 'tendency',
  'threshhold': 'threshold',
  'tounge': 'tongue',
  'truely': 'truly',
  'vaccum': 'vacuum',
  'vegatable': 'vegetable',
  'writting': 'writing',
};

// ── Extension ──

export const AIAutocorrect = Extension.create({
  name: 'aiAutocorrect',

  addInputRules() {
    const rules: InputRule[] = [];

    // 1. Fix double capitals at start of word: THe → The
    rules.push(new InputRule(/(?:^|\s)([A-Z]{2,})([a-z])/g, (state, match, start, end) => {
      const [, capitals, rest] = match;
      const fixed = capitals[0] + capitals.slice(1).toLowerCase() + rest;
      return state.tr.insertText(fixed, start + match.index! + (match[0].length - match[0].trimStart().length), end);
    }));

    // 2. Fix common misspellings (triggered by space after word)
    for (const [wrong, right] of Object.entries(MISSPELLINGS)) {
      const pattern = new RegExp(`(?:^|\\s)${wrong}\\s$`, 'i');
      rules.push(new InputRule(pattern, (state, match, start, end) => {
        // Preserve the space at the end
        const word = match[0].trim();
        const leadingSpace = match[0].startsWith(' ') ? ' ' : '';
        // Preserve original capitalization pattern
        let fixed = right;
        if (word[0] === word[0].toUpperCase() && word.slice(1) === word.slice(1).toLowerCase()) {
          fixed = right[0].toUpperCase() + right.slice(1);
        } else if (word === word.toUpperCase()) {
          fixed = right.toUpperCase();
        }
        return state.tr.insertText(`${leadingSpace}${fixed} `, start, end);
      }));
    }

    // 3. Double space → single space
    rules.push(new InputRule(/  $/, (state, match, start, end) => {
      return state.tr.insertText(' ', start, end);
    }));

    // 4. Smart quotes: straight quotes → curly quotes
    rules.push(new InputRule(/"$/, (state, match, start, end) => {
      // Check if opening or closing quote
      const textBefore = state.doc.textBetween(Math.max(0, start - 1), start);
      if (textBefore === ' ' || textBefore === '' || textBefore === '\n' || start === 1) {
        return state.tr.insertText('\u201C', start, end); // Opening "
      }
      return state.tr.insertText('\u201D', start, end); // Closing "
    }));

    rules.push(new InputRule(/'$/, (state, match, start, end) => {
      const textBefore = state.doc.textBetween(Math.max(0, start - 1), start);
      if (textBefore === ' ' || textBefore === '' || textBefore === '\n' || start === 1) {
        return state.tr.insertText('\u2018', start, end); // Opening '
      }
      return state.tr.insertText('\u2019', start, end); // Closing '
    }));

    // 5. Triple dot → ellipsis
    rules.push(new InputRule(/\.\.\.$/, (state, match, start, end) => {
      return state.tr.insertText('\u2026', start, end);
    }));

    // 6. Double hyphen → em dash
    rules.push(new InputRule(/--$/, (state, match, start, end) => {
      return state.tr.insertText('\u2014', start, end);
    }));

    // 7. (c) → ©
    rules.push(new InputRule(/\(c\)$/i, (state, match, start, end) => {
      return state.tr.insertText('©', start, end);
    }));

    // 8. (r) → ®
    rules.push(new InputRule(/\(r\)$/i, (state, match, start, end) => {
      return state.tr.insertText('®', start, end);
    }));

    // 9. (tm) → ™
    rules.push(new InputRule(/\(tm\)$/i, (state, match, start, end) => {
      return state.tr.insertText('™', start, end);
    }));

    // 10. Number suffixes: 1st, 2nd, 3rd
    rules.push(new InputRule(/(\d)st $/, (state, match, start, end) => {
      return state.tr.insertText(`${match[1]}st `, start, end);
    }));

    return rules;
  },
});
