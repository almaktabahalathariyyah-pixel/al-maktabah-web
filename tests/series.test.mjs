import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSeries, findSeriesBooks, groupBooksIntoAlbums } from '../src/lib/series.js';

test('parseSeries recognizes Thai ตอนที่ / ตอน', () => {
  const s13 = parseSeries('ซีรีส์หลักศรัทธาอิสลามสำหรับมุสลิม ตอนที่ 13');
  assert.ok(s13);
  assert.equal(s13.base, 'ซีรีส์หลักศรัทธาอิสลามสำหรับมุสลิม');
  assert.equal(s13.volume, 13);
  assert.equal(s13.label, 'ตอนที่ 13');
  assert.equal(s13.unit, 'ตอน');

  const s1 = parseSeries('ซีรีส์หลักศรัทธาอิสลามสำหรับมุสลิม ตอน 1');
  assert.ok(s1);
  assert.equal(s1.baseNorm, s13.baseNorm);
  assert.equal(s1.volume, 1);
});

test('findSeriesBooks groups and sorts ตอนที่ episodes ascending', () => {
  const books = [
    { id: 'c', title: 'ซีรีส์หลักศรัทธาอิสลามสำหรับมุสลิม ตอนที่ 13' },
    { id: 'a', title: 'ซีรีส์หลักศรัทธาอิสลามสำหรับมุสลิม ตอนที่ 1' },
    { id: 'b', title: 'ซีรีส์หลักศรัทธาอิสลามสำหรับมุสลิม ตอนที่ 2' },
    { id: 'x', title: 'หนังสือเดี่ยวทั่วไป' },
  ];
  const group = findSeriesBooks(books[0], books);
  assert.equal(group.length, 3);
  assert.deepEqual(group.map((g) => g.volume), [1, 2, 13]);
  assert.deepEqual(group.map((g) => g.label), ['ตอนที่ 1', 'ตอนที่ 2', 'ตอนที่ 13']);
});

test('groupBooksIntoAlbums collapses multi-episode series into one album entry', () => {
  const books = [
    { id: 'c', title: 'ซีรีส์หลักศรัทธาอิสลามสำหรับมุสลิม ตอนที่ 13', coverUrl: 'c.jpg' },
    { id: 'x', title: 'หนังสือเดี่ยวทั่วไป', coverUrl: 'x.jpg' },
    { id: 'a', title: 'ซีรีส์หลักศรัทธาอิสลามสำหรับมุสลิม ตอนที่ 1', coverUrl: 'a.jpg' },
    { id: 'b', title: 'ซีรีส์หลักศรัทธาอิสลามสำหรับมุสลิม ตอนที่ 2', coverUrl: 'b.jpg' },
  ];
  const entries = groupBooksIntoAlbums(books);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].kind, 'album');
  assert.equal(entries[0].title, 'ซีรีส์หลักศรัทธาอิสลามสำหรับมุสลิม');
  assert.equal(entries[0].unit, 'ตอน');
  assert.equal(entries[0].items.length, 3);
  assert.equal(entries[0].coverBook.id, 'a');
  assert.equal(entries[1].kind, 'book');
  assert.equal(entries[1].book.id, 'x');
});
