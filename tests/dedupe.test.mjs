import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateBooks, findDuplicateNames } from '../src/lib/dedupe.js';

test('findDuplicateBooks catches Majmu al-Fatawa transliteration & subtitle duplicates', () => {
  const books = [
    { id: '1', title: "Majmu' al-Fatawa - Volume 1", coverUrl: 'a.jpg', driveUrl: 'https://drive.google.com/file/d/aaa111111111111111/view' },
    { id: '2', title: 'Majmūʿ al-Fatāwā - Volume 1', coverUrl: '' },
    { id: '3', title: "Majmu' al-Fatawa - Volume 2", coverUrl: 'b.jpg', driveUrl: 'https://drive.google.com/file/d/bbb222222222222222/view' },
    { id: '4', title: 'Majmūʿ al-Fatāwā - Volume 2: Tawḥīd ar-Rubūbiyyah', coverUrl: '' },
    { id: '5', title: "Majmu' al-Fatawa - Volume 3", coverUrl: 'c.jpg' },
  ];
  const groups = findDuplicateBooks(books);
  assert.equal(groups.length, 2);
  // Best copy (with cover) comes first in each group
  assert.equal(groups[0].books[0].coverUrl !== '', true);
  assert.equal(groups[1].books[0].coverUrl !== '', true);
});

test('findDuplicateNames catches Thai/English spelling & honorific variants', () => {
  const books = [
    { id: '1', author: ['ชัยค์ อิบนุ บาซ'], publisher: 'สำนักพิมพ์อัซซาบิกูน' },
    { id: '2', author: ['เชค บิน บาซ'], publisher: 'อัซซาบิกูน' },
    { id: '3', author: ['Shaykh Ibn Baz'], publisher: 'Salafi Publications' },
    { id: '4', author: ['Shaikh Ibn Bāz'], publisher: 'Salafi' },
  ];
  const dupAuthors = findDuplicateNames(books, 'author');
  assert.equal(dupAuthors.length, 2);

  const dupPubs = findDuplicateNames(books, 'publisher');
  assert.equal(dupPubs.length, 2);
});
