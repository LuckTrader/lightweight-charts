#!/usr/bin/env node

/**
 * This script uses size-limit to show size changes since merge-base
 */

const childProcess = require('child_process');

const bytes = require('bytes');
const sizeLimit = require('size-limit');
const filePlugin = require('@size-limit/file');

const sizeLimitConfig = require('../.size-limit');

function fixMaxListenersExceededWarning() {
	// from https://github.com/ai/size-limit/blob/3571e79736a5cd7bf9cf245ff7d5ea2e3ac5f9ef/packages/size-limit/calc.js#L2
	process.setMaxListeners(100);

	process.stderr.getMaxListeners();
	// THIS IS SPECIAL, DON'T REMOVE IT!
	// WTF Node?! ¯\_(ツ)_/¯
	process.stdout.write('');
}

function run(cmd) {
	try {
		return {
			success: true,
			output: childProcess.execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim(),
		};
	} catch (e) {
		return { success: false, output: e.stderr || e.stdout || e.toString() };
	}
}

function runForSuccess(cmd) {
	runForOutput(cmd);
}

function runForOutput(cmd) {
	const res = run(cmd);
	if (!res.success) {
		console.error(`Can't execute "${cmd}":\n${res.output}`);
		process.exit(1);
	}

	return res.output;
}

async function getSizes() {
	const result = new Map();
	await Promise.all(sizeLimitConfig.map(async file => {
		const [res] = await sizeLimit([filePlugin], [file.path]);
		result.set(file.path, res.size);
	}));

	return result;
}

function formatNumber(val) {
	return val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
}

function formatSizeChange(val) {
	return val > 0 ? `+${bytes(val)}` : bytes(val);
}

function formatChange(newSize, oldSize) {
	const diff = newSize - oldSize;
	const diffInPercent = ((newSize - oldSize) / oldSize) * 100;
	return `${formatSizeChange(diff)} (${formatNumber(diffInPercent)}%)`;
}

async function main() {
	fixMaxListenersExceededWarning();

	let headRev = runForOutput('git rev-parse --abbrev-ref HEAD');
	if (headRev.length === 0 || headRev === 'HEAD') {
		headRev = runForOutput('git rev-parse HEAD');
	}

	const revToCheck = runForOutput(`git merge-base origin/master "${headRev}"`);

	console.log(`Using "${revToCheck}" as base\n`);

	console.log(`Switching to ${revToCheck}`);
	runForSuccess(`git checkout ${revToCheck}`);

	console.log(`Installing dependencies...`);
	runForSuccess(`npm install`);

	console.log(`Building the library...`);
	runForSuccess(`npm run build:prod`);

	const oldSizes = await getSizes();

	console.log(`\nSwitching back to ${headRev}`);
	runForSuccess(`git checkout ${headRev}`);

	console.log(`Installing dependencies...`);
	runForSuccess(`npm install`);

	console.log(`Building the library...`);
	runForSuccess(`npm run build:prod`);

	const newSizes = await getSizes();

	const output = [];
	newSizes.forEach((size, path) => {
		output.push(`${path}: ${bytes(size)}, ${formatChange(size, oldSizes.get(path))}`);
	});
	console.log(`\nResults:\n${output.sort().map(s => `- ${s}`).join('\n')}`);
}

if (require.main === module) {
	main();
}
