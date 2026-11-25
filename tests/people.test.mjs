import assert from 'node:assert/strict';
import test from 'node:test';
import { BOOK_NAME_ROLES, hasBookName, hasPerson } from '../src/lib/people.js';

const name = 'อบู ฟาฏิมะฮ์';
const books = [
  { id: 'written', author: ['ผู้เขียนร่วม', name], language: 'ไทย' },
  { id: 'translated', translator: name, language: 'อาหรับ' },
  { id: 'published', publisher: ` ${name} `, language: 'ไทย' },
  { id: 'multiple', author: name, translator: [name], publisher: name, language: 'ไทย' },
  { id: 'other', author: `${name} คนอื่น`, publisher: 'สำนักพิมพ์อื่น', language: 'ไทย' },
];

test('one name matches author, translator and publisher, counting each book once', () => {
  assert.deepEqual(books.filter((book) => hasBookName(book, name)).map((book) => book.id), [
    'written', 'translated', 'published', 'multiple',
  ]);
});

test('role sections include the same book in each applicable role', () => {
  const results = books.filter((book) => hasBookName(book, name));
  const sections = Object.fromEntries(BOOK_NAME_ROLES.map(({ key }) => [
    key, results.filter((book) => hasPerson(book[key], name)).map((book) => book.id),
  ]));
  assert.deepEqual(sections, {
    author: ['written', 'multiple'],
    translator: ['translated', 'multiple'],
    publisher: ['published', 'multiple'],
  });
});

test('other filters still narrow results across all name roles', () => {
  const results = books.filter((book) => hasBookName(book, name) && book.language === 'ไทย');
  assert.deepEqual(results.map((book) => book.id), ['written', 'published', 'multiple']);
});

test('missing credits and empty names do not match', () => {
  assert.equal(hasBookName({}, name), false);
  assert.equal(hasBookName({ author: [name], publisher: '-' }, ''), false);
  assert.equal(hasBookName({ translator: null }, name), false);
});
