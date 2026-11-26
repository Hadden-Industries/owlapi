import { expect, test } from "@jest/globals";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkoutGitEnvironment } from "./release-git-environment.mjs";
import {
  readRetentionGitCommits,
  readRetentionVersionTags,
} from "./release-history-checkpoint.mjs";

function withGitObjects(inspect) {
  const root = realpathSync(tmpdir());
  const directory = mkdtempSync(join(root, "owlapi-retention-git-"));
  try {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !/^GIT_/iu.test(name)),
    );
    const git = (args, input) =>
      execFileSync("git", args, {
        cwd: directory,
        env,
        input,
        stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        encoding: "utf8",
        windowsHide: true,
        timeout: 30_000,
      }).trim();
    git(["init", "--bare", "--quiet", "--object-format=sha1", "--template="]);
    const hashObject = (type, input, malformed = false) =>
      git(
        [
          "hash-object",
          "-t",
          type,
          "-w",
          "--stdin",
          ...(malformed ? ["--literally"] : []),
        ],
        input,
      );
    const tree = hashObject("tree", "");
    const writeCommit = (parents, message, malformed = false) =>
      hashObject(
        "commit",
        [
          "tree " + tree,
          ...parents.map((parent) => "parent " + parent),
          "author Test Author <test@example.test> 1770000000 +0000",
          "committer Test Author <test@example.test> 1770000000 +0000",
          "",
          message,
          "",
        ].join("\n"),
        malformed,
      );
    const writeTag = (name, commit, message) =>
      hashObject(
        "tag",
        [
          "object " + commit,
          "type commit",
          "tag " + name,
          "tagger Test Author <test@example.test> 1770000000 +0000",
          "",
          message,
          "",
        ].join("\n"),
      );
    inspect({ directory, git, tree, hashObject, writeCommit, writeTag });
  } finally {
    assert.equal(dirname(realpathSync(directory)), root);
    rmSync(directory, { recursive: true, force: true });
  }
}

test("raw Git parents survive a shallow boundary and commit-like message text", () => {
  withGitObjects(({ directory, git, writeCommit }) => {
    const base = writeCommit([], "Main before landing");
    const source = writeCommit([base], "Proposed release producer");
    const landing = writeCommit(
      [base, source],
      ["Release notes — ready", "parent " + base, source + " commit 20"].join(
        "\n",
      ),
    );
    expect(git(["rev-list", "--parents", "--max-count=1", landing])).toBe(
      `${landing} ${base} ${source}`,
    );
    writeFileSync(join(directory, "shallow"), landing + "\n");
    expect(git(["rev-list", "--parents", "--max-count=1", landing])).toBe(
      landing,
    );

    const records = readRetentionGitCommits([landing, source, base], {
      directory,
    });
    expect(records).toHaveLength(3);
    expect(records).toEqual(
      expect.arrayContaining([
        { sha: landing, parents: [{ sha: base }, { sha: source }] },
        { sha: source, parents: [{ sha: base }] },
        { sha: base, parents: [] },
      ]),
    );
  });
});

test.each(["missing object", "tree object", "invalid SHA", "malformed parent"])(
  "a %s stops claim verification for the batch",
  (variant) => {
    withGitObjects(({ directory, tree, writeCommit }) => {
      const good = writeCommit([], "Known Git commit");
      const invalid =
        variant === "malformed parent"
          ? writeCommit(["not-a-sha"], "Invalid parent", true)
          : {
              "missing object": "9".repeat(40),
              "tree object": tree,
              "invalid SHA": "HEAD",
            }[variant];
      expect(() =>
        readRetentionGitCommits([good, invalid], { directory }),
      ).toThrow();
    });
  },
);

test("bare annotated version objects peel to their actual commits", () => {
  withGitObjects(({ directory, writeCommit, writeTag }) => {
    const base = writeCommit([], "Base release");
    const landing = writeCommit([base], "Next release");
    const first = writeTag("v0.1.0", base, "Initial release");
    const second = writeTag("v0.2.0", landing, "Next release\nobject " + base);
    const tags = [
      { tag: "v0.1.0", objectId: first },
      { tag: "v0.2.0", objectId: second },
    ];

    expect(readRetentionVersionTags(tags, { directory })).toEqual([
      { ...tags[0], commit: base },
      { ...tags[1], commit: landing },
    ]);
    expect(() =>
      readRetentionVersionTags([{ tag: "v0.2.0", objectId: landing }], {
        directory,
      }),
    ).toThrow(/annotated tag/i);
  });
});

test("only the leading Git parent headers describe a merge", () => {
  withGitObjects(({ directory, git, tree, hashObject, writeCommit }) => {
    const base = writeCommit([], "Before landing");
    const head = writeCommit([base], "PR producer");
    const extra = writeCommit([], "Another commit");
    const landing = hashObject(
      "commit",
      [
        "tree " + tree,
        "parent " + base,
        "parent " + head,
        "author Test Author <test@example.test> 1770000000 +0000",
        "committer Test Author <test@example.test> 1770000000 +0000",
        "parent " + extra,
        "",
        "Imported commit",
        "",
      ].join("\n"),
      true,
    );
    expect(git(["rev-list", "--parents", "--max-count=1", landing])).toBe(
      landing + " " + base + " " + head,
    );
    expect(readRetentionGitCommits([landing], { directory })).toEqual([
      { sha: landing, parents: [{ sha: base }, { sha: head }] },
    ]);
  });
});

test("inherited repository and object-store selectors cannot redirect retention Git reads", () => {
  withGitObjects(({ directory, writeCommit, writeTag }) => {
    const commit = writeCommit([], "Selected repository");
    const tag = {
      tag: "v0.2.0",
      objectId: writeTag("v0.2.0", commit, "Selected release"),
    };
    withGitObjects(({ directory: other }) => {
      const overrides = {
        GIT_DIR: other,
        GIT_COMMON_DIR: other,
        GIT_OBJECT_DIRECTORY: join(other, "objects"),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: join(directory, "empty-global-config"),
        GIT_TEST_ASSUME_DIFFERENT_OWNER: "1",
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "safe.directory",
        GIT_CONFIG_VALUE_0: directory.replaceAll("\\", "/"),
        GIT_CONFIG_PARAMETERS: "'core.abbrev'='12'",
      };
      const prior = new Map(
        Object.keys(overrides).map((key) => [key, process.env[key]]),
      );
      try {
        Object.assign(process.env, overrides);
        const child = {
          env: checkoutGitEnvironment(directory),
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        };
        const config = (key) =>
          execFileSync(
            "git",
            ["-C", directory, "config", "--get-all", key],
            child,
          ).trim();
        expect(config("safe.directory")).toBe(overrides.GIT_CONFIG_VALUE_0);
        expect(config("core.abbrev")).toBe("12");
        expect(() =>
          execFileSync("git", ["-C", other, "rev-parse", "--git-dir"], child),
        ).toThrow();
        expect(readRetentionGitCommits([commit], { directory })).toEqual([
          { sha: commit, parents: [] },
        ]);
        expect(readRetentionVersionTags([tag], { directory })).toEqual([
          { ...tag, commit },
        ]);
      } finally {
        for (const [key, value] of prior) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });
  });
});
