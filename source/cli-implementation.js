#!/usr/bin/env node
// eslint-disable-next-line import/no-unassigned-import
import 'symbol-observable'; // Important: This needs to be first to prevent weird Observable incompatibilities
import logSymbols from 'log-symbols';
import meow from 'meow';
import updateNotifier from 'update-notifier';
import hasYarn from 'has-yarn';
import {gracefulExit} from 'exit-hook';
import config from './config.js';
import * as util from './util.js';
import * as git from './git-util.js';
import * as npm from './npm/util.js';
import Version from './version.js';
import ui from './ui.js';
import np from './index.js';

const cli = meow(`
	Usage
	  $ np <version>

	  Version can be:
	    ${Version.SEMVER_INCREMENTS.join(' | ')} | 1.2.3

	Options
	  --any-branch           Allow publishing from any branch
	  --branch               Name of the release branch (default: main | master)
	  --no-cleanup           Skips cleanup of node_modules
	  --no-tests             Skips tests
	  --yolo                 Skips cleanup and testing
	  --no-publish           Skips publishing
	  --preview              Show tasks without actually executing them
	  --tag                  Publish under a given dist-tag
	  --no-yarn              Don't use Yarn
	  --contents             Subdirectory to publish
	  --no-release-draft     Skips opening a GitHub release draft
	  --release-draft-only   Only opens a GitHub release draft for the latest published version
	  --test-script          Name of npm run script to run tests before publishing (default: test)
	  --no-2fa               Don't enable 2FA on new packages (not recommended)
	  --message              Version bump commit message, '%s' will be replaced with version (default: '%s' with npm and 'v%s' with yarn)

	Examples
	  $ np
	  $ np patch
	  $ np 1.0.2
	  $ np 1.0.2-beta.3 --tag=beta
	  $ np 1.0.2-beta.3 --tag=beta --contents=dist
`, {
	importMeta: import.meta,
	booleanDefault: undefined,
	flags: {
		anyBranch: {
			type: 'boolean',
		},
		branch: {
			type: 'string',
		},
		cleanup: {
			type: 'boolean',
		},
		tests: {
			type: 'boolean',
		},
		yolo: {
			type: 'boolean',
		},
		publish: {
			type: 'boolean',
		},
		releaseDraft: {
			type: 'boolean',
		},
		releaseDraftOnly: {
			type: 'boolean',
		},
		tag: {
			type: 'string',
		},
		yarn: {
			type: 'boolean',
		},
		contents: {
			type: 'string',
		},
		preview: {
			type: 'boolean',
		},
		testScript: {
			type: 'string',
		},
		'2fa': {
			type: 'boolean',
		},
		message: {
			type: 'string',
		},
	},
});

updateNotifier({pkg: cli.pkg}).notify();

try {
	const {pkg, rootDir} = await util.readPkg(cli.flags.contents);

	const defaultFlags = {
		cleanup: true,
		tests: true,
		publish: true,
		releaseDraft: true,
		yarn: hasYarn(),
		'2fa': true,
	};

	const localConfig = await config(rootDir);

	const flags = {
		...defaultFlags,
		...localConfig,
		...cli.flags,
	};

	// Workaround for unintended auto-casing behavior from `meow`.
	if ('2Fa' in flags) {
		flags['2fa'] = flags['2Fa'];
	}

	const runPublish = !flags.releaseDraftOnly && flags.publish && !pkg.private;

	const availability = flags.publish ? await npm.isPackageNameAvailable(pkg) : {
		isAvailable: false,
		isUnknown: false,
	};

	// Use current (latest) version when 'releaseDraftOnly', otherwise use the first argument.
	const version = flags.releaseDraftOnly ? pkg.version : (cli.input.length > 0 ? cli.input[0] : false);

	const branch = flags.branch || await git.defaultBranch();
	const options = await ui({
		...flags,
		availability,
		version,
		runPublish,
		branch,
	}, {pkg, rootDir});

	if (!options.confirm) {
		gracefulExit();
	}

	console.log(); // Prints a newline for readability
	const newPkg = await np(options.version, options, {pkg, rootDir});

	if (options.preview || options.releaseDraftOnly) {
		gracefulExit();
	}

	console.log(`\n ${newPkg.name} ${newPkg.version} published 🎉`);
} catch (error) {
	console.error(`\n${logSymbols.error} ${error.message}`);
	gracefulExit(1);
}
