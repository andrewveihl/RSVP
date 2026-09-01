/**
 * Runs both dev servers at once, so `npm run dev:all` is enough to see the guest site
 * and the admin panel side by side against one database.
 *
 * They are separate processes rather than one Vite instance with two roots: that is
 * how they run in production, and a bug that only shows up when the apps share a
 * process is a bug this script would hide.
 */
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const children = ['app', 'admin'].map((workspace) =>
	spawn(npm, ['run', 'dev', '-w', workspace], { stdio: 'inherit', shell: process.platform === 'win32' })
);

const stopAll = () => {
	for (const child of children) child.kill();
};

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

for (const child of children) {
	// If either server dies, take the other down too rather than leaving half a
	// deployment running and looking healthy.
	child.on('exit', (code) => {
		stopAll();
		process.exit(code ?? 0);
	});
}
