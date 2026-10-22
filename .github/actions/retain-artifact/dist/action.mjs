import { a as freezePayload, c as hashBytes, g as setOutput, h as setFailed, i as assertWorkspacePath, l as selectArtifactGroups, m as info, n as retainArtifact, o as inspectArchive, p as getInput, r as assertSameManifest, s as materializeArchive, u as artifact_transport_policy_default } from "./transport-CaMJ0f3m.mjs";
import { crc32 } from "node:zlib";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as setTimeout$1 } from "node:timers/promises";
import { fork } from "node:child_process";
//#region tooling/artifact-transport/collection.mjs
/** Collect verified copies with bounded downloads and newly owned output. */
async function collectArtifacts({ adapter, groups, workspace, path, temporary, exact, controls, report = () => {}, onPhase = () => {}, now = () => performance.now() }) {
	const guard = () => {
		controls.signal?.throwIfAborted();
		if (now() >= controls.deadline) throw new Error("Artifact collection deadline exceeded");
	};
	guard();
	const base = await realpath(workspace);
	const output = resolve(base, path);
	await assertWorkspacePath(base, output, { allowMissing: true });
	const collection = join(temporary, "collection");
	if (!exact) await mkdir(collection);
	let downloadedBytes = 0;
	let collectedBytes = 0;
	let collectedFiles = 0;
	for (const [logical, copies] of groups) {
		guard();
		report({
			artifactTransport: artifact_transport_policy_default.version,
			operation: "collect",
			logical,
			physicalNames: copies.map((copy) => copy.name)
		});
		let expected;
		for (const copy of copies) {
			guard();
			if (!Number.isSafeInteger(copy.size) || copy.size < 1 || copy.size > artifact_transport_policy_default.maximumArchiveBytes || downloadedBytes + copy.size > artifact_transport_policy_default.maximumCollectionDownloadBytes) throw new Error("Artifact collection download budget exceeded");
			downloadedBytes += copy.size;
			onPhase("verify-transport-copy");
			const recovered = await adapter.inspect(copy, controls);
			try {
				guard();
				if (expected) assertSameManifest(expected, recovered.manifest);
				else {
					expected = recovered.manifest;
					collectedFiles += expected.length;
					collectedBytes += expected.reduce((sum, file) => sum + file.bytes, 0);
					if (collectedFiles > artifact_transport_policy_default.maximumFiles || collectedBytes > artifact_transport_policy_default.maximumPayloadBytes) throw new Error("Complete artifact collection exceeds payload policy");
					const archive = inspectArchive(await readFile(recovered.archivePath), crc32);
					assertSameManifest(expected, archive.manifest);
					onPhase("materialize-verified-payload");
					await materializeArchive(archive.files, exact ? collection : join(collection, logical), controls);
				}
			} finally {
				await recovered.dispose();
			}
		}
	}
	guard();
	onPhase("publish-verified-payload");
	await assertWorkspacePath(base, output, { allowMissing: true });
	await mkdir(dirname(output), { recursive: true });
	await assertWorkspacePath(base, output, { allowMissing: true });
	await mkdir(output);
	for (const name of await readdir(collection)) {
		guard();
		await cp(join(collection, name), join(output, name), {
			recursive: true,
			force: false,
			errorOnExist: true
		});
	}
	guard();
}
//#endregion
//#region tooling/artifact-transport/sdk-adapter.mjs
/** Supported SDK operations execute in a cancellable, deadline-bound child process. */
function createSdkAdapter({ worker, temporary }) {
	const call = (operation, args, { deadline, signal }) => new Promise((resolve, reject) => {
		signal?.throwIfAborted();
		const remaining = deadline - performance.now();
		if (remaining <= 0) {
			reject(/* @__PURE__ */ new Error("Artifact deadline exceeded"));
			return;
		}
		const child = fork(worker, [], {
			stdio: [
				"ignore",
				"inherit",
				"inherit",
				"ipc"
			],
			execArgv: []
		});
		let settled = false;
		const timer = setTimeout(() => finish(/* @__PURE__ */ new Error("Artifact deadline exceeded")), remaining);
		function finish(error, result) {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			child.once("close", () => {
				if (error) reject(error);
				else resolve(result);
			});
			child.kill();
		}
		function abort() {
			finish(/* @__PURE__ */ new Error("Artifact operation cancelled"));
		}
		signal?.addEventListener("abort", abort, { once: true });
		child.on("message", (message) => {
			if (message.ok) finish(null, message.result);
			else {
				const error = /* @__PURE__ */ new Error(`Artifact SDK ${operation} failed; disposition=${message.classification?.phase ?? "unknown"}`);
				if (message.classification?.eligible) {
					error.name = "NetworkError";
					error.code = message.classification.code;
				}
				finish(error);
			}
		});
		child.on("error", () => finish(/* @__PURE__ */ new Error("Artifact SDK worker could not start")));
		child.on("exit", () => finish(/* @__PURE__ */ new Error("Artifact SDK worker exited without a valid result")));
		child.send({
			operation,
			args
		});
	});
	return {
		upload: (name, snapshot, options, controls) => call("upload", {
			name,
			files: snapshot.files,
			root: snapshot.root,
			options: {
				retentionDays: options.retentionDays,
				compressionLevel: options.compressionLevel
			}
		}, controls),
		list: (controls) => call("list", {}, controls),
		inspect: async (artifact, controls) => {
			const directory = await mkdtemp(join(temporary, "download-"));
			try {
				return {
					...await call("inspect", {
						artifact,
						directory
					}, controls),
					dispose: () => rm(directory, {
						recursive: true,
						force: true
					})
				};
			} catch (error) {
				await rm(directory, {
					recursive: true,
					force: true
				});
				throw error;
			}
		},
		probe: () => call("probe", {}, { deadline: performance.now() + artifact_transport_policy_default.deadlineMilliseconds })
	};
}
//#endregion
//#region tooling/artifact-transport/action.mjs
/** Shared action entry for immutable uploads and logical-coordinate collection. */
var controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
var temporary;
var phase = "prepare";
var collect = getInput("mode") === "collect";
var deadline = performance.now() + (collect ? artifact_transport_policy_default.collectionDeadlineMilliseconds : artifact_transport_policy_default.deadlineMilliseconds);
try {
	temporary = await mkdtemp(join(process.env.RUNNER_TEMP, "owlapi-artifact-"));
	const adapter = createSdkAdapter({
		worker: join(import.meta.dirname, "sdk-worker.mjs"),
		temporary
	});
	const run = process.env.GITHUB_RUN_ID;
	const attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
	if (collect) {
		phase = "select-logical-artifacts";
		const controls = {
			deadline,
			signal: controller.signal
		};
		await collectArtifacts({
			adapter,
			groups: selectArtifactGroups(await adapter.list(controls), {
				name: getInput("name"),
				pattern: getInput("pattern"),
				run,
				attempt
			}),
			workspace: process.env.GITHUB_WORKSPACE,
			path: getInput("path", { required: true }),
			temporary,
			exact: Boolean(getInput("name")),
			controls,
			report: (event) => info(JSON.stringify(event)),
			onPhase: (value) => {
				phase = value;
			}
		});
	} else {
		phase = "freeze-payload";
		const logical = getInput("name", { required: true });
		const snapshot = await freezePayload({
			paths: getInput("path", { required: true }),
			workspace: process.env.GITHUB_WORKSPACE,
			destination: join(temporary, "snapshot"),
			signal: controller.signal,
			deadline
		});
		phase = "retain-frozen-payload";
		const result = await retainArtifact({
			adapter,
			deadline,
			snapshot,
			scope: {
				logical,
				run,
				attempt,
				producer: hashBytes(`${process.env.GITHUB_JOB}\n${logical}`).slice(0, 16),
				invocation: randomUUID().replaceAll("-", "")
			},
			options: {
				retentionDays: Number(getInput("retention-days")),
				compressionLevel: Number(getInput("compression-level") || artifact_transport_policy_default.defaultCompressionLevel)
			},
			signal: controller.signal,
			sleep: (milliseconds, signal) => setTimeout$1(milliseconds, void 0, { signal }),
			report: (event) => info(JSON.stringify({
				artifactTransport: artifact_transport_policy_default.version,
				...event
			}))
		});
		const url = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${run}/artifacts/${result.id}`;
		setOutput("artifact-id", result.id);
		setOutput("artifact-digest", result.digest);
		setOutput("artifact-url", url);
		setOutput("artifact-name", result.name);
	}
} catch (error) {
	const code = typeof error.code === "string" && /^[A-Z0-9_]{1,60}$/u.test(error.code) ? error.code : "UNKNOWN";
	setFailed(`Artifact transport failed closed during ${phase} (${code}); see bounded operation dispositions above.`);
} finally {
	if (temporary) await rm(temporary, {
		recursive: true,
		force: true
	});
}
//#endregion
export {};
