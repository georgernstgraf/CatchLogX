/**
 * Release identity shown on the About page (#176).
 *
 * The values are injected at build time by `next.config.ts`:
 * `NEXT_PUBLIC_APP_VERSION` from package.json, `NEXT_PUBLIC_GIT_SHA` from the
 * deployed commit. Delegated releases (#135) mean every build belongs to
 * exactly one commit, so the value baked in here is the deployed standing.
 */

export type ReleaseInfo = {
  version: string;
  commit: string | null;
};

const SHORT_SHA_LENGTH = 7;

function readEnv(env: Record<string, string | undefined>, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

// Exported for unit tests (#112).
export function readReleaseInfo(
  env: Record<string, string | undefined> = process.env
): ReleaseInfo {
  const version = readEnv(env, "NEXT_PUBLIC_APP_VERSION") ?? "dev";
  const commit = readEnv(env, "NEXT_PUBLIC_GIT_SHA");

  return {
    version,
    commit: commit ? commit.slice(0, SHORT_SHA_LENGTH) : null,
  };
}

// Exported for unit tests (#112).
export function formatReleaseLabel(info: ReleaseInfo): string {
  return info.commit ? `${info.version} · ${info.commit}` : info.version;
}
