import assert from "node:assert/strict";
import fs from "node:fs";

import {Body, Cell, Library} from "../code/sv.mjs";
import {auditPattern, formatPatternAudit} from "../code/pattern-audit.mjs";

function exactArrayBuffer(buffer) {
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

const libraryBuffer = fs.readFileSync(new URL("../block-library/blocks.json", import.meta.url));
const library = Library.fromArrayBuffer(exactArrayBuffer(libraryBuffer));
const yarnInTemplate = library.getTemplateByLongname("yarn-in.right");
const yarnOutTemplate = library.getTemplateByLongname("yarn-out.right");
const yarnNextRowTemplate = library.getTemplateByLongname("yarn-next-row.right");

const validBody = new Body();
const yarnIn = Cell.fromTemplate(yarnInTemplate);
const yarnOut = Cell.fromTemplate(yarnOutTemplate);
yarnIn.connections[4] = {cell: yarnOut, face: 2};
yarnOut.connections[2] = {cell: yarnIn, face: 4};
validBody.cells.push(yarnIn, yarnOut);

const validReport = auditPattern(validBody);
assert.equal(validReport.passed, true, formatPatternAudit(validReport));
assert.equal(validReport.openYarnFaceCount, 0);
assert.equal(validReport.yarnComponentCount, 1);

const brokenBody = new Body();
brokenBody.cells.push(Cell.fromTemplate(yarnInTemplate), Cell.fromTemplate(yarnOutTemplate));
const brokenReport = auditPattern(brokenBody);
assert.equal(brokenReport.passed, true, "author checks alone do not classify visual endpoint diagnostics as errors");
assert.equal(brokenReport.strictContinuityPassed, false);
assert.equal(brokenReport.openYarnFaceCount, 2);
assert.equal(brokenReport.yarnComponentCount, 2);
assert.match(formatPatternAudit(brokenReport), /Comparative diagnostics only/);

const cycleBody = new Body();
const cycleCells = [0, 1, 2].map(() => Cell.fromTemplate(yarnNextRowTemplate));
for (let index = 0; index < cycleCells.length; ++index) {
	const current = cycleCells[index];
	const next = cycleCells[(index + 1) % cycleCells.length];
	current.connections[3] = {cell: next, face: 2};
	next.connections[2] = {cell: current, face: 3};
}
cycleBody.cells.push(...cycleCells);
const cycleReport = auditPattern(cycleBody);
assert.equal(cycleReport.yarnDirectionCycleFree, false);
assert.equal(cycleReport.yarnDirectionCycle.length, 3);
assert.match(formatPatternAudit(cycleReport), /0 -> 2 -> 1 -> 0|0 -> 1 -> 2 -> 0/);

const bunnyBuffer = fs.readFileSync(new URL("../patterns/stanford-bunny.body", import.meta.url));
const unconvertedBunny = Body.fromArrayBuffer(exactArrayBuffer(bunnyBuffer), library);
const bunnyReport = auditPattern(unconvertedBunny);
assert.equal(bunnyReport.passed, false, "an unconverted voxel body must not pass as a knitting pattern");
assert.equal(bunnyReport.yarnInCount, 0);
assert.equal(bunnyReport.yarnOutCount, 0);

console.log("Pattern audit passed: author compatibility and strict visual diagnostics are reported separately.");
