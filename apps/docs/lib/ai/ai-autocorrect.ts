'use client';

/**
 * AI Autocorrect Extension for Tiptap 3.x
 *
 * Real-time corrections as you type:
 * - Common misspellings → instant fix
 * - Smart quotes, dashes, symbols
 * - Double spaces → single space
 *
 * Uses Tiptap 3.x textInputRule for simple replacements
 * and ProseMirror InputRule for complex misspelling corrections.
 */

import {Extension, textInputRule, type InputRule} from '@tiptap/core';

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
  'paralel': 'parallel',
  'privilege': 'privilege',
  'publically': 'publicly',
  'questionaire': 'questionnaire',
  'relevent': 'relevant',
  'resistence': 'resistance',
  'sargent': 'sergeant',
  'sieze': 'seize',
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

    // 1. Fix common misspellings — use simple string replacement with textInputRule.
    //    For capitalization awareness, we register both lowercase and capitalized forms.
    for (const [wrong, right] of Object.entries(MISSPELLINGS)) {
      const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Lowercase match
      rules.push(textInputRule({
        find: new RegExp(`(?:^|\\s)${escaped}\\s$`),
        replace: ` ${right} `,
      }));

      // Capitalized match (first letter upper)
      const capWrong = wrong[0].toUpperCase() + wrong.slice(1);
      const capRight = right[0].toUpperCase() + right.slice(1);
      const capEscaped = capWrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      rules.push(textInputRule({
        find: new RegExp(`(?:^|\\s)${capEscaped}\\s$`),
        replace: ` ${capRight} `,
      }));
    }

    // 2. Double space → single space
    rules.push(textInputRule({
      find: /  $/,
      replace: ' ',
    }));

    // 3. Triple dot → ellipsis
    rules.push(textInputRule({
      find: /\.\.\.$/,
      replace: '\u2026',
    }));

    // 4. Double hyphen → em dash
    rules.push(textInputRule({
      find: /--$/,
      replace: '\u2014',
    }));

    // 5. (c) → ©
    rules.push(textInputRule({
      find: /\(c\)$/i,
      replace: '\u00A9',
    }));

    // 6. (r) → ®
    rules.push(textInputRule({
      find: /\(r\)$/i,
      replace: '\u00AE',
    }));

    // 7. (tm) → ™
    rules.push(textInputRule({
      find: /\(tm\)$/i,
      replace: '\u2122',
    }));

    return rules;
  },
});
