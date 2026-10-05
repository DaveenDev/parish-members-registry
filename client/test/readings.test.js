import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanHtml, manilaToday, plainText, toReadings, universalisUrl } from '../src/lib/readings.js';

// Shaped like the Universalis feed (texts made up).
const SUNDAY = {
  day: "<div style='text-indent: -3em; margin-left: 3em;'><b>28th Sunday in Ordinary Time</b></div>",
  Mass_R1: { heading: 'A banquet for every nation', source: 'Isaiah 25:6&#x2010;10', text: "<div style='text-indent: -3em; margin-left: 3em; margin-top:0.8em;'>Line one</div><div style='text-indent: -3em; margin-left: 3em;'>Line two</div>" },
  Mass_Ps: { source: 'Psalm 22(23)', text: "<div style='text-indent: -3em; margin-left: 3em;'><i>In the Lord&#x2019;s own house shall I dwell.</i></div><div style='text-indent: -3em; margin-left: 3em; margin-top:0.8em;'>The Lord is my shepherd;</div><div style='text-indent: -3em; margin-left: 3em; margin-top:0.8em;'><i>In the Lord&#x2019;s own house shall I dwell.</i></div>" },
  Mass_R2: { source: 'Philippians 4:12&#x2010;14', text: "<div style='text-align:justify;'>Second reading.</div>" },
  Mass_GA: { source: 'Jn1:14,12', text: "<div style='text-indent: -3em; margin-left: 3em;'>Alleluia, alleluia!</div>" },
  Mass_G: { heading: 'Invite everyone', source: 'Matthew 22:1&#x2010;14', text: "<div style='text-align:justify;'>Gospel text.</div>" },
  copyright: { text: "<div><span style='font-size: 87%;'>Copyright &#xa9; 1996&#x2010;2026 Universalis Publishing Limited</span></div>" },
};

test('Philippine date, whatever the visitor’s clock says', () => {
  // 17:00 UTC on 5 Oct is already 1 AM on 6 Oct in Manila.
  assert.equal(manilaToday(new Date('2026-10-05T17:00:00Z')), '2026-10-06');
  assert.equal(manilaToday(new Date('2026-10-05T15:59:00Z')), '2026-10-05');
});

test('feed address: Philippine calendar, compact date, callback', () => {
  assert.equal(universalisUrl('2026-10-06', 'cb_1'), 'https://universalis.com/Asia.Philippines/20261006/jsonpmass.js?callback=cb_1');
});

test('cleanHtml keeps formatting tags with no attributes, plus line and stanza markers', () => {
  assert.equal(cleanHtml("<div style='text-align:justify;'>Hi <i class='x'>there</i><br/></div>"), '<div>Hi <i>there</i><br></div>');
  assert.equal(cleanHtml("<div style='text-indent: -3em; margin-top:0.8em;'>A</div>"), '<div data-line data-gap>A</div>');
  // A prose paragraph with its first line indented is not a line of verse.
  assert.equal(cleanHtml("<div style='text-align:justify; text-indent:1em;'>B</div>"), '<div data-indent>B</div>');
  assert.equal(cleanHtml('<p onclick="alert(1)">x</p>'), '<p>x</p>');
});

test('cleanHtml drops anything that could run or load', () => {
  assert.equal(cleanHtml('<img src=x onerror=alert(1)>ok'), 'ok');
  assert.equal(cleanHtml('<script>alert(1)</script>'), 'alert(1)');
  assert.equal(cleanHtml('<a href="javascript:alert(1)">link</a>'), 'link');
  // Removing a tag must not glue a stray < onto the next text and make a new tag.
  for (const nasty of ['<<x>img src=x onerror=alert(1)>', '<x<img src=x onerror=alert(1)>>', '<<<img src=x onerror=alert(1)>']) {
    assert.doesNotMatch(cleanHtml(nasty), /<(?!\/?(div|p|br|i|em|b|strong|span|sup|sub|small)[ >])/, nasty);
  }
  assert.equal(cleanHtml('a < b > c'), 'a &lt; b &gt; c');
  // An attribute value hiding a > only ends the tag early: the rest stays plain text.
  assert.equal(cleanHtml('<div title=">" onmouseover=alert(1)>x</div>'), '<div>" onmouseover=alert(1)&gt;x</div>');
});

test('plainText strips tags and decodes entities', () => {
  assert.equal(plainText('Isaiah 25:6&#x2010;10'), 'Isaiah 25:6‐10');
  assert.equal(plainText('<b>Hodder &amp; Stoughton</b> &#169;'), 'Hodder & Stoughton ©');
});

test('a Sunday: four readings in Mass order, with the psalm response and the Gospel acclamation', () => {
  const { day, readings, copyright } = toReadings(SUNDAY);
  assert.equal(day, '28th Sunday in Ordinary Time');
  assert.deepEqual(readings.map((r) => r.label), ['Unang Pagbasa', 'Salmo', 'Ikaduhang Pagbasa', 'Ebanghelyo']);
  assert.equal(readings[0].source, 'Isaiah 25:6‐10');
  assert.equal(readings[0].heading, 'A banquet for every nation');
  assert.equal(readings[0].html, '<div data-line data-gap>Line one</div><div data-line>Line two</div>');

  const psalm = readings[1];
  assert.equal(psalm.response, 'In the Lord’s own house shall I dwell.');
  // The opening response moves out of the text; the ones between stanzas stay.
  assert.ok(psalm.html.startsWith('<div data-line data-gap>The Lord is my shepherd;</div>'));
  assert.ok(psalm.html.includes('<i>'));

  assert.deepEqual(readings[3].acclamation, { source: 'Jn1:14,12', html: '<div data-line>Alleluia, alleluia!</div>' });
  assert.equal(copyright, 'Copyright © 1996‐2026 Universalis Publishing Limited');
});

test('a weekday has no second reading', () => {
  const { readings } = toReadings({ ...SUNDAY, Mass_R2: undefined });
  assert.deepEqual(readings.map((r) => r.key), ['Mass_R1', 'Mass_Ps', 'Mass_G']);
});

test('a reading sent without its text keeps its reference', () => {
  const { readings } = toReadings({ ...SUNDAY, Mass_Ps: { source: 'Psalm 112(113):1&#x2010;7' } });
  const psalm = readings.find((r) => r.key === 'Mass_Ps');
  assert.equal(psalm.source, 'Psalm 112(113):1‐7');
  assert.equal(psalm.html, '');
  assert.equal(psalm.response, undefined);
});

test('nothing usable: no readings', () => {
  assert.deepEqual(toReadings(null), { day: '', readings: [], copyright: '' });
  assert.deepEqual(toReadings({}).readings, []);
});
